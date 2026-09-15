/**
 * Operações longas (backup, restore, aplicar configurações) rodam como jobs:
 * a API responde na hora com um id e o frontend acompanha o progresso.
 *
 * Só uma operação por vez. O lock é um arquivo em /data/.minetune para valer
 * também entre processos (painel e `make restore`, que roda em outro container).
 */

import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import { mkdir, open, readFile, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { JobInfo, JobKind } from '../shared/api.ts';
import { INTL_LOCALE, PT, messages, type Locale, type Messages } from '../shared/i18n/index.ts';

export class ConflictError extends Error {}

export interface JobContext {
  log(message: string): void;
  progress(fraction: number): void;
  /** Textos na língua de quem pediu a tarefa (a CLI não passa: fica em português). */
  m?: Messages;
  locale?: Locale;
}

/** Um lock mais velho que isso é considerado abandonado (processo morreu no meio). */
const STALE_LOCK_MS = 6 * 60 * 60 * 1000;
const MAX_LOG_LINES = 500;
const MAX_JOBS_KEPT = 20;

export class OperationLock {
  private readonly path: string;

  constructor(dataDir: string) {
    this.path = join(dataDir, '.minetune', 'operation.lock');
  }

  async acquire(kind: string, m: Messages = PT): Promise<() => Promise<void>> {
    await mkdir(join(this.path, '..'), { recursive: true });
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const handle = await open(this.path, 'wx');
        await handle.writeFile(JSON.stringify({ kind, host: hostname(), pid: process.pid, since: new Date().toISOString() }));
        await handle.close();
        return () => rm(this.path, { force: true });
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
        const info = await stat(this.path).catch(() => null);
        if (info && Date.now() - info.mtimeMs > STALE_LOCK_MS) {
          await rm(this.path, { force: true });
          continue;
        }
        const holder = await readFile(this.path, 'utf8').catch(() => '{}');
        const { kind: other = m.server.unknownKind, since = '?' } = JSON.parse(holder || '{}') as { kind?: string; since?: string };
        throw new ConflictError(m.server.operationRunning(other, since));
      }
    }
    throw new ConflictError(m.server.lockFailed);
  }
}

export class JobRunner {
  private readonly jobs = new Map<string, JobInfo>();
  private readonly lock: OperationLock;

  constructor(lock: OperationLock) {
    this.lock = lock;
  }

  /**
   * Inicia em segundo plano. Lança ConflictError se outra operação estiver rodando.
   * O passo a passo sai na língua de quem pediu (locale), com o horário no formato dela.
   */
  async start(kind: JobKind, work: (ctx: JobContext) => Promise<void>, locale: Locale = 'pt-BR'): Promise<JobInfo> {
    const m = messages(locale);
    const release = await this.lock.acquire(kind, m);
    const job: JobInfo = { id: randomUUID(), kind, status: 'running', startedAt: new Date().toISOString(), logs: [] };
    this.remember(job);

    const ctx: JobContext = {
      log: (message) => {
        job.logs.push(`${new Date().toLocaleTimeString(INTL_LOCALE[locale])}  ${message}`);
        if (job.logs.length > MAX_LOG_LINES) job.logs.splice(0, job.logs.length - MAX_LOG_LINES);
      },
      progress: (fraction) => {
        job.progress = Math.max(0, Math.min(1, fraction));
      },
      m,
      locale,
    };

    void (async () => {
      try {
        await work(ctx);
        job.status = 'succeeded';
        job.progress = 1;
        ctx.log(m.server.job.done);
      } catch (err) {
        job.status = 'failed';
        job.error = (err as Error).message;
        ctx.log(m.server.job.error(job.error));
      } finally {
        job.finishedAt = new Date().toISOString();
        await release().catch(() => undefined);
      }
    })();

    return job;
  }

  get(id: string): JobInfo | undefined {
    return this.jobs.get(id);
  }

  list(): JobInfo[] {
    return [...this.jobs.values()].reverse();
  }

  private remember(job: JobInfo): void {
    this.jobs.set(job.id, job);
    for (const id of this.jobs.keys()) {
      if (this.jobs.size <= MAX_JOBS_KEPT) break;
      if (this.jobs.get(id)?.status !== 'running') this.jobs.delete(id);
    }
  }
}
