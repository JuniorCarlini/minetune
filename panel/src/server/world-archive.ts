/**
 * Mundos em .zip: conferir e extrair um mundo enviado, e gerar o .zip de um mundo para baixar.
 *
 * Um arquivo enviado nunca é extraído antes de passar por todas as checagens, feitas só com o
 * índice do .zip (sem ler o conteúdo): caminhos que saem da pasta, atalhos e arquivos especiais,
 * senha, "zip bomb", quantidade e tamanho total, programas e scripts, arquivos que não são de
 * mundo e mundos do Bedrock. Depois, ao extrair, cada destino é conferido de novo e o yauzl
 * compara o tamanho real de cada arquivo com o declarado.
 *
 * A configuração que vem junto (minetune/) não é copiada: server.env é executado pelo servidor
 * ao ligar, então só as opções conhecidas do painel entram, validadas como na tela; as listas de
 * jogadores só entram no formato esperado; listas de plugins e mods são ignoradas.
 */

import { createWriteStream } from 'node:fs';
import { mkdir, readdir, stat, statfs } from 'node:fs/promises';
import { basename, dirname, extname, join, resolve, sep } from 'node:path';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import yauzl from 'yauzl';
import yazl from 'yazl';
import type { ArchiveProblem } from '../shared/archive.ts';
import { RESERVED_KEYS, SETTINGS_BY_KEY, validateSetting } from '../shared/settings.ts';
import { EnvDocument } from './env-file.ts';
import { readNbt, type NbtCompound, type NbtValue } from './nbt.ts';
import { ACCESS_FILES } from './world-profile.ts';

const MiB = 1024 ** 2;
const GiB = 1024 ** 3;

export interface ArchiveLimits {
  maxEntries: number;
  maxUnzippedBytes: number;
  /** Quanto um arquivo grande pode crescer ao descompactar antes de parecer "zip bomb". */
  maxRatio: number;
}

export const DEFAULT_ARCHIVE_LIMITS: ArchiveLimits = { maxEntries: 200_000, maxUnzippedBytes: 32 * GiB, maxRatio: 150 };

/** Extensões de arquivos que existem num mundo (Java, Paper, Fabric, NeoForge, pacotes de dados). */
const WORLD_EXTENSIONS = new Set([
  '.dat',
  '.dat_old',
  '.mca',
  '.mcr',
  '.mcc',
  '.nbt',
  '.snbt',
  '.json',
  '.json5',
  '.mcmeta',
  '.mcfunction',
  '.png',
  '.lock',
  '.yml',
  '.yaml',
  '.toml',
  '.txt',
  '.properties',
  '.bak',
  '.old',
  '.gz',
]);

/** Programas e scripts: nunca entram, e a mensagem diz que é por serem executáveis. */
const EXECUTABLE_EXTENSIONS = new Set([
  '.jar',
  '.class',
  '.war',
  '.sh',
  '.bash',
  '.zsh',
  '.fish',
  '.command',
  '.bat',
  '.cmd',
  '.ps1',
  '.psm1',
  '.vbs',
  '.wsf',
  '.exe',
  '.msi',
  '.com',
  '.scr',
  '.dll',
  '.so',
  '.dylib',
  '.bin',
  '.elf',
  '.app',
  '.apk',
  '.js',
  '.mjs',
  '.cjs',
  '.py',
  '.pyc',
  '.rb',
  '.pl',
  '.php',
  '.jsp',
  '.lnk',
  '.desktop',
  '.appimage',
]);

/** Lixo de sistema operacional que aparece em .zip feito no Mac ou no Windows: pula sem reclamar. */
const JUNK_NAMES = new Set(['.DS_Store', 'Thumbs.db', 'desktop.ini']);

/** Arquivos que já vêm comprimidos: guardar sem comprimir de novo deixa o download mais rápido. */
const STORED_EXTENSIONS = new Set(['.mca', '.mcr', '.mcc', '.png', '.zip', '.gz']);

