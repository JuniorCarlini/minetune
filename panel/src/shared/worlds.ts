/** Mundos do servidor: um fica ligado (LEVEL no server.env), os outros ficam guardados. */

import { PT, type Messages } from './i18n/index.ts';
import { loaderForType } from './settings.ts';
import { compareVersions } from './versions.ts';

export interface WorldInfo {
  /** Pasta relativa a /data: "world" ou "mundos-guardados/world-26.2". */
  folder: string;
  /** Nome mostrado: o último pedaço da pasta. */
  name: string;
  active: boolean;
  /** Está em mundos-guardados/: ao ser usado, volta para a raiz de /data. */
  archived: boolean;
  /** Já tem mapa (level.dat). Mundo novo fica false até o servidor ligar nele pela primeira vez. */
  generated: boolean;
  /** Tem configuração própria em <mundo>/minetune; sem ela, herda a do mundo ligado. */
  hasProfile: boolean;
  /** Tipo e versão de servidor com que este mundo roda (do perfil dele, ou do ligado). */
  serverType?: string;
  serverVersion?: string;
  /** Versão do jogo em que o mundo foi salvo pela última vez (level.dat). */
  version?: string;
  dataVersion?: number;
  seed?: string;
  levelType?: string;
  sizeBytes: number;
  lastPlayed?: string;
  createdAt?: string;
  /**
   * Partes do mapa gravadas numa versão mais nova que a do level.dat: o mundo já foi
   * aberto numa versão mais antiga, que regravou o level.dat mas não conseguiu ler o resto.
   */
  mixedVersions: boolean;
  /**
   * Quem gravou o mapa por último. O Paper 26.x guarda partes do mundo num formato próprio
   * (dimensions/…/world_gen_settings.dat, pacote "paper"): Vanilla, Fabric e NeoForge não abrem.
   */
  savedBy?: 'paper' | 'vanilla';
}

export interface WorldsResponse {
  /** LEVEL atual; pode ainda não existir em disco (mundo novo esperando o servidor ligar). */
  active: string;
  serverVersion: string;
  serverRunning: boolean;
  worlds: WorldInfo[];
  /** Tamanho máximo de um .zip enviado pela tela Mundos. */
  uploadMaxBytes?: number;
}

export const WORLD_NAME_MAX = 32;

/** Pastas que o servidor usa em /data: um mundo com esse nome se misturaria com elas. */
const RESERVED_NAMES = new Set([
  'cache',
  'config',
  'crash-reports',
  'debug',
  'libraries',
  'logs',
  'mods',
  'mundos-guardados',
  'plugins',
  'versions',
  'world_nether',
  'world_the_end',
]);

/** Erro para um nome de pasta de mundo, na língua de `m` (português por padrão), ou null se serve. */
export function worldNameError(name: string, m: Messages = PT): string | null {
  if (!name) return m.worlds.nameEmpty;
  if (name.length > WORLD_NAME_MAX) return m.worlds.nameTooLong(WORLD_NAME_MAX);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name) || name.includes('..')) {
    return m.worlds.nameChars;
  }
  if (RESERVED_NAMES.has(name.toLowerCase())) return m.worlds.nameReserved;
  // Pasta com muitas palavras é quase sempre um texto colado no campo por engano.
  if (wordCount(name) > WORLD_NAME_MAX_WORDS) return m.worlds.namePasted;
  return null;
}

/** Até quantas palavras um nome de mundo pode ter ("mundo-do-joao-2" tem 3). */
export const WORLD_NAME_MAX_WORDS = 5;

/**
 * Palavras com letras: números não contam, então datas e versões continuam valendo
 * ("world-26.2-2026-09-13" é uma palavra só).
 */
function wordCount(text: string): number {
  return text.split(/[\s_.-]+/).filter((part) => /\p{L}/u.test(part)).length;
}

/**
 * O texto digitado parece uma frase colada (pontuação de frase ou palavras demais)?
 * Confere antes de virar nome de pasta: "O mapa sai da seed e do tipo." virava "o-mapa-sai-da-seed-e-do-tipo.-de".
 */
