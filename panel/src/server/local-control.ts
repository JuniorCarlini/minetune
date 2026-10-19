/**
 * Controle dos processos no container único (MINETUNE_CONTROL=local), sem API do Docker.
 *
 * O supervisor do container (docker/allinone/supervisor.sh) é quem liga e desliga cada parte.
 * A conversa é por arquivos numa pasta em memória (/tmp/minetune):
 *
 *   state/<serviço>.json   estado que o supervisor grava a cada mudança
 *   control/<id>.cmd       pedido do painel ("restart mc"); o supervisor apaga ao atender
 *
 * A saída de cada processo fica em /data/.minetune/logs/<serviço>.log (o console lê o do mc).
 * CPU e memória vêm do cgroup do próprio container: são do container inteiro, como no
 * `docker stats`, já que painel, portão e servidor dividem o mesmo limite.
 */

import { randomBytes } from 'node:crypto';
import { availableParallelism, totalmem } from 'node:os';
import { open, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ContainerInfo, ContainerState } from '../shared/api.ts';
import { javaFromEnv } from '../shared/versions.ts';
import type { ControlAction, Role, ServiceControl, ServiceDetails, ServiceStats } from './control.ts';

/** Nome de cada parte no supervisor. */
const SERVICE: Record<Role, string> = { server: 'mc', backup: 'backup', gate: 'gate' };

/**
 * Memória que o painel, o portão e o agendador usam juntos (~200 MB). Sai do limite do container
 * antes de validar a heap do servidor: no container único todos dividem o mesmo limite. O mesmo
 * valor (MINETUNE_MEMORY_RESERVE_MB) é descontado na memória inicial do servidor (entrypoint.sh).
 */
const SHARED_RESERVE_BYTES = Number(process.env.MINETUNE_MEMORY_RESERVE_MB || 256) * 1024 ** 2;

/** Quanto esperar o supervisor pegar um pedido (ele olha a pasta a cada segundo). */
const PICKUP_TIMEOUT_MS = 10_000;

export interface SupervisorState {
  state: 'created' | 'running' | 'stopping' | 'exited' | 'restarting';
  want: 'up' | 'down';
  pid: number;
  startedAt: string;
  finishedAt: string;
  exitCode: number;
  restarts: number;
  /** Quantas vezes o processo já foi ligado: muda a cada start/restart. */
  starts: number;
  health: '' | 'starting' | 'healthy' | 'unhealthy';
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function containerState(state: SupervisorState['state']): ContainerState {
  // Como no Docker: o processo continua "running" até terminar de desligar.
  if (state === 'stopping') return 'running';
  return state;
}

export class LocalControl implements ServiceControl {
  private readonly runDir: string;
  private readonly logDir: string;
  private readonly image: string;
  private readonly cgroupDir: string;
  private lastCpu: { usageUs: number; at: number } | undefined;

  constructor(options: { runDir: string; logDir: string; image: string; cgroupDir?: string }) {
    this.runDir = options.runDir;
    this.logDir = options.logDir;
    this.image = options.image;
    this.cgroupDir = options.cgroupDir ?? '/sys/fs/cgroup';
  }

  async readState(role: Role): Promise<SupervisorState | null> {
    try {
      return JSON.parse(await readFile(join(this.runDir, 'state', `${SERVICE[role]}.json`), 'utf8')) as SupervisorState;
    } catch {
      return null;
    }
  }

  async inspect(role: Role): Promise<ServiceDetails | null> {
    const s = await this.readState(role);
    if (!s) return null;
    const state = containerState(s.state);
    const info: ServiceDetails = {
      id: SERVICE[role],
      state,
      startedAt: s.startedAt || undefined,
      image: this.image,
      memoryLimit: role === 'server' ? await this.serverMemoryLimit() : 0,
      java: role === 'server' ? javaFromEnv(Object.entries(process.env).map(([k, v]) => `${k}=${v}`)) : null,
    };
    if (role === 'server' && state === 'running' && s.health) info.health = s.health;
    return info;
  }

  async info(role: Role): Promise<ContainerInfo> {
    const found = await this.inspect(role);
    if (!found) return { state: 'missing' };
    const { id: _id, memoryLimit: _limit, java: _java, ...info } = found;
    return info;
  }

  async action(role: Role, action: ControlAction, timeoutSeconds = 90): Promise<void> {
    const service = SERVICE[role];
    const before = await this.readState(role);
    if (!before) throw new Error(`Processo "${service}" não encontrado: o supervisor do container não está respondendo`);

    const id = `${Date.now()}-${randomBytes(4).toString('hex')}`;
    const file = join(this.runDir, 'control', `${id}.cmd`);
    // Grava ao lado e renomeia: o supervisor nunca lê um pedido pela metade.
    await writeFile(`${file}.tmp`, `${action} ${service}\n`);
    await rename(`${file}.tmp`, file);

    const pickupDeadline = Date.now() + PICKUP_TIMEOUT_MS;
    while (await exists(file)) {
      if (Date.now() > pickupDeadline) {
        await rm(file, { force: true });
        throw new Error(`O supervisor do container não atendeu o pedido "${action} ${service}"`);
      }
      await sleep(200);
    }

    // O supervisor manda o sinal na hora; desligar o servidor leva até STOP_DURATION (60 s).
    const deadline = Date.now() + (timeoutSeconds + 30) * 1000;
    while (Date.now() < deadline) {
      const s = await this.readState(role);
      if (!s) throw new Error(`Processo "${service}" sumiu do supervisor`);
      if (action === 'stop' && (s.state === 'exited' || s.state === 'created')) return;
      if (action === 'start' && (s.state === 'running' || s.state === 'restarting')) return;
      // Ligou de novo (ou já caiu e está tentando outra vez, como o Docker faria).
      if (action === 'restart' && s.starts > before.starts && s.state !== 'stopping') return;
      await sleep(300);
    }
    throw new Error(`Tempo esgotado esperando "${action} ${service}"`);
  }

