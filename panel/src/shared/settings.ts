/**
 * Catálogo das configurações editáveis pelo painel (config/server.env).
 *
 * Fonte única de verdade: o frontend gera os formulários a partir daqui e o
 * backend valida com as mesmas regras. Os nomes são as variáveis da imagem
 * itzg/minecraft-server (que as converte para server.properties).
 *
 * Os textos (nome, ajuda, aviso, opções) ficam em shared/i18n/settings.ts, nas três
 * línguas: aqui só a estrutura, para não existir uma segunda cópia em português.
 */

import { PT, type Messages } from './i18n/index.ts';
import type { FieldText } from './i18n/settings.ts';

export type { FieldText } from './i18n/settings.ts';

export type FieldType = 'text' | 'number' | 'boolean' | 'select' | 'memory' | 'version';

/** Opção pronta para um select: valor do catálogo com o texto na língua da tela. */
export interface SelectOption {
  value: string;
  label: string;
}

export type SettingGroupId = 'server' | 'world' | 'gameplay' | 'performance' | 'access' | 'crossplay' | 'resourcepack';

export interface SettingGroup {
  id: SettingGroupId;
}

export interface SettingField {
  key: string;
  group: SettingGroupId;
  type: FieldType;
  /** Valores aceitos; o texto de cada um vem de m.settings.fields[key].options. */
  options?: { value: string }[];
  min?: number;
  max?: number;
  /** Campo só faz sentido quando outra chave tem um destes valores. */
  visibleWhen?: { key: string; values: string[] };
  /** Mudança com risco para o mundo: o painel pede confirmação e sugere backup. O aviso vem dos textos. */
  danger?: true;
  /** Termo técnico ou fácil de quebrar o servidor. Configurações mostra tudo; marcado para quem quiser filtrar depois. */
  advanced?: boolean;
  /** Sim/não sem valor no server.env: o que o servidor usa. O interruptor mostra isso, não "desligado". */
  serverDefault?: 'true' | 'false';
}

export const SETTING_GROUPS: SettingGroup[] = [
  { id: 'server' },
  { id: 'world' },
  { id: 'gameplay' },
  { id: 'performance' },
  { id: 'access' },
  { id: 'crossplay' },
  { id: 'resourcepack' },
];

/**
 * Opções ligadas quando ninguém define: as do Minecraft (server.properties) e as otimizações do
 * Minetune (docker/minecraft/entrypoint.sh usa APPLY_PAPER_OPTIMIZATIONS:-true). As outras começam desligadas.
 */
const ON_BY_DEFAULT = new Set([
  'GENERATE_STRUCTURES',
  'ALLOW_NETHER',
  'PVP',
  'ONLINE_MODE',
  'ENFORCE_SECURE_PROFILE',
  'SYNC_CHUNK_WRITES',
  'APPLY_PAPER_OPTIMIZATIONS',
]);

const bool = (key: string, group: SettingGroupId): SettingField => ({
  key,
  group,
  type: 'boolean',
  serverDefault: ON_BY_DEFAULT.has(key) ? 'true' : 'false',
});

const values = (...list: string[]) => list.map((value) => ({ value }));

const PLUGIN_TYPES = ['PAPER', 'PURPUR'];
const MODDED_OR_PLUGIN_TYPES = ['PAPER', 'PURPUR', 'FABRIC', 'NEOFORGE'];

