/**
 * Versões do Minecraft: ordenação, Java exigido e compatibilidade com a imagem.
 *
 * Usado pela API (lista de versões por software) e pelo seletor da UI, para os
 * dois concordarem sobre o que "funciona com a imagem atual" significa.
 */

export const SERVER_TYPES = ['PAPER', 'PURPUR', 'FABRIC', 'NEOFORGE', 'VANILLA'] as const;
export type ServerType = (typeof SERVER_TYPES)[number];

export const isServerType = (value: string): value is ServerType => (SERVER_TYPES as readonly string[]).includes(value);

export interface VersionInfo {
  id: string;
  /** false para snapshots, pre-releases e release candidates. */
  stable: boolean;
  /** Java mínimo exigido pela versão (null quando não dá para saber). */
  java: number | null;
}

export interface VersionsResponse {
  type: ServerType;
  /** Java da imagem do servidor (tag javaNN de itzg/minecraft-server). */
  imageJava: number | null;
  /** Versão estável mais recente disponível para o software. */
  latest: string | null;
  versions: VersionInfo[];
  /** Presente quando a fonte oficial falhou; a UI cai para o campo de texto. */
  error?: string;
}

/** "1.21.4" -> [1, 21, 4]; "26.3-rc-2" -> [26, 3]; "LATEST" -> null. */
export function versionNumbers(id: string): number[] | null {
  const match = id.match(/^(\d+(?:\.\d+)*)/);
  return match ? match[1]!.split('.').map(Number) : null;
}

/** Ordena como o Minecraft: 26.2 > 1.21.11 > 1.21.4; release > pre/rc da mesma base. */
export function compareVersions(a: string, b: string): number {
  const na = versionNumbers(a) ?? [];
  const nb = versionNumbers(b) ?? [];
  for (let i = 0; i < Math.max(na.length, nb.length); i++) {
    const diff = (na[i] ?? 0) - (nb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  const suffixA = a.slice((na.join('.') || '').length);
  const suffixB = b.slice((nb.join('.') || '').length);
  if (suffixA === suffixB) return 0;
  if (!suffixA) return 1;
  if (!suffixB) return -1;
  return suffixA.localeCompare(suffixB, 'en', { numeric: true });
}

/**
 * Java mínimo por versão, conforme o campo javaVersion dos manifestos da Mojang:
 * 26.x -> 25, 1.20.5+ -> 21, 1.18–1.20.4 -> 17, 1.17 -> 16, até 1.16.5 -> 8.
 */
export function requiredJava(id: string): number | null {
  const n = versionNumbers(id);
  if (!n) return null;
  const [major = 0, minor = 0, patch = 0] = n;
  if (major >= 26) return 25;
  if (major !== 1) return null;
  if (minor > 20 || (minor === 20 && patch >= 5)) return 21;
  if (minor >= 18) return 17;
  if (minor === 17) return 16;
  return 8;
}

/** "itzg/minecraft-server:java25" -> 25. Tags sem javaNN (ex.: latest) -> null. */
export function javaFromImage(image: string | undefined): number | null {
  const match = image?.match(/:java(\d+)/);
  return match ? Number(match[1]) : null;
}

/**
 * Versões antigas demais para rodar numa JVM moderna. Abaixo disso (Java 8, até
 * a 1.16.5) o servidor precisa da imagem java8. Testado na imagem java25: Paper
 * 1.16.5 recusa subir ("Only up to Java 16 is supported"); Paper 1.21.4 e 1.20.4,
 * Fabric 1.21.4 e Vanilla 1.18.2 sobem normalmente.
 */
export const LEGACY_JAVA_BELOW = 16;

export type Compatibility = 'ok' | 'needs-newer-java' | 'needs-legacy-java';

export function compatibility(required: number | null, imageJava: number | null): Compatibility {
  if (required === null || imageJava === null) return 'ok';
  if (required > imageJava) return 'needs-newer-java';
  if (required < LEGACY_JAVA_BELOW && imageJava >= LEGACY_JAVA_BELOW) return 'needs-legacy-java';
  return 'ok';
}

/** Tag da imagem itzg indicada para o Java exigido. */
export function imageTagFor(required: number): string {
  if (required >= 25) return 'java25';
  if (required >= 21) return 'java21';
  if (required >= 16) return 'java17';
  return 'java8';
}

/**
 * NeoForge numera pela versão do jogo sem o "1.": 21.4.x -> 1.21.4, 21.0.x -> 1.21,
 * 26.2.0.x -> 26.2. Betas e builds especiais (0.25w14craftmine) -> null.
 */
export function neoforgeToMinecraft(version: string): { minecraft: string; stable: boolean } | null {
  const match = version.match(/^(\d+)\.(\d+)\.\d+(?:\.\d+)?(-beta)?$/);
  if (!match) return null;
  const [, a, b, beta] = match;
  const major = Number(a);
  if (major === 0) return null;
  const minecraft = major >= 26 ? `${major}.${b}` : b === '0' ? `1.${major}` : `1.${major}.${b}`;
  return { minecraft, stable: !beta };
}
