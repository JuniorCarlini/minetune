/**
 * Enviar, baixar e recuperar mundos pela API.
 *
 *   POST /worlds/upload              .zip no corpo (cabeçalho X-Filename); ?name= opcional
 *   GET  /worlds/download?folder=    .zip do mundo, gerado enquanto é baixado
 *   GET  /backups/:id/worlds         mundos que existem numa cópia de segurança
 *   POST /backups/:id/restore-world  { folder } recupera só aquele mundo, como guardado
 *
 * Nada aqui substitui um mundo existente: o que chega (enviado ou recuperado) sempre vira um
 * mundo guardado com um nome livre, e o mundo ligado continua como está.
 */

import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { Hono } from 'hono';
import { z } from 'zod';
import { describeArchiveProblems, type BackupWorldsResponse, type UploadAcceptedResponse, type UploadRejectedResponse } from '../shared/archive.ts';
import { worldBlockReason, worldFolderFrom, worldNameError, worldNameInputError, type WorldInfo } from '../shared/worlds.ts';
import { ValidationError } from './config-store.ts';
import type { Services } from './context.ts';
import { requestLocale, requestMessages } from './i18n.ts';
import {
  extractWorldZip,
  inspectWorldZip,
  PROFILE_LIMITS,
  readLevelVersion,
  readZipText,
  sanitizeAccessList,
  sanitizeMeta,
  sanitizeServerEnv,
  zipDirectory,
} from './world-archive.ts';
import { ACCESS_FILES } from './world-profile.ts';
import { ARCHIVE_DIR } from './worlds.ts';

export interface WorldTransferDeps {
  services: Services;
  findWorld: (folder: string) => Promise<{ values: Record<string, string>; world?: WorldInfo }>;
  storedWorldSettings: (folder: string) => Promise<Record<string, string>>;
  activeWorld: (values: Record<string, string>) => string;
  /** Avisa que a lista de cópias mudou (cache de /backups). */
  invalidateBackups: () => void;
}

const SNAPSHOT_ID = /^[0-9a-f]{8,64}$/;
/** O salvamento do mundo ligado volta sozinho depois disso, mesmo se o download travar. */
const SAVE_PAUSE_MAX_MS = 30 * 60_000;

