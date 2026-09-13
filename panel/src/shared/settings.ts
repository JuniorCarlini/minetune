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
  /** Só aparece com "Opções avançadas" ligado: termos técnicos ou fácil de quebrar o servidor. */
  advanced?: boolean;
}

export const SETTING_GROUPS: SettingGroup[] = [
  { id: 'server', label: 'Básico', description: 'Versão, tipo, nome e tamanho do servidor' },
  { id: 'world', label: 'Mundo', description: 'Como o mapa é criado e até onde vai' },
  { id: 'gameplay', label: 'Jogabilidade', description: 'Modo de jogo, dificuldade e o que é permitido' },
  { id: 'performance', label: 'Desempenho', description: 'Quanto o servidor carrega para não travar' },
  { id: 'access', label: 'Acesso', description: 'Quem pode entrar e o que administradores podem fazer' },
  { id: 'crossplay', label: 'Bedrock', description: 'Jogadores de celular, console e Windows' },
  { id: 'resourcepack', label: 'Pacote de texturas', description: 'Texturas e sons enviados a quem entra' },
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
    label: 'Tipo de servidor',
    group: 'server',
    type: 'select',
    options: [
      { value: 'PAPER', label: 'Paper — aceita plugins, mais rápido (recomendado)' },
      { value: 'PURPUR', label: 'Purpur — Paper com mais opções' },
      { value: 'FABRIC', label: 'Fabric — aceita mods' },
      { value: 'NEOFORGE', label: 'NeoForge — aceita mods' },
      { value: 'VANILLA', label: 'Vanilla — oficial, sem plugins nem mods' },
    ],
    help: 'Define se o servidor aceita plugins ou mods.',
    danger: 'Trocar o tipo deixa os plugins ou mods atuais sem funcionar e pode afetar o mundo.',
  },
  {
    key: 'VERSION',
    label: 'Versão do Minecraft',
    group: 'server',
    type: 'version',
    placeholder: '26.2',
    help: 'A mesma versão que os jogadores usam no jogo. Atualizar converte o mundo e não tem volta.',
    danger: 'Atualizar converte o mundo para o novo formato e não é possível voltar sem backup.',
  },
  {
    key: 'MEMORY',
    label: 'Memória do servidor',
    group: 'server',
    type: 'memory',
    placeholder: '4G',
    help: 'Quanto o Minecraft pode usar, ex.: 4G. Deixe 1 a 1,5 GB livres abaixo do limite da máquina.',
  },
  { ...bool('USE_AIKAR_FLAGS', 'Ajustes de memória contra travadas (Aikar)', 'server', 'Reduz pequenas travadas. Recomendado ligado.'), advanced: true },
  {
    ...bool(
      'USE_MEOWICE_FLAGS',
      'Ajustes de memória experimentais (MeowIce)',
      'server',
      'Variante mais agressiva dos ajustes Aikar. Derrubou o servidor em ARM64 nos testes; use só em x86 e observe.',
    ),
    advanced: true,
  },
  { key: 'MOTD', label: 'Mensagem na lista de servidores', group: 'server', type: 'text', help: 'Texto que aparece embaixo do nome do servidor no jogo.' },
  { key: 'MAX_PLAYERS', label: 'Máximo de jogadores', group: 'server', type: 'number', min: 1, max: 1000, help: 'Quantas pessoas podem jogar ao mesmo tempo.' },
  {
    ...bool(
      'ONLINE_MODE',
      'Exigir conta oficial do Minecraft',
      'server',
      'Desligado, qualquer um entra com qualquer nick. Só desligue atrás de um proxy (Velocity) ou em rede local.',
    ),
    advanced: true,
  },

  // --- Mundo ---
  {
    key: 'LEVEL',
    label: 'Nome do mundo',
    group: 'world',
    type: 'text',
    placeholder: 'world',
    help: 'Um nome novo cria outro mundo; o atual continua guardado.',
    danger: 'O servidor passará a carregar outro mundo.',
  },
  { key: 'SEED', label: 'Semente do mapa (seed)', group: 'world', type: 'text', help: 'Gera sempre o mesmo mapa. Só vale ao criar um mundo novo.' },
  {
    key: 'LEVEL_TYPE',
    label: 'Tipo de mundo',
    group: 'world',
    type: 'select',
    help: 'Só vale ao criar um mundo novo.',
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
  { key: 'MAX_WORLD_SIZE', label: 'Tamanho máximo do mapa (blocos)', group: 'world', type: 'number', min: 1, max: 29999984, help: 'Distância do centro até a borda do mundo.', advanced: true },
  {
    key: 'SPAWN_PROTECTION',
    label: 'Área protegida no nascimento (blocos)',
    group: 'world',
    type: 'number',
    min: 0,
    max: 1000,
    help: 'Só administradores constroem perto do ponto de nascimento. 0 desativa.',
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
  bool('HARDCORE', 'Hardcore', 'gameplay', 'Morreu uma vez, só assiste. Não dá para renascer.'),
  bool('PVP', 'Jogadores podem se atacar (PvP)', 'gameplay'),
  bool('ALLOW_FLIGHT', 'Não expulsar por "voar"', 'gameplay', 'Evita expulsões falsas com elytra ou mods de movimento.'),
  bool('ENABLE_COMMAND_BLOCK', 'Blocos de comando', 'gameplay', 'Permite usar blocos que executam comandos.'),
  {
    key: 'PLAYER_IDLE_TIMEOUT',
    label: 'Expulsar quem ficar parado (minutos)',
    group: 'gameplay',
    type: 'number',
    min: 0,
    max: 1440,
    help: '0 desativa.',
  },

  // --- Desempenho ---
  {
    key: 'VIEW_DISTANCE',
    label: 'Distância de visão',
    group: 'performance',
    type: 'number',
    min: 2,
    max: 32,
    help: 'Até onde cada jogador enxerga, em chunks. Maior usa mais memória e internet.',
  },
  {
    key: 'SIMULATION_DISTANCE',
    label: 'Distância de atividade',
    group: 'performance',
    type: 'number',
    min: 2,
    max: 32,
    help: 'Até onde criaturas, redstone e plantações funcionam, em chunks. É o que mais pesa.',
  },
  {
    key: 'ENTITY_BROADCAST_RANGE_PERCENTAGE',
    label: 'Alcance de exibição de criaturas (%)',
    group: 'performance',
    type: 'number',
    min: 10,
    max: 1000,
    advanced: true,
  },
  {
    key: 'NETWORK_COMPRESSION_THRESHOLD',
    label: 'Limite de compressão de rede (bytes)',
    group: 'performance',
    type: 'number',
    min: -1,
    max: 65535,
    help: 'Padrão 256. Aumente se o processador for o gargalo e a internet sobrar.',
    advanced: true,
  },
  {
    key: 'PAUSE_WHEN_EMPTY_SECONDS',
    label: 'Pausar quando ninguém joga (segundos)',
    group: 'performance',
    type: 'number',
    min: 0,
    max: 86400,
    help: 'O servidor para de processar o mundo vazio e economiza energia. 0 desativa.',
  },
  {
    ...bool(
      'APPLY_PAPER_OPTIMIZATIONS',
      'Otimizações do Minetune para Paper',
      'performance',
      'Explosões e redstone mais leves e limite de itens no chão. Recomendado ligado.',
    ),
    visibleWhen: { key: 'TYPE', values: PLUGIN_TYPES },
  },
  { ...bool('SYNC_CHUNK_WRITES', 'Gravar o mapa com mais segurança', 'performance', 'Protege contra queda de energia, mas deixa o disco mais lento.'), advanced: true },

  // --- Acesso ---
  bool('ENABLE_WHITELIST', 'Só convidados podem entrar', 'access', 'Quem não estiver na lista de convidados não entra. A lista fica em Jogadores.'),
  bool('ENFORCE_WHITELIST', 'Expulsar quem for removido da lista de convidados', 'access'),
  { ...bool('ENFORCE_SECURE_PROFILE', 'Exigir chat assinado pela Mojang', 'access'), advanced: true },
  { ...bool('PREVENT_PROXY_CONNECTIONS', 'Bloquear quem entra por VPN', 'access'), advanced: true },
  bool('HIDE_ONLINE_PLAYERS', 'Esconder quem está jogando na lista de servidores', 'access'),
  {
    key: 'OP_PERMISSION_LEVEL',
    label: 'Poder dos administradores',
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
    advanced: true,
  },

  // --- Crossplay ---
  {
    ...bool(
      'BEDROCK_CROSSPLAY',
      'Aceitar jogadores Bedrock',
      'crossplay',
      'Deixa jogadores de celular, console e Windows entrarem sem conta Java. Usa a porta 19132.',
    ),
    visibleWhen: { key: 'TYPE', values: MODDED_OR_PLUGIN_TYPES },
  },

  // --- Resource pack ---
  { key: 'RESOURCE_PACK', label: 'Link do pacote de texturas', group: 'resourcepack', type: 'text', placeholder: 'https://...', help: 'Link direto para o arquivo .zip.' },
  { key: 'RESOURCE_PACK_SHA1', label: 'Código de verificação (SHA-1)', group: 'resourcepack', type: 'text', advanced: true },
  bool('RESOURCE_PACK_ENFORCE', 'Pacote obrigatório', 'resourcepack', 'Quem recusar o pacote é desconectado.'),
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