const PROFILE_PREFIX = 'minetune/';
const SERVER_ENV_MAX = 64 * 1024;
const ACCESS_LIST_MAX = 4 * MiB;
const META_MAX = 16 * 1024;
const LEVEL_DAT_MAX = 8 * MiB;

export type AccessFile = (typeof ACCESS_FILES)[number];

export interface ZipFileEntry {
  /** Nome dentro do .zip. */
  name: string;
  /** Caminho dentro do mundo (sem a pasta raiz do .zip). */
  relative: string;
  size: number;
}

export interface WorldZipPlan {
  /** Pasta do .zip onde está o level.dat ("" ou "MeuMundo/"). */
  root: string;
  /** Nome sugerido: a pasta raiz do .zip, quando existe. */
  suggestedName: string;
  files: ZipFileEntry[];
  totalBytes: number;
  profile: {
    serverEnv?: string;
    access: Partial<Record<AccessFile, string>>;
    meta?: string;
    ignoredModrinth: boolean;
  };
  /** Arquivos fora da pasta do mundo, que não serão extraídos. */
  ignoredOutside: number;
}

function openZip(path: string): Promise<yauzl.ZipFile> {
  return new Promise((ok, fail) =>
    yauzl.open(path, { lazyEntries: true, autoClose: false, strictFileNames: true, validateEntrySizes: true }, (err, zip) =>
      err || !zip ? fail(err ?? new Error('zip')) : ok(zip),
    ),
  );
}

/** Percorre o índice do .zip; `visit` devolve false para parar. */
function walkEntries(zip: yauzl.ZipFile, visit: (entry: yauzl.Entry) => boolean | void): Promise<void> {
  return new Promise((ok, fail) => {
    zip.on('entry', (entry: yauzl.Entry) => {
      if (visit(entry) === false) ok();
      else zip.readEntry();
    });
    zip.on('end', () => ok());
    zip.on('error', fail);
    zip.readEntry();
  });
}

const fileMode = (entry: yauzl.Entry) => (entry.externalFileAttributes >>> 16) & 0o170000;

/** O yauzl recusa nomes perigosos com mensagens como "invalid relative path: ../x". */
function unsafeNameProblem(err: Error): ArchiveProblem | null {
  const match = /^(absolute path|invalid relative path|invalid characters in fileName): (.*)$/.exec(err.message);
  return match ? { code: 'unsafePath', path: match[2] } : null;
}

/**
 * Confere um .zip sem extrair nada. Com problemas, `plan` não vem: o arquivo deve ser apagado.
 * `dataDir` serve para conferir se cabe no disco.
 */
