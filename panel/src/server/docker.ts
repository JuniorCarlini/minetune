/**
 * Cliente mínimo da API do Docker, via socket-proxy (ver compose.yaml).
 * Só usa o que o proxy libera: listar/inspecionar/logs/stats e start/stop/restart.
 *
 * Os containers são encontrados por label (minetune.instance + minetune.role),
 * então funciona igual com compose, EasyPanel ou nomes de container diferentes.
 */

import type { ContainerInfo, ContainerState } from '../shared/api.ts';

export type Role = 'server' | 'backup';

export class DockerError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

interface ContainerSummary {
  Id: string;
  State: ContainerState;
  Image: string;
}

interface ContainerInspect {
  Id: string;
  State: { Status: ContainerState; StartedAt: string; Health?: { Status: ContainerInfo['health'] } };
  Config: { Image: string };
  HostConfig: { Memory: number };
}

interface ContainerStats {
  cpu_stats: { cpu_usage: { total_usage: number }; system_cpu_usage?: number; online_cpus?: number };
  precpu_stats: { cpu_usage: { total_usage: number }; system_cpu_usage?: number };
  memory_stats: { usage?: number; limit?: number; stats?: { inactive_file?: number } };
}

export class DockerClient {
  private readonly baseUrl: string;
  private readonly instance: string;
  /** Última amostra de CPU por container, para calcular o % sem a espera do Docker. */
  private readonly lastCpu = new Map<string, { total: number; system: number }>();

  constructor(baseUrl: string, instance: string) {
    this.baseUrl = baseUrl;
    this.instance = instance;
  }

  private async request(path: string, init?: RequestInit): Promise<Response> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, init);
    } catch (err) {
      throw new DockerError(`API do Docker indisponível: ${(err as Error).message}`);
    }
    // 304 = container já estava no estado pedido (start/stop).
    if (!res.ok && res.status !== 304) {
      const text = await res.text().catch(() => '');
      throw new DockerError(`Docker respondeu ${res.status} em ${path}: ${text.slice(0, 200)}`, res.status);
    }
    return res;
  }

  async findId(role: Role): Promise<string | null> {
    const filters = JSON.stringify({ label: [`minetune.instance=${this.instance}`, `minetune.role=${role}`] });
    const res = await this.request(`/containers/json?all=true&filters=${encodeURIComponent(filters)}`);
    const list = (await res.json()) as ContainerSummary[];
    // Prefere o que está rodando (durante um recreate podem existir dois).
    const found = list.find((c) => c.State === 'running') ?? list[0];
    return found?.Id ?? null;
  }

  async inspect(role: Role): Promise<(ContainerInfo & { id: string; memoryLimit: number }) | null> {
    const id = await this.findId(role);
    if (!id) return null;
    const res = await this.request(`/containers/${id}/json`);
    const data = (await res.json()) as ContainerInspect;
    return {
      id,
      state: data.State.Status,
      health: data.State.Health?.Status,
      startedAt: data.State.StartedAt,
      image: data.Config.Image,
      memoryLimit: data.HostConfig.Memory,
    };
  }

  async info(role: Role): Promise<ContainerInfo> {
    const found = await this.inspect(role);
    if (!found) return { state: 'missing' };
    const { id: _id, memoryLimit: _limit, ...info } = found;
    return info;
  }

  async stats(role: Role): Promise<{ memoryUsed: number; memoryLimit: number; cpuPercent: number | null } | null> {
    const id = await this.findId(role);
    if (!id) return null;
    // one-shot responde em ~90ms. Sem ele o Docker espera ~2s para colher duas amostras e
    // calcular o delta de CPU — era isso que deixava a visão geral lenta. O delta sai da
    // amostra anterior guardada aqui; a primeira leitura de cada container vem sem %.
    const res = await this.request(`/containers/${id}/stats?stream=false&one-shot=true`);
    const s = (await res.json()) as ContainerStats;

    const current = { total: s.cpu_stats.cpu_usage.total_usage, system: s.cpu_stats.system_cpu_usage ?? 0 };
    const previous = this.lastCpu.get(id);
    this.lastCpu.set(id, current);
    const cpuDelta = previous ? current.total - previous.total : -1;
    const systemDelta = previous ? current.system - previous.system : 0;
    const cpus = s.cpu_stats.online_cpus ?? 1;
    const cpuPercent = systemDelta > 0 && cpuDelta >= 0 ? (cpuDelta / systemDelta) * cpus * 100 : null;

    const usage = s.memory_stats.usage ?? 0;
    return {
      memoryUsed: Math.max(0, usage - (s.memory_stats.stats?.inactive_file ?? 0)),
      memoryLimit: s.memory_stats.limit ?? 0,
      cpuPercent,
    };
  }

  async action(role: Role, action: 'start' | 'stop' | 'restart', timeoutSeconds = 90): Promise<void> {
    const id = await this.findId(role);
    if (!id) throw new DockerError(`Container "${role}" não encontrado (instância ${this.instance})`, 404);
    const query = action === 'start' ? '' : `?t=${timeoutSeconds}`;
    await this.request(`/containers/${id}/${action}${query}`, { method: 'POST' });
  }

  /** Stream de linhas de log (stdout+stderr). Encerra quando o signal aborta. */
  async *logs(role: Role, options: { tail?: number; follow?: boolean; signal?: AbortSignal } = {}): AsyncGenerator<string> {
    const id = await this.findId(role);
    if (!id) throw new DockerError(`Container "${role}" não encontrado`, 404);

    const query = new URLSearchParams({
      stdout: 'true',
      stderr: 'true',
      follow: String(options.follow ?? false),
      tail: String(options.tail ?? 200),
    });
    const res = await this.request(`/containers/${id}/logs?${query}`, { signal: options.signal });
    if (!res.body) return;

    // Sem TTY o Docker multiplexa stdout/stderr: cabeçalho de 8 bytes + payload.
    let pendingBytes = new Uint8Array(0);
    let partialLine = '';
    const decoder = new TextDecoder();

    try {
      for await (const chunk of res.body) {
        const merged = new Uint8Array(pendingBytes.length + chunk.length);
        merged.set(pendingBytes);
        merged.set(chunk, pendingBytes.length);

        let offset = 0;
        while (merged.length - offset >= 8) {
          const size = new DataView(merged.buffer, merged.byteOffset + offset + 4, 4).getUint32(0);
          if (merged.length - offset - 8 < size) break;
          partialLine += decoder.decode(merged.subarray(offset + 8, offset + 8 + size));
          offset += 8 + size;
        }
        pendingBytes = merged.slice(offset);

        const lines = partialLine.split('\n');
        partialLine = lines.pop() ?? '';
        for (const line of lines) yield line.replace(/\r$/, '');
      }
    } catch (err) {
      if (options.signal?.aborted) return;
      throw err;
    }
    if (partialLine) yield partialLine;
  }
}
