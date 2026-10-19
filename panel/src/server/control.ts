/**
 * Quem liga, desliga e observa os processos do Minetune. Duas formas, mesma interface:
 *
 *   docker  (padrão)  cada parte num container; o painel fala com a API do Docker pelo
 *                     socket-proxy (compose.yaml, EasyPanel, Umbrel). Ver docker.ts.
 *   local             container único (ghcr.io/juniorcarlini/minetune): tudo roda sob o
 *                     supervisor do container, sem acesso ao Docker. Ver local-control.ts.
 */

import type { ContainerInfo } from '../shared/api.ts';

export type Role = 'server' | 'backup' | 'gate';
export type ControlAction = 'start' | 'stop' | 'restart';

export interface ServiceDetails extends ContainerInfo {
  id: string;
  /** Limite de memória que vale para o servidor (0 = sem limite). */
  memoryLimit: number;
  /** Java da JVM que roda o servidor, quando dá para saber. */
  java: number | null;
}

export interface ServiceStats {
  memoryUsed: number;
  memoryLimit: number;
  cpuPercent: number | null;
  cpuCores: number;
}

export interface ServiceControl {
  inspect(role: Role): Promise<ServiceDetails | null>;
  info(role: Role): Promise<ContainerInfo>;
  stats(role: Role): Promise<ServiceStats | null>;
  /** Só volta quando o pedido terminou (parado, ou ligado de novo), como a API do Docker. */
  action(role: Role, action: ControlAction, timeoutSeconds?: number): Promise<void>;
  /** Linhas de log (stdout+stderr). Encerra quando o signal aborta. */
  logs(role: Role, options?: { tail?: number; follow?: boolean; signal?: AbortSignal }): AsyncGenerator<string>;
}
