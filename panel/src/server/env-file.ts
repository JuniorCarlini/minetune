/**
 * Leitura/escrita de arquivos .env em sintaxe shell (KEY="valor"),
 * preservando comentários, ordem e linhas desconhecidas.
 *
 * O arquivo é carregado com `set -a; . server.env` no entrypoint, então a
 * escrita precisa gerar shell válido: sempre aspas duplas com escape de \ " $ `.
 */

const ENTRY_RE = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/;

type Line = { kind: 'entry'; key: string; value: string; raw: string } | { kind: 'other'; raw: string };

export function parseValue(rest: string): string {
  const text = rest.trimStart();
  const quote = text[0];

  if (quote === "'") {
    const end = text.indexOf("'", 1);
    return end === -1 ? text.slice(1) : text.slice(1, end);
  }

  if (quote === '"') {
    let out = '';
    for (let i = 1; i < text.length; i++) {
      const ch = text[i]!;
      if (ch === '\\' && i + 1 < text.length && '\\"$`'.includes(text[i + 1]!)) {
        out += text[++i];
      } else if (ch === '"') {
        return out;
      } else {
        out += ch;
      }
    }
    return out;
  }

  // Sem aspas: até um comentário precedido de espaço.
  const comment = text.search(/\s#/);
  return (comment === -1 ? text : text.slice(0, comment)).trim();
}

export function quoteValue(value: string): string {
  return `"${value.replace(/[\\"$`]/g, '\\$&')}"`;
}

export class EnvDocument {
  private lines: Line[];

  constructor(text: string) {
    this.lines = text.split(/\r?\n/).map((raw): Line => {
      const match = ENTRY_RE.exec(raw);
      if (!match || raw.trimStart().startsWith('#')) return { kind: 'other', raw };
      return { kind: 'entry', key: match[1]!, value: parseValue(match[2]!), raw };
    });
    // split gera um "" final quando o arquivo termina com \n; toString o recoloca.
    if (this.lines.length > 0 && this.lines.at(-1)!.raw === '') this.lines.pop();
  }

  get(key: string): string | undefined {
    for (let i = this.lines.length - 1; i >= 0; i--) {
      const line = this.lines[i]!;
      if (line.kind === 'entry' && line.key === key) return line.value;
    }
    return undefined;
  }

  /** Última definição de cada chave vence, como no shell. */
  toRecord(): Record<string, string> {
    const record: Record<string, string> = {};
    for (const line of this.lines) {
      if (line.kind === 'entry') record[line.key] = line.value;
    }
    return record;
  }

  /** `null` remove a chave. Chaves novas vão para o final do arquivo. */
  set(key: string, value: string | null): void {
    const indexes = this.lines.flatMap((line, i) => (line.kind === 'entry' && line.key === key ? [i] : []));

    if (value === null) {
      this.lines = this.lines.filter((_, i) => !indexes.includes(i));
      return;
    }

    const entry: Line = { kind: 'entry', key, value, raw: `${key}=${quoteValue(value)}` };
    const last = indexes.at(-1);
    if (last === undefined) {
      this.lines.push(entry);
      return;
    }
    this.lines[last] = entry;
    const duplicates = new Set(indexes.slice(0, -1));
    this.lines = this.lines.filter((_, i) => !duplicates.has(i));
  }

  toString(): string {
    return `${this.lines.map((line) => line.raw).join('\n')}\n`;
  }
}
