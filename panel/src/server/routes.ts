import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Hono, type Context } from 'hono';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';
import type {
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
} from '../shared/api.ts';
import { GAMERULES_BY_NAME, validateGameRuleValue } from '../shared/gamerules.ts';
import { parseModrinthEntry, type ModrinthEntry } from '../shared/modrinth.ts';
import { SETTINGS_BY_KEY, loaderForType, parseMemory } from '../shared/settings.ts';
import { isServerType, javaFromImage, requiredJava, type ServerType, type VersionsResponse } from '../shared/versions.ts';
import { BACKUP_PROVIDERS, validateBackupSettings } from '../shared/backup-destination.ts';
import { explainBackupError } from './backup-config.ts';
import { fetchVersions, type RawVersion } from './versions.ts';

/** Destino de backup inacessível ou recusado: erro do usuário, não do painel. */
class BackupDestinationError extends Error {}
import { ValidationError } from './config-store.ts';
import type { Services } from './context.ts';
import { ConflictError } from './jobs.ts';
import { parseGameRuleQuery, parseList, parseTps, readGameRules, serverNameFor, setGameRule } from './minecraft.ts';
import { RconError } from './rcon.ts';

/** JVM precisa de memória fora da heap (metaspace, threads, buffers de rede). */
const JVM_OVERHEAD_BYTES = 768 * 1024 ** 2;
const PLAYER_NAME = /^\.?[A-Za-z0-9_]{1,32}$/;