export async function inspectWorldZip(
  zipPath: string,
  options: { limits?: ArchiveLimits; dataDir?: string } = {},
): Promise<{ problems: ArchiveProblem[]; plan?: WorldZipPlan }> {
  const limits = options.limits ?? DEFAULT_ARCHIVE_LIMITS;
  const problems: ArchiveProblem[] = [];
  const entries: yauzl.Entry[] = [];

  let zip: yauzl.ZipFile;
  try {
    zip = await openZip(zipPath);
  } catch (err) {
    return { problems: [unsafeNameProblem(err as Error) ?? { code: 'notZip' }] };
  }

  try {
    let total = 0;
    await walkEntries(zip, (entry) => {
      entries.push(entry);
      if (entries.length > limits.maxEntries) {
        problems.push({ code: 'tooManyFiles', value: limits.maxEntries });
        return false;
      }
      const name = entry.fileName;
      if (isJunk(name) || name.endsWith('/')) return;
      if ((entry.generalPurposeBitFlag & 0x1) !== 0) problems.push({ code: 'encrypted', path: name });
      const mode = fileMode(entry);
      if (mode !== 0 && mode !== 0o100000) problems.push({ code: 'special', path: name });
      if (entry.uncompressedSize > 8 * MiB && entry.uncompressedSize / Math.max(entry.compressedSize, 1) > limits.maxRatio) {
        problems.push({ code: 'zipBomb', path: name });
      }
      total += entry.uncompressedSize;
    });
    if (problems.some((p) => p.code === 'tooManyFiles')) return { problems };
    if (total > limits.maxUnzippedBytes) problems.push({ code: 'tooBig', value: total, extra: limits.maxUnzippedBytes });
  } catch (err) {
    return { problems: [unsafeNameProblem(err as Error) ?? { code: 'notZip' }] };
  } finally {
    zip.close();
  }

  const files = entries.filter((e) => !e.fileName.endsWith('/') && !isJunk(e.fileName));
  if (files.length === 0) return { problems: [...problems, { code: 'empty' }] };

  // Onde está o mundo: um level.dat na raiz do .zip ou dentro de uma única pasta.
  const levelDats = files.map((e) => e.fileName).filter((name) => /^(?:[^/]+\/)?level\.dat$/.test(name));
  if (levelDats.length === 0) {
    const bedrock = files.some((e) => /(^|\/)db\/[^/]+\.(ldb|log)$/i.test(e.fileName) || /(^|\/)levelname\.txt$/i.test(e.fileName));
    problems.push({ code: bedrock ? 'bedrock' : 'noLevelDat' });
    return { problems };
  }
  if (levelDats.length > 1) {
    problems.push({ code: 'manyWorlds', value: levelDats.length });
    return { problems };
  }
  const root = levelDats[0]!.slice(0, -'level.dat'.length);

  const plan: WorldZipPlan = {
    root,
    suggestedName: root.replace(/\/$/, ''),
    files: [],
    totalBytes: 0,
    profile: { access: {}, ignoredModrinth: false },
    ignoredOutside: 0,
  };

  for (const entry of files) {
    const name = entry.fileName;
    if (!name.startsWith(root)) {
      plan.ignoredOutside++;
      continue;
    }
    const relative = name.slice(root.length);
    const ext = extname(relative).toLowerCase();

    if (relative.startsWith(PROFILE_PREFIX)) {
      const inner = relative.slice(PROFILE_PREFIX.length);
      if (inner === 'server.env') plan.profile.serverEnv = name;
      else if (inner === 'mundo.json') plan.profile.meta = name;
      else if (inner.startsWith('modrinth/')) plan.profile.ignoredModrinth = true;
      else if (inner.startsWith('acesso/') && (ACCESS_FILES as readonly string[]).includes(inner.slice('acesso/'.length))) {
        plan.profile.access[inner.slice('acesso/'.length) as AccessFile] = name;
      } else if (EXECUTABLE_EXTENSIONS.has(ext)) problems.push({ code: 'executable', path: name });
      continue;
    }

    if (EXECUTABLE_EXTENSIONS.has(ext)) {
      problems.push({ code: 'executable', path: name });
      continue;
    }
    // Pacotes de dados em .zip são normais dentro de datapacks/.
    const allowed = WORLD_EXTENSIONS.has(ext) || (ext === '.zip' && relative.startsWith('datapacks/'));
    if (!allowed) {
      problems.push({ code: 'foreignFile', path: name });
      continue;
    }
    // O servidor recria o session.lock; o de outra máquina só atrapalha.
    if (relative === 'session.lock') continue;
    plan.files.push({ name, relative, size: entry.uncompressedSize });
    plan.totalBytes += entry.uncompressedSize;
  }

  if (options.dataDir && problems.length === 0) {
    const fs = await statfs(options.dataDir).catch(() => null);
    if (fs) {
      const free = fs.bavail * fs.bsize;
      const needed = plan.totalBytes + 256 * MiB;
      if (needed > free) problems.push({ code: 'noSpace', value: needed, extra: free });
    }
  }

  return problems.length > 0 ? { problems } : { problems, plan };
}

function isJunk(name: string): boolean {
  return name.startsWith('__MACOSX/') || JUNK_NAMES.has(basename(name));
}

