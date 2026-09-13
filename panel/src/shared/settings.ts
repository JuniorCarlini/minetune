/**
 * Catálogo das configurações editáveis pelo painel (config/server.env).
 *
 * Fonte única de verdade: o frontend gera os formulários a partir daqui e o
 * backend valida com as mesmas regras. Os nomes são as variáveis da imagem
 * itzg/minecraft-server (que as converte para server.properties).
 */

export type FieldType = 'text' | 'number' | 'boolean' | 'select' | 'memory' | 'version';

export interface SelectOption {
  value: string;
  label: string;
}

export type SettingGroupId =
  | 'server'
  | 'world'
  | 'gameplay'
  | 'performance'
  | 'access'
  | 'crossplay'
  | 'resourcepack';

export interface SettingGroup {
  id: SettingGroupId;
  label: string;
  description: string;
}

export interface SettingField {
  key: string;
  label: string;
  group: SettingGroupId;
  type: FieldType;
  help?: string;
  options?: SelectOption[];
  min?: number;
  max?: number;
  placeholder?: string;
  /** Campo só faz sentido quando outra chave tem um destes valores. */
  visibleWhen?: { key: string; values: string[] };
  /** Mudança com risco para o mundo: o painel pede confirmação e sugere backup. */
  danger?: string;
}

export const SETTING_GROUPS: SettingGroup[] = [
  { id: 'server', label: 'Servidor', description: 'Software, versão e recursos da JVM' },
  { id: 'world', label: 'Mundo', description: 'Geração e identidade do mundo' },
  { id: 'gameplay', label: 'Jogabilidade', description: 'Modo de jogo, dificuldade e comportamento' },
  { id: 'performance', label: 'Desempenho', description: 'Distâncias, rede e otimizações' },
  { id: 'access', label: 'Acesso e segurança', description: 'Quem entra e com quais permissões' },
  { id: 'crossplay', label: 'Crossplay Bedrock', description: 'Jogadores de celular/console via Geyser' },
  { id: 'resourcepack', label: 'Resource pack', description: 'Pacote de recursos enviado aos jogadores' },
];

const bool = (key: string, label: string, group: SettingGroupId, help?: string): SettingField => ({
  key,
  label,
  group,
  type: 'boolean',
  help,
});

const PLUGIN_TYPES = ['PAPER', 'PURPUR'];
const MODDED_OR_PLUGIN_TYPES = ['PAPER', 'PURPUR', 'FABRIC', 'NEOFORGE'];

