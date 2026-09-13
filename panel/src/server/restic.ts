/**
 * Wrapper do restic, compatível com os snapshots criados pelo itzg/mc-backup:
 * mesmo host (RESTIC_HOST), mesmo caminho (/data) e mesmas tags
 * (mc_backups + BACKUP_NAME). Assim retenção e listagem enxergam backups
 * agendados e manuais como uma coisa só.
 */

import { spawn } from 'node:child_process';
import type { BaseConfig } from './config.ts';
import type { SnapshotInfo } from '../shared/api.ts';

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

export class Restic {
  private readonly tags: string[];
  private readonly config: BaseConfig;

  constructor(config: BaseConfig) {
    this.config = config;
    this.tags = ['mc_backups', config.BACKUP_NAME];
  }

  get repositoryLabel(): string {
    // Nunca expõe credenciais embutidas na URL.
    return this.config.RESTIC_REPOSITORY.replace(/\/\/[^/@]+@/, '//***@');
  }

  private run(args: string[], onLine?: (line: string) => void): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn('restic', args, { env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';
      let partial = '';

      child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
        stdout += chunk;
        if (!onLine) return;
        const lines = (partial + chunk).split('\n');
        partial = lines.pop() ?? '';
        lines.forEach((line) => line && onLine(line));
      });
      child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
        stderr += chunk;
      });
      child.on('error', (err) => reject(new ResticError(`Falha ao executar restic: ${err.message}`)));
      child.on('close', (code) => {
        if (partial && onLine) onLine(partial);
        if (code === 0) resolve(stdout);
        else reject(new ResticError(stderr.trim().split('\n').slice(-3).join(' ') || `restic saiu com código ${code}`));
      });
    });
  }

  /** Inicializa o repositório se ainda não existir (primeiro backup). */
  async ensureRepository(log: Log): Promise<void> {
    try {
      await this.run(['cat', 'config']);
    } catch (err) {
      const message = (err as Error).message;
      if (!/Is there a repository|config file does not exist|does not exist/i.test(message)) throw err;
      log('Repositório de backup não existe, inicializando...');
      await this.run(['init']);
    }
  }

  async snapshots(): Promise<SnapshotInfo[]> {
    let output: string;
    try {
      output = await this.run(['snapshots', '--json', '--host', this.config.RESTIC_HOST, '--tag', this.tags.join(',')]);
    } catch (err) {
      if (/Is there a repository|does not exist/i.test((err as Error).message)) return [];
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
    const args = ['backup', this.config.DATA_DIR, '--json', '--host', this.config.RESTIC_HOST];
    for (const tag of [...this.tags, ...extraTags]) args.push('--tag', tag);
    for (const pattern of this.config.BACKUP_EXCLUDES.split(',').map((p) => p.trim()).filter(Boolean)) {
      args.push('--exclude', pattern);
    }

    let summary: { snapshot_id: string; data_added: number } | undefined;
    let lastReported = -1;
    await this.run(args, (line) => {
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
    });
    if (!summary) throw new ResticError('restic não retornou resumo do backup');
    return { snapshotId: summary.snapshot_id, dataAdded: summary.data_added };
  }

  /** Restaura o conteúdo de /data do snapshot diretamente em `target`. */
  async restore(snapshotId: string, target: string, progress: Progress): Promise<void> {
    await this.run(['restore', `${snapshotId}:${this.config.DATA_DIR}`, '--target', target, '--json'], (line) => {
      const event = safeJson(line);
      if (event?.message_type === 'status' && typeof event.percent_done === 'number') progress(event.percent_done);
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