export function worldNameInputError(text: string, m: Messages = PT): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (/[.!?,;:]\s/.test(trimmed) || wordCount(trimmed) > WORLD_NAME_MAX_WORDS) return m.worlds.namePasted;
  return null;
}

/** O que a pessoa digitou vira nome de pasta: "Mundo do João!" → "mundo-do-joao". */
export function worldFolderFrom(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/\.{2,}/g, '.')
    .replace(/^[-._]+|[-._]+$/g, '')
    .slice(0, WORLD_NAME_MAX);
}

/**
 * Mundo salvo numa versão mais nova que a do servidor não pode abrir: o jogo não volta
 * versão e os pedaços do mapa ficam ilegíveis (o servidor trava quando alguém chega perto).
 * Com LATEST ou snapshot não dá para comparar, então não bloqueia.
 */
export function worldTooNew(worldVersion: string | undefined, serverVersion: string): boolean {
  if (!worldVersion || !/^\d/.test(serverVersion)) return false;
  return compareVersions(worldVersion, serverVersion) > 0;
}

/**
 * Por que o mundo não pode ser aberto no servidor agora, em português, ou null se pode.
 * O level.dat sozinho não basta: um servidor mais antigo regrava a versão dele ali,
 * então um mundo misturado precisa de um servidor mais novo que a versão anotada.
 */
export function worldBlockReason(
  world: Pick<WorldInfo, 'name' | 'version' | 'mixedVersions'> & Partial<Pick<WorldInfo, 'generated' | 'savedBy'>>,
  serverVersion: string,
  serverType?: string,
  m: Messages = PT,
): string | null {
  const typeReason = serverType ? worldTypeReason(world, serverType, m) : null;
  if (typeReason) return typeReason;
  if (world.mixedVersions && (!world.version || !/^\d/.test(serverVersion) || compareVersions(serverVersion, world.version) <= 0)) {
    return m.worlds.mixedVersions(world.name, serverVersion);
  }
  if (worldTooNew(world.version, serverVersion)) {
    return m.worlds.tooNew(world.name, world.version!, serverVersion);
  }
  return null;
}

/**
 * Mundo gravado pelo Paper não abre em servidor sem Paper: o Vanilla e os de mods procuram as
 * configurações do mapa em outro lugar e caem ao ligar, tentando de novo sem parar. O caminho
 * contrário funciona (o Paper converte um mundo oficial), e mundo ainda não gerado aceita qualquer tipo.
 */
export function worldTypeReason(
  world: Pick<WorldInfo, 'name'> & Partial<Pick<WorldInfo, 'generated' | 'savedBy'>>,
  serverType: string,
  m: Messages = PT,
): string | null {
  if (world.generated === false || world.savedBy !== 'paper') return null;
  if (loaderForType(serverType || 'VANILLA') === 'paper') return null;
  return m.worlds.paperOnly(world.name);
}

/**
 * Erros de tipo e versão ao mudar a configuração de um mundo, por chave (TYPE, VERSION).
 * Só olha o que mudou: uma configuração antiga já salva não trava as outras edições.
 * Usada na tela, antes de salvar, e no servidor, que recusa mesmo sem a tela.
 */
export function worldSettingsErrors(
  world: Pick<WorldInfo, 'name'> & Partial<Pick<WorldInfo, 'generated' | 'savedBy' | 'version'>>,
  next: Record<string, string | undefined>,
  current: Record<string, string | undefined> = {},
  m: Messages = PT,
): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!world.generated) return errors;
  if ((next.TYPE ?? '') !== (current.TYPE ?? '')) {
    const reason = worldTypeReason(world, next.TYPE ?? '', m);
    if (reason) errors.TYPE = reason;
  }
  const version = next.VERSION || 'LATEST';
  if ((next.VERSION ?? '') !== (current.VERSION ?? '') && worldTooNew(world.version, version)) {
    errors.VERSION = m.worlds.versionDowngrade(world.name, world.version!, version);
  }
  return errors;
}

/** Seed na resposta do comando /seed ("Seed: [-8660647838225998762]"). */
export function parseSeed(output: string): string | undefined {
  return output.match(/Seed:\s*\[(-?\d+)\]/)?.[1];
}