export function registerWorldTransfer(api: Hono, deps: WorldTransferDeps): void {
  const { services, findWorld, storedWorldSettings, activeWorld } = deps;
  const { config, docker, rcon, restic, store, jobs, worlds, profiles } = services;
  const workDir = () => join(config.DATA_DIR, '.minetune', 'uploads');

  /** Nome livre na raiz e em mundos-guardados/: "nome", "nome-2", "nome-3"... cabendo no limite. */
  const freeWorldName = async (wanted: string, suffix = ''): Promise<string> => {
    const base = worldFolderFrom(wanted).slice(0, Math.max(4, 28 - suffix.length)) || 'mundo';
    for (let i = 1; i < 1000; i++) {
      const name = `${base}${suffix}${i === 1 ? '' : `-${i}`}`;
      if (worldNameError(name) !== null) continue;
      if (!(await worlds.exists(name)) && !(await worlds.exists(`${ARCHIVE_DIR}/${name}`))) return name;
    }
    throw new Error('sem nome livre para o mundo');
  };

  api.post('/worlds/upload', async (c) => {
    const m = requestMessages(c);
    const locale = requestLocale(c);
    const max = config.WORLD_UPLOAD_MAX_BYTES;
    if (Number(c.req.header('content-length') ?? 0) > max) return c.json({ error: m.archive.server.uploadTooLarge(max) }, 413);
    const body = c.req.raw.body;
    if (!body) return c.json({ error: m.archive.server.uploadEmpty }, 400);

    // Nome escolhido na tela: mesma validação de criar e renomear (inclusive texto colado).
    const requested = (c.req.query('name') ?? '').trim();
    if (requested) {
      const error = worldNameInputError(requested, m) ?? worldNameError(worldFolderFrom(requested), m);
      if (error) throw new ValidationError({ name: error });
    }

    // O .zip vai para /data/.minetune, que fica fora dos backups e do alcance do servidor do jogo.
    await mkdir(workDir(), { recursive: true });
    const id = randomUUID();
    const zipPath = join(workDir(), `${id}.zip`);
    let received = 0;
    const limit = new Transform({
      transform(chunk: Buffer, _encoding, done) {
        received += chunk.length;
        done(received > max ? new Error('upload grande demais') : null, chunk);
      },
    });
    try {
      await pipeline(Readable.fromWeb(body as never), limit, createWriteStream(zipPath, { flags: 'wx', mode: 0o600 }));
    } catch (err) {
      await rm(zipPath, { force: true });
      if (received > max) return c.json({ error: m.archive.server.uploadTooLarge(max) }, 413);
      throw err;
    }
    if (received === 0) {
      await rm(zipPath, { force: true });
      return c.json({ error: m.archive.server.uploadEmpty }, 400);
    }

    const { problems, plan } = await inspectWorldZip(zipPath, { dataDir: config.DATA_DIR });
    if (!plan) {
      await rm(zipPath, { force: true });
      const rejected: UploadRejectedResponse = { error: m.archive.server.rejected, problems: describeArchiveProblems(problems, m) };
      return c.json(rejected, 422);
    }

    let folderName: string;
    try {
      if (requested) {
        folderName = worldFolderFrom(requested);
        if ((await worlds.exists(folderName)) || (await worlds.exists(`${ARCHIVE_DIR}/${folderName}`))) {
          throw new ValidationError({ name: m.server.nameTaken });
        }
      } else {
        const fileName = decodeURIComponent(c.req.header('x-filename') ?? '').replace(/\.zip$/i, '');
        folderName = await freeWorldName(plan.suggestedName || fileName || 'mundo');
      }
    } catch (err) {
      await rm(zipPath, { force: true });
      throw err;
    }
    const folder = `${ARCHIVE_DIR}/${folderName}`;

    let jobId: string;
    try {
      const job = await jobs.start(
        'world-upload',
        async (ctx) => {
          const t = m.archive.job;
          const staging = join(workDir(), `${id}-mundo`);
          try {
            let reported = -1;
            await extractWorldZip(zipPath, plan, staging, (fraction) => {
              ctx.progress(fraction * 0.8);
              const pct = Math.floor(fraction * 10) * 10;
              if (pct > reported) {
                reported = pct;
                ctx.log(t.extracting(pct));
              }
            });
            const level = await readLevelVersion(staging);
            if (!level) throw new Error(describeArchiveProblems([{ code: 'invalidLevelDat' }], m)[0]);
            ctx.log(t.checkedLevel(level.version ?? '?'));
            if (plan.ignoredOutside > 0) ctx.log(t.ignoredOutside(plan.ignoredOutside));

            await mkdir(join(config.DATA_DIR, ARCHIVE_DIR), { recursive: true });
            await rename(staging, worlds.dir(folder));

            // Configuração: a em uso como base (igual a criar um mundo), sem as pessoas dela.
            // Do .zip, só o que passou pela limpeza.
            await profiles.saveLive(folder);
            await profiles.clearAccess(folder);
            const envText = plan.profile.serverEnv ? await readZipText(zipPath, plan.profile.serverEnv, PROFILE_LIMITS.serverEnv) : null;
            const imported = envText ? sanitizeServerEnv(envText) : { values: {}, ignored: [] };
            await profiles.store(folder).updateSettings({ ...imported.values, LEVEL: folderName }, m);
            const importedCount = Object.keys(imported.values).length;
            if (importedCount > 0) ctx.log(t.importedSettings(importedCount));
            if (imported.ignored.length > 0) ctx.log(t.ignoredSettings(imported.ignored.join(', ')));
            if (plan.profile.ignoredModrinth) ctx.log(t.ignoredPlugins);

            let people = false;
            for (const file of ACCESS_FILES) {
              const entry = plan.profile.access[file];
              if (!entry) continue;
              const text = await readZipText(zipPath, entry, PROFILE_LIMITS.accessList);
              const clean = text ? sanitizeAccessList(file, text) : null;
              if (!clean) continue;
              await mkdir(profiles.accessDir(folder), { recursive: true });
              await writeFile(join(profiles.accessDir(folder), file), clean, { mode: 0o644 });
              people = true;
            }
            if (people) ctx.log(t.importedPeople);

            const metaText = plan.profile.meta ? await readZipText(zipPath, plan.profile.meta, PROFILE_LIMITS.meta) : null;
            await worlds.writeMeta(folder, { ...(metaText ? sanitizeMeta(metaText) : {}), createdAt: new Date().toISOString() });

            // Já avisa se o mundo não vai abrir com a configuração atual (versão mais nova, Paper...).
            const { values } = await store.readSettings();
            const info = (await worlds.list(activeWorld(values))).find((w) => w.folder === folder);
            const settings = await storedWorldSettings(folder);
            const reason = info ? worldBlockReason(info, settings.VERSION || 'LATEST', settings.TYPE || 'VANILLA', m) : null;
            if (reason) ctx.log(t.blockedWarning(reason));
            ctx.progress(1);
            ctx.log(t.uploadDone(folderName));
          } finally {
            await rm(staging, { recursive: true, force: true });
            await rm(zipPath, { force: true });
          }
        },
        locale,
      );
      jobId = job.id;
    } catch (err) {
      await rm(zipPath, { force: true });
      throw err;
    }
    const accepted: UploadAcceptedResponse = { jobId, folder };
    return c.json(accepted, 202);
  });

  api.get('/worlds/download', async (c) => {
    const m = requestMessages(c);
    const { world } = await findWorld(c.req.query('folder') ?? '');
    if (!world) return c.json({ error: m.server.worldNotFoundShort }, 404);

    // Mundo ligado: guarda a configuração em uso junto e pausa o salvamento automático enquanto
    // o .zip é gerado, para o mapa não mudar no meio. Ninguém é desconectado.
    let savingPaused = false;
    if (world.active) {
      await profiles.saveLive(world.folder).catch(() => undefined);
      const server = await docker.info('server');
      if (server.state === 'running') {
        try {
          await rcon.command('save-off');
          savingPaused = true;
          await rcon.command('save-all flush');
        } catch {
          if (savingPaused) await rcon.command('save-on').catch(() => undefined);
          return c.json({ error: m.archive.server.downloadActiveOff }, 503);
        }
      }
    }

    let stream: Readable;
    try {
      stream = await zipDirectory(worlds.dir(world.folder), world.name);
    } catch (err) {
      if (savingPaused) await rcon.command('save-on').catch(() => undefined);
      throw err;
    }
    if (savingPaused) {
      let resumed = false;
      const resume = () => {
        if (resumed) return;
        resumed = true;
        clearTimeout(timer);
        void rcon.command('save-on').catch(() => undefined);
      };
      const timer = setTimeout(resume, SAVE_PAUSE_MAX_MS);
      timer.unref();
      stream.once('end', resume);
      stream.once('close', resume);
      stream.once('error', resume);
    }

    const fileName = `${world.name}.zip`.replace(/[^A-Za-z0-9._-]/g, '_');
    return new Response(Readable.toWeb(stream) as unknown as ReadableStream, {
      headers: {
        'content-type': 'application/zip',
        'content-disposition': `attachment; filename="${fileName}"`,
        'cache-control': 'no-store',
      },
    });
  });

  api.get('/backups/:id/worlds', async (c) => {
    const m = requestMessages(c);
    const id = c.req.param('id');
    if (!SNAPSHOT_ID.test(id)) return c.json({ error: m.server.job.snapshotNotFound(id) }, 404);
    const folders = await restic.listWorlds(id, ARCHIVE_DIR);
    const body: BackupWorldsResponse = { snapshotId: id, worlds: folders.map((folder) => ({ folder, name: basename(folder) })) };
    return c.json(body);
  });

  api.post('/backups/:id/restore-world', async (c) => {
    const m = requestMessages(c);
    const id = c.req.param('id');
    const { folder } = z.object({ folder: z.string().max(200) }).parse(await c.req.json());
    if (!SNAPSHOT_ID.test(id)) return c.json({ error: m.server.job.snapshotNotFound(id) }, 404);
    const snapshot = (await restic.snapshots()).find((s) => s.id === id || s.shortId === id);
    if (!snapshot) return c.json({ error: m.server.job.snapshotNotFound(id) }, 404);
    // Só um mundo que existe na cópia: o nome vem da lista do restic, nunca direto do pedido.
    if (!(await restic.listWorlds(snapshot.id, ARCHIVE_DIR)).includes(folder)) {
      return c.json({ error: m.archive.server.worldNotInBackup }, 404);
    }

    const date = snapshot.time.slice(0, 10);
    const job = await jobs.start(
      'world-restore',
      async (ctx) => {
        const name = await freeWorldName(basename(folder), `-backup-${date}`);
        const staging = join(config.DATA_DIR, '.minetune', `restore-world-${randomUUID()}`);
        try {
          ctx.log(m.archive.job.restoringWorld(basename(folder), date));
          await restic.restorePath(snapshot.id, folder, staging, (p) => ctx.progress(p * 0.9));
          await rm(join(staging, 'session.lock'), { force: true });
          await mkdir(join(config.DATA_DIR, ARCHIVE_DIR), { recursive: true });
          await rename(staging, worlds.dir(`${ARCHIVE_DIR}/${name}`));
          ctx.progress(1);
          ctx.log(m.archive.job.restoreWorldDone(name));
        } finally {
          await rm(staging, { recursive: true, force: true });
        }
      },
      requestLocale(c),
    );
    return c.json({ jobId: job.id }, 202);
  });
}
