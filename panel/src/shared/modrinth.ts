/**
 * Formato das linhas de config/modrinth/<loader>.txt, o mesmo aceito pela
 * variável MODRINTH_PROJECTS da imagem itzg:
 *
 *   [prefixo:]slug[?][:versão|release|beta|alpha]
 */

export interface ModrinthEntry {
  prefix?: 'datapack' | 'fabric' | 'forge' | 'paper';
  slug: string;
  optional: boolean;
  version?: string;
}

const ENTRY_RE = /^(?:(datapack|fabric|forge|paper):)?([A-Za-z0-9_.-]{2,64})(\?)?(?::([A-Za-z0-9_.+-]{1,64}))?$/;

export function parseModrinthEntry(text: string): ModrinthEntry | null {
  const match = ENTRY_RE.exec(text.trim());
  if (!match) return null;
  const [, prefix, slug, optional, version] = match;
  return {
    prefix: prefix as ModrinthEntry['prefix'],
    slug: slug!,
    optional: optional === '?',
    version: version || undefined,
  };
}

export function formatModrinthEntry(entry: ModrinthEntry): string {
  return `${entry.prefix ? `${entry.prefix}:` : ''}${entry.slug}${entry.optional ? '?' : ''}${entry.version ? `:${entry.version}` : ''}`;
}