export const SETTINGS: SettingField[] = [
  // --- Servidor ---
  { key: 'TYPE', group: 'server', type: 'select', options: values('PAPER', 'PURPUR', 'FABRIC', 'NEOFORGE', 'VANILLA'), danger: true },
  { key: 'VERSION', group: 'server', type: 'version', danger: true },
  { key: 'MEMORY', group: 'performance', type: 'memory' },
  { ...bool('USE_AIKAR_FLAGS', 'performance'), advanced: true },
  { ...bool('USE_MEOWICE_FLAGS', 'performance'), advanced: true },
  { key: 'MOTD', group: 'server', type: 'text' },
  { key: 'MAX_PLAYERS', group: 'server', type: 'number', min: 1, max: 1000 },
  { ...bool('ONLINE_MODE', 'access'), advanced: true },

  // --- Mundo ---
  { key: 'LEVEL', group: 'world', type: 'text', danger: true, advanced: true },
  { key: 'SEED', group: 'world', type: 'text', advanced: true },
  {
    key: 'LEVEL_TYPE',
    group: 'world',
    type: 'select',
    advanced: true,
    options: values('minecraft:normal', 'minecraft:large_biomes', 'minecraft:amplified', 'minecraft:flat', 'minecraft:single_biome_surface'),
  },
  bool('GENERATE_STRUCTURES', 'world'),
  bool('ALLOW_NETHER', 'world'),
  { key: 'MAX_WORLD_SIZE', group: 'world', type: 'number', min: 1, max: 29999984, advanced: true },
  { key: 'SPAWN_PROTECTION', group: 'world', type: 'number', min: 0, max: 1000 },

  // --- Jogabilidade ---
  { key: 'MODE', group: 'gameplay', type: 'select', options: values('survival', 'creative', 'adventure', 'spectator') },
  bool('FORCE_GAMEMODE', 'gameplay'),
  { key: 'DIFFICULTY', group: 'gameplay', type: 'select', options: values('peaceful', 'easy', 'normal', 'hard') },
  bool('HARDCORE', 'gameplay'),
  bool('PVP', 'gameplay'),
  bool('ALLOW_FLIGHT', 'gameplay'),
  bool('ENABLE_COMMAND_BLOCK', 'gameplay'),
  { key: 'PLAYER_IDLE_TIMEOUT', group: 'gameplay', type: 'number', min: 0, max: 1440 },

  // --- Desempenho ---
  { key: 'VIEW_DISTANCE', group: 'performance', type: 'number', min: 2, max: 32 },
  { key: 'SIMULATION_DISTANCE', group: 'performance', type: 'number', min: 2, max: 32 },
  { key: 'ENTITY_BROADCAST_RANGE_PERCENTAGE', group: 'performance', type: 'number', min: 10, max: 1000, advanced: true },
  { key: 'NETWORK_COMPRESSION_THRESHOLD', group: 'performance', type: 'number', min: -1, max: 65535, advanced: true },
  { key: 'PAUSE_WHEN_EMPTY_SECONDS', group: 'performance', type: 'number', min: 0, max: 86400 },
  { ...bool('APPLY_PAPER_OPTIMIZATIONS', 'performance'), visibleWhen: { key: 'TYPE', values: PLUGIN_TYPES } },
  { ...bool('SYNC_CHUNK_WRITES', 'performance'), advanced: true },

  // --- Acesso ---
  bool('ENABLE_WHITELIST', 'access'),
  bool('ENFORCE_WHITELIST', 'access'),
  { ...bool('ENFORCE_SECURE_PROFILE', 'access'), advanced: true },
  { ...bool('PREVENT_PROXY_CONNECTIONS', 'access'), advanced: true },
  bool('HIDE_ONLINE_PLAYERS', 'access'),
  { key: 'OP_PERMISSION_LEVEL', group: 'access', type: 'select', options: values('1', '2', '3', '4') },
  { key: 'RATE_LIMIT', group: 'access', type: 'number', min: 0, max: 100000, advanced: true },

  // --- Crossplay ---
  { ...bool('BEDROCK_CROSSPLAY', 'crossplay'), visibleWhen: { key: 'TYPE', values: MODDED_OR_PLUGIN_TYPES } },

  // --- Resource pack ---
  { key: 'RESOURCE_PACK', group: 'resourcepack', type: 'text' },
  { key: 'RESOURCE_PACK_SHA1', group: 'resourcepack', type: 'text', advanced: true },
  bool('RESOURCE_PACK_ENFORCE', 'resourcepack'),
  { key: 'RESOURCE_PACK_PROMPT', group: 'resourcepack', type: 'text' },
];

export const SETTINGS_BY_KEY = new Map(SETTINGS.map((field) => [field.key, field]));