export function apiRoutes(services: Services): Hono {
  const { docker, rcon, restic, backupConfig, store, operations, jobs, config } = services;
  const api = new Hono();

  const cached = cache<SnapshotInfo[]>(60_000, () => restic.snapshots());
  // Aquece a lista de backups ao subir: a primeira leitura do restic leva ~0,7s.
  void cached.get().catch(() => undefined);

  api.onError((err, c) => {
    if (err instanceof ValidationError) return c.json({ error: 'Valores inválidos', fields: err.fields }, 400);
    if (err instanceof ConflictError) return c.json({ error: err.message }, 409);
    if (err instanceof BackupDestinationError) return c.json({ error: err.message }, 422);
    if (err instanceof z.ZodError) return c.json({ error: 'Requisição inválida', issues: err.issues }, 400);
    // Servidor parado é um estado esperado, não um erro do painel: sem stack trace no log.
    if (err instanceof RconError) return c.json({ error: 'Servidor offline ou inacessível via RCON' }, 503);
    console.error(err);
    return c.json({ error: err.message }, 500);
  });

  // --- Status ---------------------------------------------------------------------
  api.get('/status', async (c) => {
    const { values } = await store.readSettings();
    const [server, backup] = await Promise.all([
      docker.info('server'),
      docker.info('backup').catch(() => ({ state: 'missing' as const })),
    ]);
    // Nunca espera o restic: usa o que já está em cache e atualiza em segundo plano.
    const snapshots = cached.peek() ?? [];

    const status: StatusResponse = {
      server,
      backup,
      game: { type: values.TYPE ?? 'VANILLA', version: values.VERSION ?? 'LATEST', motd: values.MOTD ?? '' },
      lastBackup: snapshots[0],
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
    return c.json(status);
  });

  api.post('/server/:action{start|stop|restart}', async (c) => {
    const action = c.req.param('action') as 'start' | 'stop' | 'restart';
    if (action !== 'start') {
      await rcon.command(`say O servidor vai ${action === 'stop' ? 'desligar' : 'reiniciar'} em instantes.`).catch(() => undefined);
    }
    await docker.action('server', action);
    return c.json({ ok: true });
  });

  // --- Configurações ----------------------------------------------------------------
  api.get('/settings', async (c) => {
    const [settings, server] = await Promise.all([store.readSettings(), docker.inspect('server').catch(() => null)]);
    const body: SettingsResponse = { ...settings, memoryLimitBytes: server?.memoryLimit || undefined };
    return c.json(body);
  });

  const saveSettingsBody = z.object({
    values: z.record(z.string(), z.string()),
    apply: z.enum(['none', 'restart', 'backup-and-restart']).default('none'),
  });

  api.put('/settings', async (c) => {
    const body = saveSettingsBody.parse(await c.req.json());

    const memory = body.values.MEMORY;
    if (memory) {
      const heap = parseMemory(memory);
      const server = await docker.inspect('server').catch(() => null);
      if (heap && server?.memoryLimit && heap + JVM_OVERHEAD_BYTES > server.memoryLimit) {
        const limitGb = (server.memoryLimit / 1024 ** 3).toFixed(1);
        throw new ValidationError({
          MEMORY: `Heap + ~768 MB de overhead ultrapassa o limite do container (${limitGb} GB, MC_MEMORY_LIMIT no .env)`,
        });
      }
    }

    const changed = await store.updateSettings(body.values);
    const response: SaveSettingsResponse = { changed };

    if (body.apply !== 'none') {
      const job = await jobs.start('apply-settings', async (ctx) => {
        if (changed.length > 0) ctx.log(`Alterado: ${changed.map((k) => SETTINGS_BY_KEY.get(k)?.label ?? k).join(', ')}`);
        const server = await docker.inspect('server');
        if (body.apply === 'backup-and-restart' && server?.state === 'running') {
          await operations.backup({ log: ctx.log, progress: (p) => ctx.progress(p * 0.8) }, 'pre-config-change');
        }
        await rcon.command('say Aplicando novas configurações: o servidor vai reiniciar.').catch(() => undefined);
        ctx.log('Reiniciando o servidor...');
        await docker.action('server', server?.state === 'running' ? 'restart' : 'start');
        cached.invalidate();
      });
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
    if (!isServerType(type)) return c.json({ error: 'Software de servidor inválido' }, 400);

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
  api.get('/gamerules', async (c) => c.json(await readGameRules(rcon)));

  api.put('/gamerules/:name', async (c) => {
    const rule = GAMERULES_BY_NAME.get(c.req.param('name'));
    if (!rule) return c.json({ error: 'Regra desconhecida' }, 404);
    const { value } = z.object({ value: z.string() }).parse(await c.req.json());
    const error = validateGameRuleValue(rule, value);
    if (error) return c.json({ error }, 400);

    const naming = parseGameRuleQuery(await rcon.command('gamerule keep_inventory')) !== null ? 'modern' : 'legacy';
    const serverName = serverNameFor(rule, naming);
    if (!serverName) return c.json({ error: 'Regra não suportada nesta versão' }, 400);
    return c.json({ output: await setGameRule(rcon, serverName, value) });
  });

  // --- Jogadores ------------------------------------------------------------------------
  api.get('/players', async (c) => {
    const server = await docker.info('server');
    const list = server.state === 'running' ? parseList(await rcon.command('list').catch(() => '')) : null;
    const [whitelist, ops, banned] = await Promise.all([
      readJsonList<PlayerRef>(join(config.DATA_DIR, 'whitelist.json')),
      readJsonList<PlayerRef & { level?: number }>(join(config.DATA_DIR, 'ops.json')),
      readJsonList<PlayerRef & { reason?: string; expires?: string }>(join(config.DATA_DIR, 'banned-players.json')),
    ]);
    const body: PlayersResponse = {
      serverOnline: list !== null,
      online: list?.names ?? [],
      max: list?.max ?? 0,
      whitelist: whitelist.map(({ name, uuid }) => ({ name, uuid })),
      ops: ops.map(({ name, uuid, level }) => ({ name, uuid, level })),
      banned: banned.map(({ name, uuid, reason, expires }) => ({ name, uuid, reason, expires })),
    };
    return c.json(body);
  });

  const playerActionBody = z.object({
    action: z.enum(['whitelist-add', 'whitelist-remove', 'op', 'deop', 'kick', 'ban', 'pardon']),
    name: z.string().regex(PLAYER_NAME, 'Nome de jogador inválido'),
    reason: z.string().max(200).optional(),
  });

  api.post('/players', async (c) => {
    const { action, name, reason } = playerActionBody.parse(await c.req.json());
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

  // --- Plugins e mods (Modrinth) --------------------------------------------------------------
  api.get('/modrinth', async (c) => {
    const { values } = await store.readSettings();
    const loader = loaderForType(values.TYPE);
    const body: ModrinthListResponse = { loader, entries: loader ? await store.readModrinth(loader) : [] };
    return c.json(body);
  });

  api.put('/modrinth', async (c) => {
    const { values } = await store.readSettings();
    const loader = loaderForType(values.TYPE);
    if (!loader) return c.json({ error: 'O tipo de servidor atual não usa plugins nem mods' }, 400);

    const { entries } = z.object({ entries: z.array(z.string()) }).parse(await c.req.json());
    const parsed = entries.map((text) => ({ text, entry: parseModrinthEntry(text) }));
    const invalid = parsed.filter((p) => !p.entry).map((p) => p.text);
    if (invalid.length > 0) return c.json({ error: `Entradas inválidas: ${invalid.join(', ')}` }, 400);

    await store.writeModrinth(loader, parsed.map((p) => p.entry as ModrinthEntry));
    return c.json({ ok: true });
  });

  api.get('/modrinth/search', async (c) => {
    const query = c.req.query('q') ?? '';
    const { values } = await store.readSettings();
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
    if (!res.ok) return c.json({ error: `Modrinth respondeu ${res.status}` }, 502);
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
  const checkBackupSettings = async (raw: unknown) => {
    const input = backupSettingsBody.parse(raw);
    const errors = validateBackupSettings(input, { hasSecret: await backupConfig.canKeepSecret(input) });
    if (Object.keys(errors).length > 0) throw new ValidationError(errors);
    const env = await backupConfig.candidate(input);
    try {
      return { env, status: await restic.check(env) };
    } catch (err) {
      throw new BackupDestinationError(explainBackupError((err as Error).message));
    }
  };

  api.post('/backups/settings/test', async (c) => {
    const { status } = await checkBackupSettings(await c.req.json());
    const body: BackupTestResponse = { status };
    return c.json(body);
  });

  api.put('/backups/settings', async (c) => {
    const { env, status } = await checkBackupSettings(await c.req.json());
    let initialized = false;
    if (status === 'empty') {
      try {
        await restic.init(env);
        initialized = true;
      } catch (err) {
        throw new BackupDestinationError(explainBackupError((err as Error).message));
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
    const job = await jobs.start('backup', async (ctx) => {
      await operations.backup(ctx, 'manual');
      cached.invalidate();
    });
    return c.json({ jobId: job.id }, 202);
  });

  api.post('/backups/:id/restore', async (c) => {
    const id = c.req.param('id');
    const { confirm, safetyBackup } = z
      .object({ confirm: z.string(), safetyBackup: z.boolean().default(true) })
      .parse(await c.req.json());
    if (confirm !== 'RESTAURAR') return c.json({ error: 'Confirmação incorreta' }, 400);

    const job = await jobs.start('restore', async (ctx) => {
      await operations.restore(ctx, id, { safetyBackup });
      cached.invalidate();
    });
    return c.json({ jobId: job.id }, 202);
  });

  api.get('/jobs', (c) => c.json(jobs.list()));
  api.get('/jobs/:id', (c) => {
    const job = jobs.get(c.req.param('id'));
    return job ? c.json(job) : c.json({ error: 'Job não encontrado' }, 404);
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
