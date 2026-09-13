/**
 * Backup e restore — usados pela API do painel e pela CLI (make backup/restore).
 */

import { access, mkdir, readdir, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { BaseConfig } from './config.ts';
import type { DockerClient } from './docker.ts';
import type { JobContext } from './jobs.ts';
import type { RconClient } from './rcon.ts';
import type { Restic } from './restic.ts';

const exists = (path: string) =>
  access(path).then(
    () => true,
    () => false,
  );

export class Operations {
  private readonly config: BaseConfig;
  private readonly docker: DockerClient;
  private readonly rcon: RconClient;
  private readonly restic: Restic;

  constructor(config: BaseConfig, docker: DockerClient, rcon: RconClient, restic: Restic) {
    this.config = config;
    this.docker = docker;
    this.rcon = rcon;
    this.restic = restic;
  }

  /**
   * Backup consistente: desliga o autosave, força gravação em disco, copia e
   * religa. Se o servidor estiver parado os arquivos já estão consistentes.
   */
  async backup(ctx: JobContext, tag: string): Promise<string> {
    const server = await this.docker.inspect('server').catch(() => null);
    let autosaveDisabled = false;

    try {
      if (server?.state === 'running') {
        try {
          await this.rcon.command('save-off');
          autosaveDisabled = true;
          await this.rcon.command('save-all flush');
          ctx.log('Mundo gravado em disco (save-all flush), autosave pausado.');
        } catch (err) {
          ctx.log(`AVISO: RCON indisponível (${(err as Error).message}). Backup sem save-all.`);
        }
      } else {
        ctx.log('Servidor parado: copiando arquivos diretamente.');
      }

      await this.restic.ensureRepository(ctx.log);
      ctx.log(`Criando snapshot em ${this.restic.repositoryLabel} (tag: ${tag})...`);
      const { snapshotId, dataAdded } = await this.restic.backup([tag], ctx.log, ctx.progress);
      ctx.log(`Snapshot ${snapshotId.slice(0, 8)} criado (${formatBytes(dataAdded)} novos após deduplicação).`);
      return snapshotId;
    } finally {
      if (autosaveDisabled) {
        await this.rcon.command('save-on').catch((err: Error) => ctx.log(`AVISO: falha ao religar autosave: ${err.message}`));
      }
    }
  }

  /**
   * Restore seguro:
   *  1. snapshot de segurança do estado atual
   *  2. para servidor e agendador de backup
   *  3. restaura numa pasta temporária (mesmo disco)
   *  4. troca as pastas por rename (atômico por item), com rollback em caso de erro
   *  5. religa o que estava rodando
   */
  async restore(ctx: JobContext, snapshotRef: string, options: { safetyBackup: boolean }): Promise<void> {
    const snapshots = await this.restic.snapshots();
    const snapshot =
      snapshotRef === 'latest' ? snapshots[0] : snapshots.find((s) => s.id === snapshotRef || s.shortId === snapshotRef);
    if (!snapshot) throw new Error(`Snapshot "${snapshotRef}" não encontrado`);
    ctx.log(`Restaurando snapshot ${snapshot.shortId} de ${new Date(snapshot.time).toLocaleString('pt-BR')}.`);

    const dataDir = this.config.DATA_DIR;
    if (options.safetyBackup && (await readdir(dataDir)).some((entry) => entry !== '.minetune')) {
      ctx.log('Fazendo backup de segurança do estado atual...');
      await this.backup({ log: ctx.log, progress: (p) => ctx.progress(p * 0.3) }, 'pre-restore');
    }

    const server = await this.docker.inspect('server');
    const scheduler = await this.docker.inspect('backup').catch(() => null);
    const serverWasRunning = server?.state === 'running';
    const schedulerWasRunning = scheduler?.state === 'running';

    if (serverWasRunning) {
      await this.rcon.command('say Restaurando backup: o servidor vai reiniciar em instantes.').catch(() => undefined);
    }
    if (schedulerWasRunning) await this.docker.action('backup', 'stop', 30);
    if (serverWasRunning) {
      ctx.log('Parando o servidor (salvando o mundo)...');
      await this.docker.action('server', 'stop', 90);
    }

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const workDir = join(dataDir, '.minetune');
    const staging = join(workDir, `restore-${stamp}`);
    const replaced = join(workDir, `replaced-${stamp}`);

    try {
      await mkdir(replaced, { recursive: true });
      ctx.log('Baixando arquivos do snapshot...');
      await this.restic.restore(snapshot.id, staging, (p) => ctx.progress(0.3 + p * 0.6));

      const entries = (await readdir(staging)).filter((entry) => entry !== '.minetune');
      const swapped: string[] = [];
      try {
        for (const entry of entries) {
          const live = join(dataDir, entry);
          if (await exists(live)) await rename(live, join(replaced, entry));
          await rename(join(staging, entry), live);
          swapped.push(entry);
        }
      } catch (err) {
        ctx.log('Falha na troca de arquivos, desfazendo...');
        for (const entry of swapped.reverse()) {
          await rm(join(dataDir, entry), { recursive: true, force: true });
          if (await exists(join(replaced, entry))) await rename(join(replaced, entry), join(dataDir, entry));
        }
        throw err;
      }
      ctx.log(`${entries.length} itens restaurados.`);
      await rm(replaced, { recursive: true, force: true });
    } finally {
      await rm(staging, { recursive: true, force: true }).catch(() => undefined);
      if (serverWasRunning) {
        ctx.log('Iniciando o servidor...');
        await this.docker.action('server', 'start').catch((err: Error) => ctx.log(`ERRO ao iniciar servidor: ${err.message}`));
      }
      if (schedulerWasRunning) {
        await this.docker.action('backup', 'start').catch((err: Error) => ctx.log(`ERRO ao iniciar agendador: ${err.message}`));
      }
    }
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}