/** Extrai só os arquivos do plano para `destDir`, conferindo de novo que nada sai da pasta. */
export async function extractWorldZip(zipPath: string, plan: WorldZipPlan, destDir: string, onProgress?: (fraction: number) => void): Promise<void> {
  const wanted = new Map(plan.files.map((file) => [file.name, file]));
  const base = resolve(destDir);
  await mkdir(base, { recursive: true });
  const zip = await openZip(zipPath);
  let written = 0;
  try {
    await new Promise<void>((ok, fail) => {
      zip.on('error', fail);
      zip.on('end', () => ok());
      zip.on('entry', (entry: yauzl.Entry) => {
        const file = wanted.get(entry.fileName);
        if (!file) {
          zip.readEntry();
          return;
        }
        const target = resolve(base, file.relative);
        if (!target.startsWith(base + sep)) {
          fail(new Error(`unsafe path: ${entry.fileName}`));
          return;
        }
        mkdir(dirname(target), { recursive: true })
          .then(() => openEntryStream(zip, entry))
          // "wx": nunca sobrescreve nada, nem um arquivo duplicado dentro do próprio .zip.
          .then((stream) => pipeline(stream, createWriteStream(target, { flags: 'wx', mode: 0o644 })))
          .then(() => {
            written += file.size;
            onProgress?.(plan.totalBytes > 0 ? written / plan.totalBytes : 1);
            zip.readEntry();
          })
          .catch(fail);
      });
      zip.readEntry();
    });
  } finally {
    zip.close();
  }
}

function openEntryStream(zip: yauzl.ZipFile, entry: yauzl.Entry): Promise<Readable> {
  return new Promise((ok, fail) => zip.openReadStream(entry, (err, stream) => (err || !stream ? fail(err ?? new Error('stream')) : ok(stream))));
}

/** Lê um arquivo pequeno de dentro do .zip (configuração que veio junto), com limite de tamanho. */
export async function readZipText(zipPath: string, entryName: string, maxBytes: number): Promise<string | null> {
  const zip = await openZip(zipPath);
  try {
    let found: yauzl.Entry | undefined;
    await walkEntries(zip, (entry) => {
      if (entry.fileName !== entryName) return;
      found = entry;
      return false;
    });
    if (!found || found.uncompressedSize > maxBytes) return null;
    const stream = await openEntryStream(zip, found);
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of stream) {
      size += (chunk as Buffer).length;
      if (size > maxBytes) return null;
      chunks.push(chunk as Buffer);
    }
    return Buffer.concat(chunks).toString('utf8');
  } finally {
    zip.close();
  }
}

export const PROFILE_LIMITS = { serverEnv: SERVER_ENV_MAX, accessList: ACCESS_LIST_MAX, meta: META_MAX };

const isCompound = (value: NbtValue | undefined): value is NbtCompound =>
  typeof value === 'object' && value !== null && !Array.isArray(value) && !Buffer.isBuffer(value);

/** Confere que o level.dat extraído é de um mundo Java e devolve a versão, quando ela vem escrita. */
export async function readLevelVersion(worldDir: string): Promise<{ version?: string } | null> {
  const path = join(worldDir, 'level.dat');
  const info = await stat(path).catch(() => null);
  if (!info?.isFile() || info.size > LEVEL_DAT_MAX) return null;
  try {
    const { readFile } = await import('node:fs/promises');
    const root = readNbt(await readFile(path));
    const data = isCompound(root.Data) ? root.Data : null;
    if (!data || (typeof data.DataVersion !== 'number' && !isCompound(data.Version) && typeof data.LevelName !== 'string')) return null;
    const version = isCompound(data.Version) && typeof data.Version.Name === 'string' ? data.Version.Name : undefined;
    return { version };
  } catch {
    return null;
  }
}

/**
 * Do server.env que veio no .zip, só as opções conhecidas do painel, com valor válido.
 * LEVEL e as chaves de infraestrutura (RCON, portas) nunca entram.
 */