export const SETTINGS: SettingField[] = [
  // --- Servidor ---
  {
    key: 'TYPE',
    label: 'Software do servidor',
    group: 'server',
    type: 'select',
    options: [
      { value: 'PAPER', label: 'Paper — plugins, melhor desempenho (recomendado)' },
      { value: 'PURPUR', label: 'Purpur — Paper com opções extras' },
      { value: 'FABRIC', label: 'Fabric — mods' },
      { value: 'NEOFORGE', label: 'NeoForge — mods' },
      { value: 'VANILLA', label: 'Vanilla — oficial da Mojang' },
    ],
    danger: 'Trocar o software torna os plugins/mods atuais incompatíveis e pode afetar o mundo.',
  },
  {
    key: 'VERSION',
    label: 'Versão do Minecraft',
    group: 'server',
    type: 'version',
    placeholder: '26.2',
    help: 'Lista oficial do software escolhido. Fixar uma versão evita atualizações surpresa; atualizar converte o mundo e não tem volta.',
    danger: 'Atualizar converte o mundo para o novo formato e não é possível voltar sem backup.',
  },
  {
    key: 'MEMORY',
    label: 'Memória da JVM (heap)',
    group: 'server',
    type: 'memory',
    placeholder: '4G',
    help: 'Ex.: 4G ou 3072M. Deixe 1–1.5 GB de folga abaixo do limite do container (MC_MEMORY_LIMIT).',
  },
  bool('USE_AIKAR_FLAGS', 'Flags de JVM otimizadas (Aikar)', 'server', 'Ajustes de garbage collector que reduzem travadas. Seguro em x86 e ARM.'),
  bool(
    'USE_MEOWICE_FLAGS',
    'Flags MeowIce (experimental)',
    'server',
    'Variante mais agressiva das flags Aikar. Derrubou a JVM em ARM64 nos testes; use só em x86 e observe.',
  ),
  { key: 'MOTD', label: 'Mensagem na lista de servidores (MOTD)', group: 'server', type: 'text' },
  { key: 'MAX_PLAYERS', label: 'Máximo de jogadores', group: 'server', type: 'number', min: 1, max: 1000 },
  bool(
    'ONLINE_MODE',
    'Modo online (contas oficiais)',
    'server',
    'Desligado, qualquer um entra com qualquer nick. Só desligue atrás de um proxy (Velocity) ou em LAN.',
  ),

  // --- Mundo ---
  {
    key: 'LEVEL',
    label: 'Nome do mundo',
    group: 'world',
    type: 'text',
    placeholder: 'world',
    help: 'Pasta do mundo. Um nome novo cria outro mundo; o atual continua salvo.',
    danger: 'O servidor passará a carregar outro mundo.',
  },
  { key: 'SEED', label: 'Seed', group: 'world', type: 'text', help: 'Só vale na criação do mundo.' },
  {
    key: 'LEVEL_TYPE',
    label: 'Tipo de mundo',
    group: 'world',
    type: 'select',
    help: 'Só vale na criação do mundo.',
    options: [
      { value: 'minecraft:normal', label: 'Normal' },
      { value: 'minecraft:large_biomes', label: 'Biomas grandes' },
      { value: 'minecraft:amplified', label: 'Amplificado' },
      { value: 'minecraft:flat', label: 'Plano' },
      { value: 'minecraft:single_biome_surface', label: 'Bioma único' },
    ],
  },
  bool('GENERATE_STRUCTURES', 'Gerar estruturas (vilas, templos...)', 'world'),
  bool('ALLOW_NETHER', 'Permitir Nether', 'world'),
  { key: 'MAX_WORLD_SIZE', label: 'Raio máximo do mundo (blocos)', group: 'world', type: 'number', min: 1, max: 29999984 },
  {
    key: 'SPAWN_PROTECTION',
    label: 'Proteção do spawn (blocos)',
    group: 'world',
    type: 'number',
    min: 0,
    max: 1000,
    help: '0 desativa. Não-operadores não constroem nesse raio.',
  },

  // --- Jogabilidade ---
  {
    key: 'MODE',
    label: 'Modo de jogo padrão',
    group: 'gameplay',
    type: 'select',
    options: [
      { value: 'survival', label: 'Sobrevivência' },
      { value: 'creative', label: 'Criativo' },
      { value: 'adventure', label: 'Aventura' },
      { value: 'spectator', label: 'Espectador' },
    ],
  },
  bool('FORCE_GAMEMODE', 'Forçar modo de jogo ao entrar', 'gameplay'),
  {
    key: 'DIFFICULTY',
    label: 'Dificuldade',
    group: 'gameplay',
    type: 'select',
    options: [
      { value: 'peaceful', label: 'Pacífico' },
      { value: 'easy', label: 'Fácil' },
      { value: 'normal', label: 'Normal' },
      { value: 'hard', label: 'Difícil' },
    ],
  },
  bool('HARDCORE', 'Hardcore', 'gameplay', 'Morreu, vira espectador.'),
  bool('PVP', 'PvP', 'gameplay', 'Nas versões novas também existe a regra de jogo "pvp".'),
  bool('ALLOW_FLIGHT', 'Permitir voo', 'gameplay', 'Evita kick por "voo" em jogadores com elytra lenta ou mods de movimento.'),
  bool('ENABLE_COMMAND_BLOCK', 'Blocos de comando', 'gameplay'),
  {
    key: 'PLAYER_IDLE_TIMEOUT',
    label: 'Kick por inatividade (minutos)',
    group: 'gameplay',
    type: 'number',
    min: 0,
    max: 1440,
    help: '0 desativa.',
  },

  // --- Desempenho ---
  {
    key: 'VIEW_DISTANCE',
    label: 'Distância de visão (chunks)',
    group: 'performance',
    type: 'number',
    min: 2,
    max: 32,
    help: 'Chunks enviados ao jogador. Pesa em RAM e banda.',
  },
  {
    key: 'SIMULATION_DISTANCE',
    label: 'Distância de simulação (chunks)',
    group: 'performance',
    type: 'number',
    min: 2,
    max: 32,
    help: 'Chunks com mobs, redstone e plantações ativos. É o que mais pesa na CPU.',
  },
  {
    key: 'ENTITY_BROADCAST_RANGE_PERCENTAGE',
    label: 'Alcance de exibição de entidades (%)',
    group: 'performance',
    type: 'number',
    min: 10,
    max: 1000,
  },
  {
    key: 'NETWORK_COMPRESSION_THRESHOLD',
    label: 'Limite de compressão de rede (bytes)',
    group: 'performance',
    type: 'number',
    min: -1,
    max: 65535,
    help: 'Padrão 256. Aumente se a CPU for o gargalo e a banda sobrar.',
  },
  {
    key: 'PAUSE_WHEN_EMPTY_SECONDS',
    label: 'Pausar servidor vazio após (segundos)',
    group: 'performance',
    type: 'number',
    min: 0,
    max: 86400,
    help: 'Para de processar ticks quando não há jogadores. 0 desativa.',
  },
  {
    ...bool(
      'APPLY_PAPER_OPTIMIZATIONS',
      'Otimizações do Paper (minetune)',
      'performance',
      'Aplica config/patches/paper: explosões otimizadas, redstone Alternate Current, limites de entidades salvas.',
    ),
    visibleWhen: { key: 'TYPE', values: PLUGIN_TYPES },
  },
  bool('SYNC_CHUNK_WRITES', 'Escrita síncrona de chunks', 'performance', 'Mais seguro contra queda de energia, mais lento no disco.'),

  // --- Acesso ---
  bool('ENABLE_WHITELIST', 'Lista de permitidos (whitelist)', 'access', 'Só jogadores na whitelist entram. Gerencie em "Jogadores".'),
  bool('ENFORCE_WHITELIST', 'Expulsar quem sair da whitelist', 'access'),
  bool('ENFORCE_SECURE_PROFILE', 'Exigir chat assinado (Mojang)', 'access'),
  bool('PREVENT_PROXY_CONNECTIONS', 'Bloquear conexões via proxy/VPN', 'access'),
  bool('HIDE_ONLINE_PLAYERS', 'Esconder jogadores online na lista de servidores', 'access'),
  {
    key: 'OP_PERMISSION_LEVEL',
    label: 'Nível de permissão dos operadores',
    group: 'access',
    type: 'select',
    options: [
      { value: '1', label: '1 — ignorar proteção do spawn' },
      { value: '2', label: '2 — comandos de trapaça e blocos de comando' },
      { value: '3', label: '3 — comandos de moderação (kick/ban/op)' },
      { value: '4', label: '4 — todos os comandos, incluindo /stop' },
    ],
  },
  {
    key: 'RATE_LIMIT',
    label: 'Limite de pacotes por segundo',
    group: 'access',
    type: 'number',
    min: 0,
    max: 100000,
    help: '0 desativa. Protege contra clientes que inundam o servidor.',
  },

  // --- Crossplay ---
  {
    ...bool(
      'BEDROCK_CROSSPLAY',
      'Aceitar jogadores Bedrock',
      'crossplay',
      'Instala Geyser + Floodgate. Jogadores Bedrock conectam na porta UDP 19132 e não precisam de conta Java.',
    ),
    visibleWhen: { key: 'TYPE', values: MODDED_OR_PLUGIN_TYPES },
  },

  // --- Resource pack ---
  { key: 'RESOURCE_PACK', label: 'URL do resource pack', group: 'resourcepack', type: 'text', placeholder: 'https://...' },
  { key: 'RESOURCE_PACK_SHA1', label: 'SHA-1 do resource pack', group: 'resourcepack', type: 'text' },
  bool('RESOURCE_PACK_ENFORCE', 'Obrigatório', 'resourcepack', 'Quem recusar o pacote é desconectado.'),
  { key: 'RESOURCE_PACK_PROMPT', label: 'Mensagem ao oferecer o pacote', group: 'resourcepack', type: 'text' },
];