/** Textos de uma configuração na língua pedida (nome, ajuda, aviso, placeholder, opções). */
export function fieldText(key: string, m: Messages = PT): FieldText {
  return (m.settings.fields as Record<string, FieldText>)[key] ?? { label: key };
}

/** Opções de um select com o texto na língua pedida; valor sem texto aparece cru. */
export function settingOptions(field: SettingField | string, m: Messages = PT): SelectOption[] {
  const def = typeof field === 'string' ? SETTINGS_BY_KEY.get(field) : field;
  if (!def?.options) return [];
  const labels = fieldText(def.key, m).options ?? {};
  return def.options.map(({ value }) => ({ value, label: labels[value] ?? value }));
}

/**
 * O que se escolhe ao criar um mundo, além de nome, seed e tipo de mapa: o que é difícil de
 * mudar depois (versão converte o mapa, tipo decide plugins ou mods, estruturas e hardcore
 * valem desde o primeiro chunk).
 */
export const WORLD_BASE_KEYS = ['TYPE', 'VERSION', 'MODE', 'DIFFICULTY', 'HARDCORE', 'PVP', 'GENERATE_STRUCTURES', 'ALLOW_NETHER'] as const;

/** Chaves que o painel nunca grava: são de infraestrutura ou derivadas pelo entrypoint. */
export const RESERVED_KEYS = new Set([
  'EULA',
  'ENABLE_RCON',
  'RCON_PASSWORD',
  'RCON_PORT',
  'SERVER_PORT',
  'TZ',
  'MODRINTH_PROJECTS',
  'PATCH_DEFINITIONS',
]);

const MEMORY_RE = /^[1-9]\d*[MG]$/i;

/**
 * Valida um valor. Retorna mensagem de erro (na língua de `m`) ou null. String vazia = remover (usar padrão).
 * `m` fica por último e em português por padrão: testes e CLI chamam sem língua.
 */
export function validateSetting(field: SettingField, value: string, m: Messages = PT): string | null {
  const errors = m.settings.errors;
  if (value === '') return null;
  if (/[\r\n\0]/.test(value)) return errors.newline;
  if (value.length > 512) return errors.maxLength(512);

  switch (field.type) {
    case 'boolean':
      return value === 'true' || value === 'false' ? null : errors.useBoolean;
    case 'number': {
      if (!/^-?\d+$/.test(value)) return errors.integer;
      const n = Number(value);
      if (field.min !== undefined && n < field.min) return errors.min(field.min);
      if (field.max !== undefined && n > field.max) return errors.max(field.max);
      return null;
    }
    case 'select':
      return field.options?.some((o) => o.value === value) ? null : errors.invalidOption;
    case 'memory':
      return MEMORY_RE.test(value) ? null : errors.memoryFormat;
    case 'version':
      return /^(LATEST|SNAPSHOT|[0-9][0-9A-Za-z.+-]*)$/.test(value) ? null : errors.versionFormat;
    case 'text':
      return null;
  }
}

/** Converte "4G"/"3072M" em bytes. */
export function parseMemory(value: string): number | null {
  if (!MEMORY_RE.test(value)) return null;
  const n = Number(value.slice(0, -1));
  const unit = value.at(-1)!.toUpperCase();
  return n * (unit === 'G' ? 1024 ** 3 : 1024 ** 2);
}

export type Loader = 'paper' | 'fabric' | 'neoforge' | 'forge';

/** Mesmo mapeamento do docker/minecraft/entrypoint.sh. */
export function loaderForType(type: string | undefined): Loader | null {
  switch ((type ?? 'PAPER').toUpperCase()) {
    case 'PAPER':
    case 'PURPUR':
    case 'FOLIA':
    case 'PUFFERFISH':
    case 'LEAF':
      return 'paper';
    case 'FABRIC':
    case 'QUILT':
      return 'fabric';
    case 'NEOFORGE':
      return 'neoforge';
    case 'FORGE':
      return 'forge';
    default:
      return null;
  }
}
