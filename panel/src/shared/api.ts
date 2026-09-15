/** Contratos das respostas da API, compartilhados entre backend e frontend. */

import type { JoinInfo } from './join-address.ts';
import type { WorldInfo } from './worlds.ts';

/** Início de um mundo guardado: só os dados dele, nada do servidor que está rodando. */
export interface WorldOverviewResponse {
  world: WorldInfo;
  counts: { whitelist: number; ops: number; banned: number };
  whitelistEnabled: boolean;
  /** Por que ele não pode ser ligado com a configuração atual, ou null. */
  blockReason: string | null;
}
import type { ModrinthEntry } from './modrinth.ts';
import type { Loader } from './settings.ts';

export type ContainerState = 'running' | 'exited' | 'restarting' | 'paused' | 'created' | 'dead' | 'missing';

export interface ContainerInfo {
  state: ContainerState;
  health?: 'starting' | 'healthy' | 'unhealthy';
  startedAt?: string;
  image?: string;
}

import type { BackupProvider, BackupSchedule, BackupSettings } from './backup-destination.ts';

export interface StatusResponse {
  server: ContainerInfo;
  backup: ContainerInfo;
  /** Portão Minetune (senha por nick); state "missing" em instalações sem ele. */
  gate?: ContainerInfo;
  /** cpuPercent: 100 = um núcleo inteiro (padrão do Docker); cpuCores: núcleos disponíveis. */
  resources?: { memoryUsed: number; memoryLimit: number; cpuPercent: number | null; cpuCores: number };
  players?: { online: number; max: number; names: string[] };
  tps?: number[];
  game: { type: string; version: string; motd: string };
  lastBackup?: SnapshotInfo;
  backupProvider: BackupProvider;
  /** "Precisa de atenção" da tela Início: cada item com a frase e o que resolve. */
  attention: AttentionItem[];
  join: JoinInfo;
  /** Pasta do mundo ligado (LEVEL). */
  world?: string;
}

export interface AttentionItem {
  id: 'server-stopped' | 'server-crashing' | 'server-unhealthy' | 'gate-stopped' | 'backup-local' | 'backup-old' | 'memory' | 'performance';
  tone: 'warning' | 'danger';
  title: string;
  text: string;
  action?: { label: string; href?: string; server?: 'start'; gate?: 'start' };
}

export interface SettingsResponse {
  values: Record<string, string>;
  /** Chaves presentes no server.env que o painel não conhece (preservadas ao salvar). */
  unmanaged: string[];
  /** De qual mundo é esta configuração; inherited = guardado que ainda usa a do mundo ligado. */
  world?: { folder: string; active: boolean; inherited: boolean };
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
  /** Regras lidas do arquivo de um mundo guardado: só para ver, mudar exige ligar o mundo. */
  readOnly?: boolean;
}

export interface PlayerRef {
  name: string;
  uuid?: string;
}

export interface PlayersResponse {
  /** Só convidados podem entrar (ENABLE_WHITELIST). */
  whitelistEnabled: boolean;
  serverOnline: boolean;
  online: string[];
  max: number;
  whitelist: PlayerRef[];
  ops: (PlayerRef & { level?: number })[];
  banned: (PlayerRef & { reason?: string; expires?: string })[];
  join: JoinInfo;
  /** false: é um mundo guardado, e as listas são as guardadas com ele (só leitura). */
  worldActive: boolean;
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
  provider: BackupProvider;
  schedule: BackupSchedule;
  /** true quando destino e agenda vêm do config/backup.env salvo pelo painel. */
  managedByPanel: boolean;
  snapshots: SnapshotInfo[];
}

export interface BackupSettingsResponse {
  settings: BackupSettings;
  /** Existe segredo salvo (nunca é enviado ao navegador). */
  hasSecret: boolean;
  managedByPanel: boolean;
}

export interface BackupTestResponse {
  /** ok = repositório existente e legível; empty = destino acessível, sem repositório ainda. */
  status: 'ok' | 'empty';
}

export type JobKind = 'backup' | 'restore' | 'apply-settings' | 'world-create' | 'world-switch' | 'world-delete' | 'world-upload' | 'world-restore';

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