export function sanitizeServerEnv(text: string): { values: Record<string, string>; ignored: string[] } {
  const values: Record<string, string> = {};
  const ignored: string[] = [];
  for (const [key, value] of Object.entries(new EnvDocument(text).toRecord())) {
    const field = SETTINGS_BY_KEY.get(key);
    if (!field || RESERVED_KEYS.has(key) || key === 'LEVEL' || validateSetting(field, value) !== null) {
      ignored.push(key);
      continue;
    }
    values[key] = value;
  }
  return { values, ignored };
}

const PLAYER_NAME = /^\.?[A-Za-z0-9_]{1,32}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IP = /^[0-9a-fA-F:.]{2,45}$/;
const shortText = (value: unknown, max = 256) => (typeof value === 'string' && value.length <= max ? value : undefined);

/** Lista de jogadores do .zip no formato do servidor, só com os campos conhecidos; formato errado = null. */
export function sanitizeAccessList(file: AccessFile, text: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length > 10_000) return null;
  const out: Record<string, unknown>[] = [];
  for (const item of parsed) {
    if (typeof item !== 'object' || item === null) return null;
    const row = item as Record<string, unknown>;
    if (file === 'banned-ips.json') {
      if (typeof row.ip !== 'string' || !IP.test(row.ip)) return null;
      out.push(clean({ ip: row.ip, created: shortText(row.created), source: shortText(row.source), expires: shortText(row.expires), reason: shortText(row.reason) }));
      continue;
    }
    if (typeof row.name !== 'string' || !PLAYER_NAME.test(row.name)) return null;
    if (row.uuid !== undefined && (typeof row.uuid !== 'string' || !UUID.test(row.uuid))) return null;
    const base = { uuid: row.uuid as string | undefined, name: row.name };
    if (file === 'ops.json') {
      const level = Number.isInteger(row.level) && (row.level as number) >= 1 && (row.level as number) <= 4 ? row.level : undefined;
      out.push(clean({ ...base, level, bypassesPlayerLimit: typeof row.bypassesPlayerLimit === 'boolean' ? row.bypassesPlayerLimit : undefined }));
    } else if (file === 'banned-players.json') {
      out.push(clean({ ...base, created: shortText(row.created), source: shortText(row.source), expires: shortText(row.expires), reason: shortText(row.reason) }));
    } else {
      out.push(clean(base));
    }
  }
  return `${JSON.stringify(out, null, 2)}\n`;
}

function clean(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).filter(([, value]) => value !== undefined));
}

/** mundo.json do .zip: só a seed e o tipo de mapa, se forem válidos. */
export function sanitizeMeta(text: string): { seed?: string; levelType?: string } {
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const levelTypes = new Set((SETTINGS_BY_KEY.get('LEVEL_TYPE')?.options ?? []).map((o) => o.value));
    return clean({
      seed: typeof parsed.seed === 'string' && /^-?\d{1,20}$/.test(parsed.seed) ? parsed.seed : undefined,
      levelType: typeof parsed.levelType === 'string' && levelTypes.has(parsed.levelType) ? parsed.levelType : undefined,
    }) as { seed?: string; levelType?: string };
  } catch {
    return {};
  }
}

/**
 * .zip de uma pasta de mundo, gerado enquanto é enviado (sem arquivo temporário).
 * Tudo fica dentro de `rootName/`, para quem abrir o .zip já ter a pasta do mundo.
 */
export async function zipDirectory(dir: string, rootName: string): Promise<Readable> {
  const zip = new yazl.ZipFile();
  const walk = async (absolute: string, relative: string): Promise<void> => {
    for (const entry of await readdir(absolute, { withFileTypes: true })) {
      const path = join(absolute, entry.name);
      const inside = relative ? `${relative}/${entry.name}` : entry.name;
      // Atalhos e arquivos especiais ficam de fora, e o session.lock é recriado pelo servidor.
      if (entry.isDirectory()) await walk(path, inside);
      else if (entry.isFile() && entry.name !== 'session.lock') {
        zip.addFile(path, `${rootName}/${inside}`, { compress: !STORED_EXTENSIONS.has(extname(entry.name).toLowerCase()) });
      }
    }
  };
  await walk(dir, '');
  zip.end();
  return zip.outputStream as unknown as Readable;
}