  // --- Recursos (cgroup do container) ---------------------------------------------------------

  private async readNumber(file: string): Promise<number | null> {
    const text = (await readFile(join(this.cgroupDir, file), 'utf8').catch(() => '')).trim();
    if (!text || text === 'max') return null;
    const value = Number(text.split(/\s+/)[0]);
    return Number.isFinite(value) ? value : null;
  }

  private async readStat(file: string, key: string): Promise<number | null> {
    const text = await readFile(join(this.cgroupDir, file), 'utf8').catch(() => '');
    const match = text.match(new RegExp(`^${key} (\\d+)$`, 'm'));
    return match ? Number(match[1]) : null;
  }

  /** Limite do container (cgroup v2 ou v1); 0 quando não há limite. */
  private async containerMemoryLimit(): Promise<number> {
    const v2 = await this.readNumber('memory.max');
    if (v2 !== null) return v2;
    const v1 = await this.readNumber('memory/memory.limit_in_bytes');
    // No v1 "sem limite" é um número enorme (próximo de 2^63).
    if (v1 !== null && v1 < totalmem()) return v1;
    return 0;
  }

  private async serverMemoryLimit(): Promise<number> {
    const limit = await this.containerMemoryLimit();
    return limit > 0 ? Math.max(0, limit - SHARED_RESERVE_BYTES) : 0;
  }

  async stats(_role: Role): Promise<ServiceStats | null> {
    const v2Usage = await this.readNumber('memory.current');
    const usage = v2Usage ?? (await this.readNumber('memory/memory.usage_in_bytes'));
    if (usage === null) return null;
    const inactive =
      v2Usage !== null ? await this.readStat('memory.stat', 'inactive_file') : await this.readStat('memory/memory.stat', 'total_inactive_file');
    const limit = (await this.containerMemoryLimit()) || totalmem();

    // Tempo de CPU acumulado do container; o % sai da diferença para a leitura anterior.
    const usageUs = (await this.readStat('cpu.stat', 'usage_usec')) ?? ((await this.readNumber('cpuacct/cpuacct.usage')) ?? 0) / 1000;
    const now = performance.now();
    const previous = this.lastCpu;
    this.lastCpu = { usageUs, at: now };
    const elapsedUs = previous ? (now - previous.at) * 1000 : 0;
    const cpuPercent = previous && elapsedUs > 0 ? Math.max(0, ((usageUs - previous.usageUs) / elapsedUs) * 100) : null;

    return {
      memoryUsed: Math.max(0, usage - (inactive ?? 0)),
      memoryLimit: limit,
      cpuPercent,
      cpuCores: availableParallelism(),
    };
  }

  // --- Logs ------------------------------------------------------------------------------------

  async *logs(role: Role, options: { tail?: number; follow?: boolean; signal?: AbortSignal } = {}): AsyncGenerator<string> {
    const path = join(this.logDir, `${SERVICE[role]}.log`);
    const tail = options.tail ?? 200;
    const { signal } = options;

    let position = 0;
    let partial = '';
    const size = await stat(path).then((s) => s.size, () => 0);
    if (size > 0 && tail > 0) {
      // Só o fim do arquivo: 300 linhas de log do servidor cabem com folga em 256 KB.
      const start = Math.max(0, size - 256 * 1024);
      const text = await readRange(path, start, size);
      const lines = text.split('\n');
      partial = lines.pop() ?? '';
      if (start > 0) lines.shift();
      for (const line of lines.slice(-tail)) yield line.replace(/\r$/, '');
    }
    position = size;
    if (!options.follow) {
      if (partial) yield partial;
      return;
    }

    while (!signal?.aborted) {
      await sleep(500);
      if (signal?.aborted) return;
      const current = await stat(path).then((s) => s.size, () => 0);
      // Arquivo girado (o supervisor esvazia o log quando passa do limite): recomeça do início.
      if (current < position) {
        position = 0;
        partial = '';
      }
      if (current === position) continue;
      const text = partial + (await readRange(path, position, current));
      position = current;
      const lines = text.split('\n');
      partial = lines.pop() ?? '';
      for (const line of lines) yield line.replace(/\r$/, '');
    }
  }
}

async function exists(path: string): Promise<boolean> {
  return stat(path).then(
    () => true,
    () => false,
  );
}

async function readRange(path: string, start: number, end: number): Promise<string> {
  if (end <= start) return '';
  const handle = await open(path, 'r');
  try {
    const buffer = Buffer.alloc(end - start);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, start);
    return buffer.subarray(0, bytesRead).toString('utf8');
  } finally {
    await handle.close();
  }
}
