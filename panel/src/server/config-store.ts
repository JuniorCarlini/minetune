/**
 * Leitura e escrita de config/server.env e config/modrinth/<loader>.txt.
 * Escritas são atômicas (arquivo temporário + rename) e serializadas.
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { EnvDocument } from './env-file.ts';
import { formatModrinthEntry, parseModrinthEntry, type ModrinthEntry } from '../shared/modrinth.ts';
import { RESERVED_KEYS, SETTINGS_BY_KEY, validateSetting, type Loader } from '../shared/settings.ts';

export class ValidationError extends Error {
  readonly fields: Record<string, string>;

  constructor(fields: Record<string, string>) {
    super(Object.entries(fields).map(([key, msg]) => `${key}: ${msg}`).join('; '));
    this.fields = fields;
  }
}

async function readText(path: string): Promise<string> {
  try {
    return await readFile(path, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return '';
    throw err;
  }
}

async function writeAtomic(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp-${process.pid}`;
  await writeFile(tmp, content, 'utf8');
  await rename(tmp, path);
}

export class ConfigStore {
  private writes: Promise<unknown> = Promise.resolve();
  private readonly configDir: string;

  constructor(configDir: string) {
    this.configDir = configDir;
  }

  private get serverEnvPath(): string {
    return join(this.configDir, 'server.env');
  }

  private serialize<T>(task: () => Promise<T>): Promise<T> {
    const run = this.writes.then(task);
    this.writes = run.catch(() => undefined);
    return run;
  }

  async readSettings(): Promise<{ values: Record<string, string>; unmanaged: string[] }> {
    const values = new EnvDocument(await readText(this.serverEnvPath)).toRecord();
    const unmanaged = Object.keys(values).filter((key) => !SETTINGS_BY_KEY.has(key));
    return { values, unmanaged };
  }

  /** Aplica alterações (string vazia remove a chave). Retorna as chaves que mudaram. */
  updateSettings(changes: Record<string, string>): Promise<string[]> {
    return this.serialize(async () => {
      const errors: Record<string, string> = {};
      for (const [key, value] of Object.entries(changes)) {
        const field = SETTINGS_BY_KEY.get(key);
        if (!field || RESERVED_KEYS.has(key)) {
          errors[key] = 'Configuração desconhecida ou reservada';
          continue;
        }
        const error = validateSetting(field, value);
        if (error) errors[key] = error;
      }
      if (Object.keys(errors).length > 0) throw new ValidationError(errors);

      const doc = new EnvDocument(await readText(this.serverEnvPath));
      const changed = Object.entries(changes)
        .filter(([key, value]) => (doc.get(key) ?? '') !== value)
        .map(([key]) => key);

      for (const key of changed) {
        const value = changes[key]!;
        doc.set(key, value === '' ? null : value);
      }
      if (changed.length > 0) await writeAtomic(this.serverEnvPath, doc.toString());
      return changed;
    });
  }

  private modrinthPath(loader: Loader): string {
    return join(this.configDir, 'modrinth', `${loader}.txt`);
  }

  async readModrinth(loader: Loader): Promise<ModrinthEntry[]> {
    const text = await readText(this.modrinthPath(loader));
    return text
      .split('\n')
      .map((line) => line.replace(/#.*$/, '').trim())
      .filter(Boolean)
      .map(parseModrinthEntry)
      .filter((entry): entry is ModrinthEntry => entry !== null);
  }

  /**
   * Substitui a lista preservando comentários: linhas de projetos que continuam
   * na lista ficam no lugar, removidas somem, novas vão para o final.
   */
  writeModrinth(loader: Loader, entries: ModrinthEntry[]): Promise<void> {
    return this.serialize(async () => {
      const desired = new Map(entries.map((entry) => [entry.slug.toLowerCase(), formatModrinthEntry(entry)]));
      const path = this.modrinthPath(loader);
      const lines = (await readText(path)).replace(/\n$/, '').split('\n');

      const output: string[] = [];
      for (const line of lines) {
        const entry = parseModrinthEntry(line.replace(/#.*$/, ''));
        if (!entry) {
          output.push(line);
          continue;
        }
        const key = entry.slug.toLowerCase();
        const replacement = desired.get(key);
        if (replacement !== undefined) {
          output.push(replacement);
          desired.delete(key);
        }
      }
      output.push(...desired.values());
      await writeAtomic(path, `${output.join('\n').replace(/^\n+/, '')}\n`);
    });
  }
}
