import { readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { Hono, type Context } from 'hono';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';
import type {
  AttentionItem,
  BackupSettingsResponse,
  BackupTestResponse,
  BackupsResponse,
  ModrinthListResponse,
  ModrinthSearchHit,
  PlayerAction,
  PlayerRef,
  PlayersResponse,
  SaveSettingsResponse,
  SettingsResponse,
  SnapshotInfo,
  StatusResponse,
  WorldOverviewResponse,
} from '../shared/api.ts';
import { GAMERULES_BY_NAME, validateGameRuleValue } from '../shared/gamerules.ts';
import { parseModrinthEntry, type ModrinthEntry } from '../shared/modrinth.ts';
import { LOCALES, PT, messages, type Messages } from '../shared/i18n/index.ts';
import { SETTINGS_BY_KEY, WORLD_BASE_KEYS, fieldText, loaderForType, parseMemory, validateSetting } from '../shared/settings.ts';
import { parseSeed, worldBlockReason, worldNameError, worldSettingsErrors, type WorldsResponse } from '../shared/worlds.ts';
import { isServerType, javaFromImage, requiredJava, type ServerType, type VersionsResponse } from '../shared/versions.ts';
import { BACKUP_PROVIDERS, validateBackupSettings } from '../shared/backup-destination.ts';
import { explainBackupError } from './backup-config.ts';
import { requestLocale, requestMessages } from './i18n.ts';
import { fetchVersions, type RawVersion } from './versions.ts';

/** Destino de backup inacessível ou recusado: erro do usuário, não do painel. */
class BackupDestinationError extends Error {}
/** Mundo pedido na tela que não existe mais (renomeado ou apagado em outra aba). */
class NotFoundError extends Error {}
import { ValidationError } from './config-store.ts';
import type { Services } from './context.ts';
import { ConflictError, type JobContext } from './jobs.ts';
import { ARCHIVE_DIR } from './worlds.ts';
import { parseGameRuleQuery, parseList, parseTps, readGameRules, serverNameFor, setGameRule } from './minecraft.ts';
import { RconError } from './rcon.ts';
import { registerWorldTransfer } from './world-transfer.ts';
import { registerGate } from './gate-panel.ts';

/** JVM precisa de memória fora da heap (metaspace, threads, buffers de rede). */
const JVM_OVERHEAD_BYTES = 768 * 1024 ** 2;
const PLAYER_NAME = /^\.?[A-Za-z0-9_]{1,32}$/;

export function apiRoutes(services: Services): Hono {
  const { docker, rcon, restic, backupConfig, store, operations, jobs, config, worlds, profiles } = services;
  const api = new Hono();

  const cached = cache<SnapshotInfo[]>(60_000, () => restic.snapshots());
  // Aquece a lista de backups ao subir: a primeira leitura do restic leva ~0,7s.
  void cached.get().catch(() => undefined);

  // --- Mundo que a tela está mostrando ------------------------------------------------------------
  // O ligado usa config/ e as listas da raiz de /data; um guardado usa o perfil dele (world-profile.ts).
  const activeWorld = (values: Record<string, string>) => values.LEVEL || 'world';

  const scope = async (c: Context) => {
    const { values } = await store.readSettings();
    const active = activeWorld(values);
    const folder = c.req.query('world') || active;
    if (folder === active) return { folder, active: true, inherited: false, read: store, accessDir: config.DATA_DIR };
    if (!(await worlds.exists(folder).catch(() => false))) {
      throw new NotFoundError(requestMessages(c).server.worldNotFound);
    }
    const own = await profiles.hasProfile(folder);
    return {
      folder,
      active: false,
      // Sem perfil ainda: mostra a configuração em uso, que ele herda ao ser salvo ou ligado.
      inherited: !own,
      read: own ? profiles.store(folder) : store,
      accessDir: own ? profiles.accessDir(folder) : config.DATA_DIR,
    };
  };

  /** Onde gravar para o mundo da tela; um guardado sem perfil ganha um (cópia do em uso) antes. */
  const writableStore = async (target: Awaited<ReturnType<typeof scope>>) => {
    if (target.active) return store;
    await profiles.ensure(target.folder);
    return profiles.store(target.folder);
  };

  api.onError((err, c) => {
    const m = requestMessages(c);
    if (err instanceof ValidationError) return c.json({ error: m.server.invalidValues, fields: err.fields }, 400);
    if (err instanceof ConflictError) return c.json({ error: err.message }, 409);
    if (err instanceof BackupDestinationError) return c.json({ error: err.message }, 422);
    if (err instanceof NotFoundError) return c.json({ error: err.message }, 404);
    if (err instanceof z.ZodError) return c.json({ error: m.server.invalidRequest, issues: err.issues }, 400);
    // Servidor parado é um estado esperado, não um erro do painel: sem stack trace no log.
    if (err instanceof RconError) return c.json({ error: m.server.rconOffline }, 503);
    console.error(err);
    return c.json({ error: err.message }, 500);
  });

  // --- Status ---------------------------------------------------------------------
  api.get('/status', async (c) => {
    const { values } = await store.readSettings();
    const [server, backup, gate] = await Promise.all([
      docker.info('server'),
      docker.info('backup').catch(() => ({ state: 'missing' as const })),
      docker.info('gate').catch(() => ({ state: 'missing' as const })),
    ]);
    // Nunca espera o restic: usa o que já está em cache e atualiza em segundo plano.
    const snapshots = cached.peek() ?? [];
    const { settings: backupSettings } = await backupConfig.settings();

    const status: StatusResponse = {
      server,
      backup,
      gate,
      game: { type: values.TYPE ?? 'VANILLA', version: values.VERSION ?? 'LATEST', motd: values.MOTD ?? '' },
      lastBackup: snapshots[0],
      backupProvider: backupSettings.destination.provider,
      attention: [],
      join: { publicAddress: config.PUBLIC_ADDRESS || undefined, port: config.MC_PORT },
      world: activeWorld(values),
    };

    if (server.state === 'running') {
      const [resources, list, tps] = await Promise.all([
        docker.stats('server').catch(() => null),
        rcon.command('list').catch(() => ''),
        loaderForType(values.TYPE) === 'paper' ? rcon.command('tps').catch(() => '') : Promise.resolve(''),
      ]);
      status.resources = resources ?? undefined;
      status.players = parseList(list) ?? undefined;
      status.tps = parseTps(tps);
    }
    status.attention = attentionItems(status, cached.peek() !== undefined, requestMessages(c));
    return c.json(status);
  });

  api.post('/server/:action{start|stop|restart}', async (c) => {
    const action = c.req.param('action') as 'start' | 'stop' | 'restart';
    if (action !== 'start') {
      const { say } = requestMessages(c).server;
      await rcon.command(`say ${action === 'stop' ? say.stop : say.restart}`).catch(() => undefined);
    }
    await docker.action('server', action);
    return c.json({ ok: true });
  });

  // --- Configurações ----------------------------------------------------------------
  api.get('/settings', async (c) => {
    const target = await scope(c);
    const [settings, server] = await Promise.all([target.read.readSettings(), docker.inspect('server').catch(() => null)]);
    const body: SettingsResponse = {
      ...settings,
      memoryLimitBytes: server?.memoryLimit || undefined,
      world: { folder: target.folder, active: target.active, inherited: target.inherited },
    };
    return c.json(body);
  });

  const saveSettingsBody = z.object({
    values: z.record(z.string(), z.string()),
    apply: z.enum(['none', 'restart', 'backup-and-restart']).default('none'),
  });

  api.put('/settings', async (c) => {
    const m = requestMessages(c);
    const body = saveSettingsBody.parse(await c.req.json());

    const memory = body.values.MEMORY;
    if (memory) {
      const heap = parseMemory(memory);
      const server = await docker.inspect('server').catch(() => null);
      if (heap && server?.memoryLimit && heap + JVM_OVERHEAD_BYTES > server.memoryLimit) {
        const limitGb = (server.memoryLimit / 1024 ** 3).toFixed(1);
        throw new ValidationError({ MEMORY: m.server.memoryOverLimit(limitGb) });
      }
    }

    const target = await scope(c);
    // Mundo já gerado: recusa tipo ou versão que não abrem o mapa dele. A tela avisa antes;
    // isto garante que nenhum caminho (API, outra aba) deixe o servidor caindo ao ligar.
    if ('TYPE' in body.values || 'VERSION' in body.values) {
      const { world } = await findWorld(target.folder);
      if (world?.generated) {
        const current = (await target.read.readSettings()).values;
        const problems = worldSettingsErrors(world, { ...current, ...body.values }, current, m);
        if (Object.keys(problems).length > 0) throw new ValidationError(problems);
      }
    }
    const changed = await (await writableStore(target)).updateSettings(body.values, m);
    const response: SaveSettingsResponse = { changed };

    // Mundo guardado: a mudança fica no perfil dele e só vale quando ele for ligado.
    if (body.apply !== 'none' && target.active) {
      const job = await jobs.start('apply-settings', async (ctx) => {
        if (changed.length > 0) ctx.log(m.server.job.changed(changed.map((k) => fieldText(k, m).label).join(', ')));
        const server = await docker.inspect('server');
        if (body.apply === 'backup-and-restart' && server?.state === 'running') {
          await operations.backup({ ...ctx, progress: (p) => ctx.progress(p * 0.8) }, 'pre-config-change');
        }
        await rcon.command(`say ${m.server.say.applying}`).catch(() => undefined);
        ctx.log(m.server.job.restarting);
        await docker.action('server', server?.state === 'running' ? 'restart' : 'start');
        cached.invalidate();
      }, requestLocale(c));
      response.jobId = job.id;
    }
    return c.json(response);
  });

  // --- Versões disponíveis ---------------------------------------------------------------
  // Uma hora de cache por software: as listas mudam poucas vezes por semana e as
  // APIs oficiais não precisam de uma chamada a cada abertura da página.
  const versionLists = new Map<ServerType, ReturnType<typeof cache<RawVersion[]>>>();

  api.get('/versions', async (c) => {
    const type = (c.req.query('type') ?? '').toUpperCase();
    if (!isServerType(type)) return c.json({ error: requestMessages(c).server.invalidServerType }, 400);

    let list = versionLists.get(type);
    if (!list) versionLists.set(type, (list = cache(60 * 60_000, () => fetchVersions(type))));

    const server = await docker.info('server').catch(() => null);
    const body: VersionsResponse = { type, imageJava: javaFromImage(server?.image), latest: null, versions: [] };
    try {
      const raw = await list.get();
      body.versions = raw.map((v) => ({ ...v, java: requiredJava(v.id) }));
      body.latest = raw.find((v) => v.stable)?.id ?? null;
    } catch (err) {
      body.error = (err as Error).message;
    }
    return c.json(body);
  });

  // --- Regras de jogo -----------------------------------------------------------------
  api.get('/gamerules', async (c) => {
    const target = await scope(c);
    if (target.active) return c.json(await readGameRules(rcon));
    // Mundo guardado: as regras gravadas no mapa dele, só para ver.
    const stored = await worlds.readGameRules(target.folder);
    if (!stored) throw new NotFoundError(requestMessages(c).server.rulesAfterFirstStart);
    return c.json(stored);
  });

  api.put('/gamerules/:name', async (c) => {
    const m = requestMessages(c);
    if (!(await scope(c)).active) return c.json({ error: m.server.turnOnForRules }, 409);
    const rule = GAMERULES_BY_NAME.get(c.req.param('name'));
    if (!rule) return c.json({ error: m.server.unknownRule }, 404);
    const { value } = z.object({ value: z.string() }).parse(await c.req.json());
    const error = validateGameRuleValue(rule, value, m);
    if (error) return c.json({ error }, 400);

    const naming = parseGameRuleQuery(await rcon.command('gamerule keep_inventory')) !== null ? 'modern' : 'legacy';
    const serverName = serverNameFor(rule, naming);
    if (!serverName) return c.json({ error: m.server.ruleUnsupported }, 400);
    return c.json({ output: await setGameRule(rcon, serverName, value) });
  });

  // --- Jogadores ------------------------------------------------------------------------
  api.get('/players', async (c) => {
    const target = await scope(c);
    const server = await docker.info('server');
    // Quem está jogando só existe no mundo ligado; num guardado aparecem as listas guardadas com ele.
    const list = target.active && server.state === 'running' ? parseList(await rcon.command('list').catch(() => '')) : null;
    const [whitelist, ops, banned] = await Promise.all([
      readJsonList<PlayerRef>(join(target.accessDir, 'whitelist.json')),
      readJsonList<PlayerRef & { level?: number }>(join(target.accessDir, 'ops.json')),
      readJsonList<PlayerRef & { reason?: string; expires?: string }>(join(target.accessDir, 'banned-players.json')),
    ]);
    const body: PlayersResponse = {
      whitelistEnabled: (await target.read.readSettings()).values.ENABLE_WHITELIST === 'true',
      worldActive: target.active,
      serverOnline: list !== null,
      online: list?.names ?? [],
      max: list?.max ?? 0,
      whitelist: whitelist.map(({ name, uuid }) => ({ name, uuid })),
      ops: ops.map(({ name, uuid, level }) => ({ name, uuid, level })),
      banned: banned.map(({ name, uuid, reason, expires }) => ({ name, uuid, reason, expires })),
      join: { publicAddress: config.PUBLIC_ADDRESS || undefined, port: config.MC_PORT },
    };
    return c.json(body);
  });

  // Esquema montado por pedido: a mensagem de nome inválido sai na língua de quem pediu.
  const playerActionBody = (m: Messages) =>
    z.object({
      action: z.enum(['whitelist-add', 'whitelist-remove', 'op', 'deop', 'kick', 'ban', 'pardon']),
      name: z.string().regex(PLAYER_NAME, m.server.invalidPlayerName),
      reason: z.string().max(200).optional(),
    });

  api.post('/players', async (c) => {
    const m = requestMessages(c);
    if (!(await scope(c)).active) return c.json({ error: m.server.turnOnForPlayers }, 409);
    const { action, name, reason } = playerActionBody(m).parse(await c.req.json());
    const suffix = reason ? ` ${reason.replace(/[\r\n]/g, ' ')}` : '';
    const commands: Record<PlayerAction, string> = {
      'whitelist-add': `whitelist add ${name}`,
      'whitelist-remove': `whitelist remove ${name}`,
      op: `op ${name}`,
      deop: `deop ${name}`,
      kick: `kick ${name}${suffix}`,
      ban: `ban ${name}${suffix}`,
      pardon: `pardon ${name}`,
    };
    return c.json({ output: await rcon.command(commands[action]) });
  });

  // "Só convidados podem entrar": grava no server.env (vale após reiniciar) e, com o
  // servidor ligado, aplica na hora via /whitelist on|off para não exigir reinício.
  api.put('/players/whitelist', async (c) => {
    const { enabled } = z.object({ enabled: z.boolean() }).parse(await c.req.json());
    const target = await scope(c);
    await (await writableStore(target)).updateSettings({ ENABLE_WHITELIST: String(enabled) });
    const appliedNow =
      target.active &&
      (await rcon
        .command(`whitelist ${enabled ? 'on' : 'off'}`)
        .then(() => true)
        .catch(() => false));
    return c.json({ enabled, appliedNow });
  });

  // --- Plugins e mods (Modrinth) --------------------------------------------------------------
  api.get('/modrinth', async (c) => {
    const target = await scope(c);
    const { values } = await target.read.readSettings();
    const loader = loaderForType(values.TYPE);
    const body: ModrinthListResponse = { loader, entries: loader ? await target.read.readModrinth(loader) : [] };
    return c.json(body);
  });

  api.put('/modrinth', async (c) => {
    const target = await scope(c);
    const { values } = await target.read.readSettings();
    const loader = loaderForType(values.TYPE);
    const m = requestMessages(c);
    if (!loader) return c.json({ error: m.server.noPluginsForType }, 400);

    const { entries } = z.object({ entries: z.array(z.string()) }).parse(await c.req.json());
    const parsed = entries.map((text) => ({ text, entry: parseModrinthEntry(text) }));
    const invalid = parsed.filter((p) => !p.entry).map((p) => p.text);
    if (invalid.length > 0) return c.json({ error: m.server.invalidEntries(invalid.join(', ')) }, 400);

    await (await writableStore(target)).writeModrinth(loader, parsed.map((p) => p.entry as ModrinthEntry));
    return c.json({ ok: true });
  });

  api.get('/modrinth/search', async (c) => {
    const query = c.req.query('q') ?? '';
    const { values } = await (await scope(c)).read.readSettings();
    const loader = loaderForType(values.TYPE);
    if (!loader) return c.json({ hits: [] });

    const facets: string[][] = [[`categories:${loader}`], ['server_side:required', 'server_side:optional']];
    if (values.VERSION && /^\d/.test(values.VERSION)) facets.push([`versions:${values.VERSION}`]);

    const url = new URL('https://api.modrinth.com/v2/search');
    url.searchParams.set('query', query);
    url.searchParams.set('limit', '20');
    url.searchParams.set('index', query ? 'relevance' : 'downloads');
    url.searchParams.set('facets', JSON.stringify(facets));

    const res = await fetch(url, { headers: { 'User-Agent': 'minetune-panel/0.1 (self-hosted)' } });
    if (!res.ok) return c.json({ error: requestMessages(c).server.modrinthStatus(res.status) }, 502);
    const data = (await res.json()) as {
      hits: { slug: string; title: string; description: string; icon_url?: string; downloads: number; author: string }[];
    };
    const hits: ModrinthSearchHit[] = data.hits.map((h) => ({
      slug: h.slug,
      title: h.title,
      description: h.description,
      iconUrl: h.icon_url || undefined,
      downloads: h.downloads,
      author: h.author,
    }));
    return c.json({ hits });
  });

  // --- Backups ---------------------------------------------------------------------------------
  api.get('/backups', async (c) => {
    const [{ settings, managedByPanel }, snapshots, repository] = await Promise.all([
      backupConfig.settings(),
      restic.snapshots(),
      restic.repositoryLabel(),
    ]);
    const body: BackupsResponse = {
      repository,
      provider: settings.destination.provider,
      schedule: settings.schedule,
      managedByPanel,
      snapshots,
    };
    cached.set(body.snapshots);
    return c.json(body);
  });

  // Destino, agenda e retenção (config/backup.env). O segredo nunca volta para o navegador.
  api.get('/backups/settings', async (c) => {
    const body: BackupSettingsResponse = await backupConfig.settings();
    return c.json(body);
  });

  const destinationSchema = z.object({
    provider: z.enum(BACKUP_PROVIDERS),
    accountId: z.string().max(64).default(''),
    endpoint: z.string().max(256).default(''),
    region: z.string().max(64).default(''),
    bucket: z.string().max(128).default(''),
    prefix: z.string().max(256).default(''),
    accessKeyId: z.string().max(256).default(''),
    repository: z.string().max(512).default(''),
  });
  const backupSettingsBody = z.object({
    destination: destinationSchema,
    schedule: z.object({
      interval: z.string().max(16),
      keepLast: z.number(),
      keepDaily: z.number(),
      keepWeekly: z.number(),
      keepMonthly: z.number(),
      pauseIfNoPlayers: z.boolean(),
      uploadLimitMb: z.number(),
    }),
    secretAccessKey: z.string().max(256).optional(),
  });

  /** Valida e devolve as variáveis candidatas e o estado do destino (ok/empty). */
  const checkBackupSettings = async (raw: unknown, m: Messages) => {
    const input = backupSettingsBody.parse(raw);
    const errors = validateBackupSettings(input, { hasSecret: await backupConfig.canKeepSecret(input) }, m);
    if (Object.keys(errors).length > 0) throw new ValidationError(errors);
    const env = await backupConfig.candidate(input);
    try {
      return { env, status: await restic.check(env) };
    } catch (err) {
      throw new BackupDestinationError(explainBackupError((err as Error).message, m));
    }
  };

  api.post('/backups/settings/test', async (c) => {
    const { status } = await checkBackupSettings(await c.req.json(), requestMessages(c));
    const body: BackupTestResponse = { status };
    return c.json(body);
  });

  api.put('/backups/settings', async (c) => {
    const m = requestMessages(c);
    const { env, status } = await checkBackupSettings(await c.req.json(), m);
    let initialized = false;
    if (status === 'empty') {
      try {
        await restic.init(env);
        initialized = true;
      } catch (err) {
        throw new BackupDestinationError(explainBackupError((err as Error).message, m));
      }
    }
    await backupConfig.save(env);
    cached.invalidate();

    // O agendador só relê o arquivo ao iniciar.
    const scheduler = await docker.info('backup').catch(() => null);
    const restartedScheduler = scheduler?.state === 'running';
    if (restartedScheduler) await docker.action('backup', 'restart', 30);
    return c.json({ restartedScheduler, initialized });
  });

  api.post('/backups', async (c) => {
    const job = await jobs.start(
      'backup',
      async (ctx) => {
        await operations.backup(ctx, 'manual');
        cached.invalidate();
      },
      requestLocale(c),
    );
    return c.json({ jobId: job.id }, 202);
  });

  api.post('/backups/:id/restore', async (c) => {
    const id = c.req.param('id');
    const { confirm, safetyBackup } = z
      .object({ confirm: z.string(), safetyBackup: z.boolean().default(true) })
      .parse(await c.req.json());
    // Aceita a palavra de qualquer língua: a tela pode ter trocado de idioma com o modal aberto.
    if (!LOCALES.some((locale) => messages(locale).backups.confirmWord === confirm)) {
      return c.json({ error: requestMessages(c).server.confirmIncorrect }, 400);
    }

    const job = await jobs.start(
      'restore',
      async (ctx) => {
        await operations.restore(ctx, id, { safetyBackup });
        cached.invalidate();
      },
      requestLocale(c),
    );
    return c.json({ jobId: job.id }, 202);
  });

  // --- Mundos ----------------------------------------------------------------------------------
  // Um mundo ligado por vez (LEVEL no server.env). Cada um leva a configuração dele (world-profile.ts).

  const findWorld = async (folder: string) => {
    const { values } = await store.readSettings();
    const world = (await worlds.list(activeWorld(values))).find((w) => w.folder === folder);
    return { values, world };
  };

  /** Configuração com que um mundo guardado vai rodar: a do perfil dele, ou a em uso se ainda não tem. */
  const storedWorldSettings = async (folder: string) =>
    ((await profiles.hasProfile(folder)) ? profiles.store(folder) : store).readSettings().then((s) => s.values);

  /**
   * Liga outro mundo: desliga o servidor, guarda a configuração em uso no mundo que sai,
   * copia a do mundo que entra e liga de novo. Se algo falhar no meio, volta para o anterior.
   */
  const activate = async (ctx: JobContext, from: string, to: string, name: string) => {
    const { server: t } = ctx.m ?? PT;
    const server = await docker.inspect('server');
    if (server?.state === 'running') {
      await rcon.command(`say ${t.say.switching(name)}`).catch(() => undefined);
      ctx.log(t.job.stopping);
      await docker.action('server', 'stop', 90);
    }
    let saved = false;
    try {
      ctx.log(t.job.savingConfig(basename(from)));
      await profiles.saveLive(from);
      saved = true;
      await profiles.ensure(to);
      await profiles.applyToLive(to);
      await store.updateSettings({ LEVEL: to });
      ctx.log(t.job.configInUse(name));
    } catch (err) {
      if (saved) {
        ctx.log(t.job.rollback(name, basename(from)));
        await profiles.applyToLive(from).catch(() => undefined);
        await store.updateSettings({ LEVEL: from }).catch(() => undefined);
      }
      throw err;
    } finally {
      ctx.log(t.job.starting);
      await docker.action('server', 'start').catch((e: Error) => ctx.log(t.job.startFailed(e.message)));
    }
  };

  // Dados de um mundo só dele (versão, mapa, listas), para o Início de um mundo guardado.
  api.get('/world-overview', async (c) => {
    const target = await scope(c);
    const { values } = await store.readSettings();
    const world = (await worlds.list(activeWorld(values))).find((w) => w.folder === target.folder);
    const m = requestMessages(c);
    if (!world) throw new NotFoundError(m.server.worldNotFound);
    const settings = (await target.read.readSettings()).values;
    world.serverType = settings.TYPE || undefined;
    world.serverVersion = settings.VERSION || undefined;
    const [whitelist, ops, banned] = await Promise.all([
      readJsonList<PlayerRef>(join(target.accessDir, 'whitelist.json')),
      readJsonList<PlayerRef>(join(target.accessDir, 'ops.json')),
      readJsonList<PlayerRef>(join(target.accessDir, 'banned-players.json')),
    ]);
    const body: WorldOverviewResponse = {
      world,
      counts: { whitelist: whitelist.length, ops: ops.length, banned: banned.length },
      whitelistEnabled: settings.ENABLE_WHITELIST === 'true',
      blockReason: target.active ? null : worldBlockReason(world, settings.VERSION || 'LATEST', settings.TYPE || 'VANILLA', m),
    };
    return c.json(body);
  });

  api.get('/worlds', async (c) => {
    const { values } = await store.readSettings();
    const active = activeWorld(values);
    const [list, server] = await Promise.all([worlds.list(active), docker.info('server')]);

    for (const world of list) {
      const settings = world.active ? values : await storedWorldSettings(world.folder);
      world.serverType = settings.TYPE || undefined;
      world.serverVersion = settings.VERSION || undefined;
    }

    // Nas 26.x a seed não fica no mundo: a do ligado vem do /seed e é anotada para quando ele estiver guardado.
    const current = list.find((w) => w.active);
    if (current && !current.seed && server.state === 'running') {
      const seed = parseSeed(await rcon.command('seed').catch(() => ''));
      if (seed) {
        current.seed = seed;
        await worlds.writeMeta(current.folder, { ...(await worlds.readMeta(current.folder)), seed }).catch(() => undefined);
      }
    }

    const body: WorldsResponse = {
      active,
      serverVersion: values.VERSION || 'LATEST',
      serverRunning: server.state === 'running',
      worlds: list,
      uploadMaxBytes: config.WORLD_UPLOAD_MAX_BYTES,
    };
    return c.json(body);
  });

  const levelTypes = new Set((SETTINGS_BY_KEY.get('LEVEL_TYPE')?.options ?? []).map((o) => o.value));

  api.post('/worlds', async (c) => {
    const body = z
      .object({
        name: z.string().max(64),
        seed: z.string().max(64).default(''),
        levelType: z.string().default(''),
        /** Mundo cuja configuração o novo herda (o que estava na tela). */
        from: z.string().default(''),
        activate: z.boolean().default(false),
        /** Versão, tipo de servidor e o resto de WORLD_BASE_KEYS; vazio = o que veio da base. */
        settings: z.record(z.string(), z.string()).default({}),
      })
      .parse(await c.req.json());
    const m = requestMessages(c);
    const name = body.name.trim();
    const nameError = worldNameError(name, m) ?? ((await worlds.exists(name)) ? m.server.nameTaken : null);
    if (nameError) throw new ValidationError({ name: nameError });
    // Valida tudo antes de criar a pasta: um erro aqui não deixa um mundo pela metade.
    const baseSettings: Record<string, string> = {};
    const settingErrors: Record<string, string> = {};
    for (const key of WORLD_BASE_KEYS) {
      const value = body.settings[key]?.trim();
      if (!value) continue;
      const message = validateSetting(SETTINGS_BY_KEY.get(key)!, value, m);
      if (message) settingErrors[key] = message;
      else baseSettings[key] = value;
    }
    if (Object.keys(settingErrors).length > 0) throw new ValidationError(settingErrors);

    const levelType = levelTypes.has(body.levelType) ? body.levelType : 'minecraft:normal';
    // Sem seed digitada, sorteia uma: sem isso o mundo novo herdaria a SEED do outro e sairia igual a ele.
    const seed = body.seed.trim() || crypto.getRandomValues(new BigInt64Array(1))[0]!.toString();

    const { values } = await store.readSettings();
    const current = activeWorld(values);
    const base = body.from && body.from !== current && (await profiles.hasProfile(body.from).catch(() => false)) ? body.from : null;
    if (base) await profiles.copyFrom(base, name);
    else await profiles.saveLive(name);
    // Herda versão, plugins e opções, mas não as pessoas: convidados e administradores são de cada mundo.
    await profiles.clearAccess(name);
    await profiles.store(name).updateSettings({ ...baseSettings, LEVEL: name, SEED: seed, LEVEL_TYPE: levelType });
    await worlds.writeMeta(name, { seed, levelType, createdAt: new Date().toISOString() });

    if (!body.activate) return c.json({ folder: name }, 201);
    const job = await jobs.start(
      'world-create',
      async (ctx) => {
        ctx.log(m.server.job.worldCreated(name, seed));
        await activate(ctx, current, name, name);
        ctx.log(m.server.job.mapGenerating);
      },
      requestLocale(c),
    );
    return c.json({ jobId: job.id, folder: name }, 202);
  });

  api.post('/worlds/activate', async (c) => {
    const { folder } = z.object({ folder: z.string() }).parse(await c.req.json());
    const m = requestMessages(c);
    const { values, world } = await findWorld(folder);
    if (!world) return c.json({ error: m.server.worldNotFoundShort }, 404);
    if (world.active) return c.json({ error: m.server.worldAlreadyOn }, 409);
    // Vale a versão configurada no próprio mundo: dá para ajustar um guardado antes de ligar.
    const stored = await storedWorldSettings(world.folder);
    const blockReason = worldBlockReason(world, stored.VERSION || 'LATEST', stored.TYPE || 'VANILLA', m);
    if (blockReason) return c.json({ error: blockReason }, 409);

    const job = await jobs.start(
      'world-switch',
      async (ctx) => {
        const to = await worlds.bringToRoot(world.folder, m);
        if (to !== world.folder) ctx.log(m.server.job.leftArchive(world.name, ARCHIVE_DIR));
        await activate(ctx, activeWorld(values), to, world.name);
      },
      requestLocale(c),
    );
    return c.json({ jobId: job.id, folder: basename(world.folder) }, 202);
  });

  api.post('/worlds/rename', async (c) => {
    const { folder, name } = z.object({ folder: z.string(), name: z.string().max(64) }).parse(await c.req.json());
    const m = requestMessages(c);
    const { world } = await findWorld(folder);
    if (!world) return c.json({ error: m.server.worldNotFoundShort }, 404);
    if (world.active) return c.json({ error: m.server.switchBeforeRename }, 409);
    return c.json({ folder: await worlds.rename(world.folder, name.trim(), m) });
  });

  api.post('/worlds/delete', async (c) => {
    const { folder, confirm } = z.object({ folder: z.string(), confirm: z.string() }).parse(await c.req.json());
    const m = requestMessages(c);
    const { world } = await findWorld(folder);
    if (!world) return c.json({ error: m.server.worldNotFoundShort }, 404);
    if (world.active) return c.json({ error: m.server.switchBeforeDelete }, 409);
    if (confirm.trim() !== world.name) return c.json({ error: m.server.typeWorldName }, 400);

    const job = await jobs.start(
      'world-delete',
      async (ctx) => {
        ctx.log(m.server.job.backupBeforeDelete);
        await operations.backup({ ...ctx, progress: (p) => ctx.progress(p * 0.9) }, 'pre-world-delete');
        cached.invalidate();
        await worlds.remove(world.folder);
        ctx.log(m.server.job.worldDeleted(world.name));
      },
      requestLocale(c),
    );
    return c.json({ jobId: job.id }, 202);
  });

  // Enviar, baixar e recuperar mundos (world-transfer.ts).
  registerWorldTransfer(api, { services, findWorld, storedWorldSettings, activeWorld, invalidateBackups: () => cached.invalidate() });
  registerGate(api, services);

  api.get('/jobs', (c) => c.json(jobs.list()));
  api.get('/jobs/:id', (c) => {
    const job = jobs.get(c.req.param('id'));
    return job ? c.json(job) : c.json({ error: requestMessages(c).server.jobNotFound }, 404);
  });

  // --- Console -----------------------------------------------------------------------------------
  api.post('/console', async (c) => {
    const { command } = z.object({ command: z.string().min(1).max(1000) }).parse(await c.req.json());
    return c.json({ output: await rcon.command(command.replace(/^\//, '')) });
  });

  api.get('/console/logs', (c: Context) =>
    streamSSE(c, async (stream) => {
      const abort = new AbortController();
      stream.onAbort(() => abort.abort());
      try {
        for await (const line of docker.logs('server', { tail: 300, follow: true, signal: abort.signal })) {
          await stream.writeSSE({ data: line });
        }
      } catch (err) {
        if (!abort.signal.aborted) await stream.writeSSE({ event: 'error', data: (err as Error).message });
      }
    }),
  );

  return api;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const PERFORMANCE_DOCS = 'https://github.com/JuniorCarlini/minetune/blob/main/docs/PERFORMANCE.md';

/**
 * Avisos da tela Início, em ordem de gravidade. Cada um diz o problema em
 * linguagem comum e aponta o que resolve; se nada estiver errado, a lista vem vazia.
 */
export function attentionItems(status: StatusResponse, snapshotsKnown: boolean, m: Messages = PT): AttentionItem[] {
  const items: AttentionItem[] = [];
  const { server } = status;
  const a = m.server.attention;

  if (server.state === 'missing') {
    items.push({ id: 'server-stopped', tone: 'danger', title: a.notFoundTitle, text: a.notFoundText });
  } else if (server.state === 'restarting') {
    // "restarting" no Docker é o servidor caindo logo depois de ligar e tentando de novo: "Ligar" não resolve.
    items.push({ id: 'server-crashing', tone: 'danger', title: a.crashingTitle, text: a.crashingText, action: { label: a.openConsole, href: '#/console' } });
  } else if (server.state !== 'running') {
    items.push({ id: 'server-stopped', tone: 'warning', title: a.stoppedTitle, text: a.stoppedText, action: { label: a.startServer, server: 'start' } });
  } else if (server.health === 'unhealthy') {
    items.push({ id: 'server-unhealthy', tone: 'danger', title: a.unhealthyTitle, text: a.unhealthyText, action: { label: a.openConsole, href: '#/console' } });
  }

  // O portão é quem recebe os jogadores: parado, ninguém entra mesmo com o servidor ligado.
  if (status.gate && status.gate.state !== 'missing' && status.gate.state !== 'running') {
    items.push({ id: 'gate-stopped', tone: 'danger', title: a.gateStoppedTitle, text: a.gateStoppedText, action: { label: a.startGate, gate: 'start' } });
  }

  const memory = status.resources?.memoryLimit ? status.resources.memoryUsed / status.resources.memoryLimit : undefined;
  if (memory !== undefined && memory > 0.9) {
    items.push({ id: 'memory', tone: 'danger', title: a.memoryTitle, text: a.memoryText, action: { label: a.adjustMemory, href: '#/settings' } });
  }

  const tps = status.tps?.[0];
  if (tps !== undefined && tps < 15) {
    items.push({ id: 'performance', tone: 'warning', title: a.performanceTitle, text: a.performanceText, action: { label: a.performanceAction, href: PERFORMANCE_DOCS } });
  }

  if (status.backupProvider === 'local') {
    items.push({ id: 'backup-local', tone: 'warning', title: a.backupLocalTitle, text: a.backupLocalText, action: { label: a.backupLocalAction, href: '#/backups/destino' } });
  }
  if (snapshotsKnown && (!status.lastBackup || Date.now() - new Date(status.lastBackup.time).getTime() > 2 * DAY_MS)) {
    items.push({
      id: 'backup-old',
      tone: 'warning',
      title: status.lastBackup ? a.backupOldTitle : a.backupNoneTitle,
      text: a.backupOldText,
      action: { label: a.backupOldAction, href: '#/backups' },
    });
  }
  return items;
}

async function readJsonList<T>(path: string): Promise<T[]> {
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8')) as unknown;
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function cache<T>(ttlMs: number, load: () => Promise<T>) {
  let value: { data: T; at: number } | undefined;
  let inflight: Promise<T> | undefined;

  const get = async (): Promise<T> => {
    if (value && Date.now() - value.at < ttlMs) return value.data;
    inflight ??= load()
      .then((data) => {
        value = { data, at: Date.now() };
        return data;
      })
      .finally(() => {
        inflight = undefined;
      });
    return inflight;
  };

  return {
    get,
    /** Devolve o que houver agora (mesmo vencido) e atualiza em segundo plano, sem esperar. */
    peek(): T | undefined {
      if (!value || Date.now() - value.at >= ttlMs) void get().catch(() => undefined);
      return value?.data;
    },
    set(data: T) {
      value = { data, at: Date.now() };
    },
    invalidate() {
      value = undefined;
      void get().catch(() => undefined);
    },
  };
}