export const SETTINGS_BY_KEY = new Map(SETTINGS.map((field) => [field.key, field]));

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

/** Valida um valor. Retorna mensagem de erro ou null. String vazia = remover (usar padrão). */
export function validateSetting(field: SettingField, value: string): string | null {
  if (value === '') return null;
  if (/[\r\n\0]/.test(value)) return 'Não pode conter quebras de linha';
  if (value.length > 512) return 'Máximo de 512 caracteres';

  switch (field.type) {
    case 'boolean':
      return value === 'true' || value === 'false' ? null : 'Use true ou false';
    case 'number': {
      if (!/^-?\d+$/.test(value)) return 'Precisa ser um número inteiro';
      const n = Number(value);
      if (field.min !== undefined && n < field.min) return `Mínimo ${field.min}`;
      if (field.max !== undefined && n > field.max) return `Máximo ${field.max}`;
      return null;
    }
    case 'select':
      return field.options?.some((o) => o.value === value) ? null : 'Opção inválida';
    case 'memory':
      return MEMORY_RE.test(value) ? null : 'Use o formato 4G ou 3072M';
    case 'version':
      return /^(LATEST|SNAPSHOT|[0-9][0-9A-Za-z.+-]*)$/.test(value) ? null : 'Use LATEST, SNAPSHOT ou um número de versão (ex.: 26.2)';
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
