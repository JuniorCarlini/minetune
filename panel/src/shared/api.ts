/** Contratos das respostas da API, compartilhados entre backend e frontend. */

import type { ModrinthEntry } from './modrinth.ts';
import type { Loader } from './settings.ts';

export type ContainerState = 'running' | 'exited' | 'restarting' | 'paused' | 'created' | 'dead' | 'missing';

export interface ContainerInfo {
  state: ContainerState;
  health?: 'starting' | 'healthy' | 'unhealthy';
  startedAt?: string;
  image?: string;
}

export interface StatusResponse {
  server: ContainerInfo;
  backup: ContainerInfo;
  resources?: { memoryUsed: number; memoryLimit: number; cpuPercent: number | null };
  players?: { online: number; max: number; names: string[] };
  tps?: number[];
  game: { type: string; version: string; motd: string };
  lastBackup?: SnapshotInfo;
}

export interface SettingsResponse {
  values: Record<string, string>;
  /** Chaves presentes no server.env que o painel não conhece (preservadas ao salvar). */
  unmanaged: string[];
  memoryLimitBytes?: number;
}

export interface SaveSettingsResponse {
  changed: string[];
  jobId?: string;
}

export interface GameRuleValue {
  name: string;
  /** Nome efetivamente aceito pelo servidor (moderno ou legado). */
  serverName: string;
  value: string;
}

export interface GameRulesResponse {
  naming: 'modern' | 'legacy';
  rules: GameRuleValue[];
}

export interface PlayerRef {
  name: string;
  uuid?: string;
}

export interface PlayersResponse {
  serverOnline: boolean;
  online: string[];
  max: number;
  whitelist: PlayerRef[];
  ops: (PlayerRef & { level?: number })[];
  banned: (PlayerRef & { reason?: string; expires?: string })[];
}

export type PlayerAction = 'whitelist-add' | 'whitelist-remove' | 'op' | 'deop' | 'kick' | 'ban' | 'pardon';

export interface ModrinthListResponse {
  loader: Loader | null;
  entries: ModrinthEntry[];
}

export interface ModrinthSearchHit {
  slug: string;
  title: string;
  description: string;
  iconUrl?: string;
  downloads: number;
  author: string;
}

export interface SnapshotInfo {
  id: string;
  shortId: string;
  time: string;
  tags: string[];
  sizeBytes?: number;
}

export interface BackupsResponse {
  repository: string;
  schedule: { interval: string; retention: string };
  snapshots: SnapshotInfo[];
}

export type JobKind = 'backup' | 'restore' | 'apply-settings';

export interface JobInfo {
  id: string;
  kind: JobKind;
  status: 'running' | 'succeeded' | 'failed';
  startedAt: string;
  finishedAt?: string;
  progress?: number;
  logs: string[];
  error?: string;
}
