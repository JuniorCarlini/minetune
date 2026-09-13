/**
 * Wrapper do restic, compatível com os snapshots criados pelo itzg/mc-backup:
 * mesmo host (RESTIC_HOST), mesmo caminho (/data) e mesmas tags
 * (mc_backups + BACKUP_NAME). Assim retenção e listagem enxergam backups
 * agendados e manuais como uma coisa só.
 *
 * Destino e credenciais são lidos a cada chamada (config/backup.env pode mudar
 * pelo painel sem reiniciar o processo).
 */

import { spawn } from 'node:child_process';
import type { BaseConfig } from './config.ts';
import type { SnapshotInfo } from '../shared/api.ts';
import { maskRepository } from '../shared/backup-destination.ts';

export class ResticError extends Error {}

interface RawSnapshot {
  id: string;
  short_id: string;
  time: string;
  tags?: string[];
  summary?: { total_bytes_processed?: number };
}

type Log = (message: string) => void;
type Progress = (fraction: number) => void;
export type ResticEnv = Record<string, string>;

const MISSING_REPOSITORY = /Is there a repository|config file does not exist|does not exist|repository not found/i;

export class Restic {
  private readonly tags: string[];
  private readonly config: BaseConfig;
  private readonly destinationEnv: () => Promise<ResticEnv>;

  constructor(config: BaseConfig, destinationEnv: () => Promise<ResticEnv>) {
    this.config = config;
    this.destinationEnv = destinationEnv;
    this.tags = ['mc_backups', config.BACKUP_NAME];
  }

  async repositoryLabel(): Promise<string> {
    return maskRepository((await this.destinationEnv()).RESTIC_REPOSITORY ?? this.config.RESTIC_REPOSITORY);
  }

  private async run(
    args: string[],
    options: { onLine?: (line: string) => void; env?: ResticEnv; timeoutMs?: number } = {},
  ): Promise<string> {
    const env = { ...process.env, ...(options.env ?? (await this.destinationEnv())) };
    return new Promise((resolve, reject) => {
      const child = spawn('restic', args, { env, stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';
      let partial = '';
      let timedOut = false;
      const timer = options.timeoutMs
        ? setTimeout(() => {
            timedOut = true;
            child.kill('SIGTERM');
          }, options.timeoutMs)
        : undefined;

      child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
        stdout += chunk;
        if (!options.onLine) return;
        const lines = (partial + chunk).split('\n');
        partial = lines.pop() ?? '';
        lines.forEach((line) => line && options.onLine!(line));
      });
      child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
        stderr += chunk;
      });
      child.on('error', (err) => reject(new ResticError(`Falha ao executar restic: ${err.message}`)));
      child.on('close', (code) => {
        clearTimeout(timer);
        if (partial && options.onLine) options.onLine(partial);
        if (timedOut) reject(new ResticError('Tempo esgotado ao conectar no destino'));
        else if (code === 0) resolve(stdout);
        else reject(new ResticError(stderr.trim().split('\n').slice(-3).join(' ') || `restic saiu com código ${code}`));
      });
    });
  }

  /** Inicializa o repositório se ainda não existir (primeiro backup). */
  async ensureRepository(log: Log): Promise<void> {
    try {
      await this.run(['cat', 'config']);
    } catch (err) {
      if (!MISSING_REPOSITORY.test((err as Error).message)) throw err;
      log('Repositório de backup não existe, inicializando...');
      await this.run(['init']);
    }
  }

  /**
   * Testa um destino sem salvar: 'ok' quando já existe repositório legível com a
   * senha atual, 'empty' quando o destino responde mas ainda não tem repositório.
   */
  async check(env: ResticEnv): Promise<'ok' | 'empty'> {
    try {
      await this.run(['cat', 'config', '--no-lock'], { env, timeoutMs: 30_000 });
      return 'ok';
    } catch (err) {
      if (MISSING_REPOSITORY.test((err as Error).message)) return 'empty';
      throw err;
    }
  }

  async init(env: ResticEnv): Promise<void> {
    await this.run(['init'], { env, timeoutMs: 60_000 });
  }

  async snapshots(): Promise<SnapshotInfo[]> {
    let output: string;
    try {
      output = await this.run(['snapshots', '--json', '--host', this.config.RESTIC_HOST, '--tag', this.tags.join(',')]);
    } catch (err) {
      if (MISSING_REPOSITORY.test((err as Error).message)) return [];
      throw err;
    }
    const raw = JSON.parse(output || '[]') as RawSnapshot[];
    return raw
      .map((s) => ({
        id: s.id,
        shortId: s.short_id,
        time: s.time,
        tags: (s.tags ?? []).filter((t) => !this.tags.includes(t)),
        sizeBytes: s.summary?.total_bytes_processed,
      }))
      .sort((a, b) => b.time.localeCompare(a.time));
  }

  async backup(extraTags: string[], log: Log, progress: Progress): Promise<{ snapshotId: string; dataAdded: number }> {
    const env = await this.destinationEnv();
    const args = ['backup', this.config.DATA_DIR, '--json', '--host', this.config.RESTIC_HOST];
    for (const tag of [...this.tags, ...extraTags]) args.push('--tag', tag);
    for (const pattern of this.config.BACKUP_EXCLUDES.split(',').map((p) => p.trim()).filter(Boolean)) {
      args.push('--exclude', pattern);
    }
    // Mesmo limite de upload do agendador, para o backup manual não saturar a banda do jogo.
    const limit = Number(env.RESTIC_LIMIT_UPLOAD ?? 0);
    if (limit > 0) args.push('--limit-upload', String(limit));

    let summary: { snapshot_id: string; data_added: number } | undefined;
    let lastReported = -1;
    await this.run(args, {
      env,
      onLine: (line) => {
        const event = safeJson(line);
        if (event?.message_type === 'status' && typeof event.percent_done === 'number') {
          progress(event.percent_done);
          const pct = Math.floor(event.percent_done * 10) * 10;
          if (pct > lastReported) {
            lastReported = pct;
            log(`Enviando... ${pct}%`);
          }
        } else if (event?.message_type === 'summary') {
          summary = event as unknown as typeof summary;
        }
      },
    });
    if (!summary) throw new ResticError('restic não retornou resumo do backup');
    return { snapshotId: summary.snapshot_id, dataAdded: summary.data_added };
  }

  /** Restaura o conteúdo de /data do snapshot diretamente em `target`. */
  async restore(snapshotId: string, target: string, progress: Progress): Promise<void> {
    await this.run(['restore', `${snapshotId}:${this.config.DATA_DIR}`, '--target', target, '--json'], {
      onLine: (line) => {
        const event = safeJson(line);
        if (event?.message_type === 'status' && typeof event.percent_done === 'number') progress(event.percent_done);
      },
    });
  }
}

function safeJson(line: string): Record<string, unknown> | null {
  try {
    return JSON.parse(line) as Record<string, unknown>;
  } catch {
    return null;
  }
}
