/**
 * Mundos em /data: cada pasta com level.dat é um mundo, e o ligado é o LEVEL do
 * server.env. Mundos tirados do caminho antes desta tela existir ficam em
 * mundos-guardados/ e também aparecem.
 *
 * A seed não fica em nenhum arquivo do mundo nas versões 26.x; o painel guarda a
 * dos mundos que ele cria (e a do ligado, lida pelo /seed) em minetune.json.
 */

import { access, mkdir, open, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { gunzipSync, inflateSync } from 'node:zlib';
import type { GameRulesResponse, GameRuleValue } from '../shared/api.ts';
import { GAMERULES } from '../shared/gamerules.ts';
import { worldNameError, type WorldInfo } from '../shared/worlds.ts';
import { ValidationError } from './config-store.ts';
import { readNbt, type NbtCompound, type NbtValue } from './nbt.ts';
import { PT, type Messages } from '../shared/i18n/index.ts';

export const ARCHIVE_DIR = 'mundos-guardados';
/** Pasta dentro de cada mundo com o que o painel guarda dele (ver world-profile.ts). */
export const PROFILE_DIR = 'minetune';
const META_FILE = 'mundo.json';
/** Onde a seed ficava antes de cada mundo ter a pasta minetune/. */
const LEGACY_META_FILE = 'minetune.json';

export interface WorldMeta {
  seed?: string;
  levelType?: string;
  createdAt?: string;
}

const exists = (path: string) =>
  access(path).then(
    () => true,
    () => false,
  );

const isCompound = (value: NbtValue | undefined): value is NbtCompound =>
  typeof value === 'object' && value !== null && !Array.isArray(value) && !Buffer.isBuffer(value);

export class WorldStore {
  private readonly dataDir: string;

  constructor(dataDir: string) {
    this.dataDir = dataDir;
  }

  /** Caminho absoluto de uma pasta de mundo; recusa qualquer coisa fora de /data. */
  dir(folder: string): string {
    const root = resolve(this.dataDir);
    const full = resolve(root, folder);
    const parts = relative(root, full).split(sep);
    const ok = parts[0] !== '' && !parts[0]!.startsWith('..') && (parts.length === 1 || (parts.length === 2 && parts[0] === ARCHIVE_DIR));
    if (!ok) throw new Error(`Pasta de mundo inválida: ${folder}`);
    return full;
  }

  /** O ligado primeiro; depois os jogados mais recentemente. */
  async list(active: string): Promise<WorldInfo[]> {
    const found: WorldInfo[] = [];
    for (const [base, archived] of [
      ['', false],
      [ARCHIVE_DIR, true],
    ] as const) {
      const entries = await readdir(join(this.dataDir, base), { withFileTypes: true }).catch(() => []);
      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name.startsWith('.') || (!base && entry.name === ARCHIVE_DIR)) continue;
        const folder = base ? `${base}/${entry.name}` : entry.name;
        const info = await this.read(folder, archived, folder === active);
        if (info) found.push(info);
      }
    }
    return found.sort((a, b) => Number(b.active) - Number(a.active) || (b.lastPlayed ?? '').localeCompare(a.lastPlayed ?? ''));
  }

  private async read(folder: string, archived: boolean, active: boolean): Promise<WorldInfo | null> {
    const dir = this.dir(folder);
    const hasProfile = await exists(join(dir, PROFILE_DIR, 'server.env'));
    let root: NbtCompound;
    try {
      root = readNbt(await readFile(join(dir, 'level.dat')));
    } catch {
      // Sem level.dat só é mundo se o painel já criou a configuração dele: mundo novo, ainda não gerado.
      if (!hasProfile) return null;
      const meta = await this.readMeta(folder);
      return {
        folder,
        name: basename(folder),
        active,
        archived,
        generated: false,
        hasProfile,
        seed: meta.seed,
        levelType: meta.levelType,
        sizeBytes: await dirSize(dir),
        createdAt: meta.createdAt,
        mixedVersions: false,
      };
    }
    const data = isCompound(root.Data) ? root.Data : root;
    const version = isCompound(data.Version) ? data.Version : undefined;
    const meta = await this.readMeta(folder);
    return {
      folder,
      name: basename(folder),
      active,
      archived,
      generated: true,
      hasProfile,
      version: typeof version?.Name === 'string' ? version.Name : undefined,
      dataVersion: typeof data.DataVersion === 'number' ? data.DataVersion : undefined,
      seed: meta.seed ?? legacySeed(data),
      levelType: meta.levelType,
      sizeBytes: await dirSize(dir),
      lastPlayed: typeof data.LastPlayed === 'bigint' && data.LastPlayed > 0n ? new Date(Number(data.LastPlayed)).toISOString() : undefined,
      createdAt: meta.createdAt,
      mixedVersions: await hasNewerChunks(dir, typeof data.DataVersion === 'number' ? data.DataVersion : undefined),
      savedBy: savedByPaper(data) ? 'paper' : 'vanilla',
    };
  }

  exists(folder: string): Promise<boolean> {
    return Promise.resolve().then(() => exists(this.dir(folder)));
  }

  async readMeta(folder: string): Promise<WorldMeta> {
    const dir = this.dir(folder);
    for (const path of [join(dir, PROFILE_DIR, META_FILE), join(dir, LEGACY_META_FILE)]) {
      try {
        return JSON.parse(await readFile(path, 'utf8')) as WorldMeta;
      } catch {
        // tenta o próximo lugar
      }
    }
    return {};
  }

  /** Cria as pastas se ainda não existirem: o mundo novo nasce com a seed já anotada. */
  async writeMeta(folder: string, meta: WorldMeta): Promise<void> {
    const dir = this.dir(folder);
    await mkdir(join(dir, PROFILE_DIR), { recursive: true });
    await writeFile(join(dir, PROFILE_DIR, META_FILE), `${JSON.stringify(meta, null, 2)}\n`);
    await rm(join(dir, LEGACY_META_FILE), { force: true });
  }

  /** Traz um mundo de mundos-guardados/ para a raiz de /data, onde o servidor abre. Devolve a pasta nova. */
  async bringToRoot(folder: string, m: Messages = PT): Promise<string> {
    const target = basename(folder);
    if (target === folder) return folder;
    if (await exists(this.dir(target))) {
      throw new ValidationError({ name: m.server.archiveConflict(target, ARCHIVE_DIR) });
    }
    await rename(this.dir(folder), this.dir(target));
    return target;
  }

  /** Renomeia a pasta no mesmo lugar (raiz ou mundos-guardados). Devolve a pasta nova. */
  async rename(folder: string, name: string, m: Messages = PT): Promise<string> {
    const error = worldNameError(name, m);
    if (error) throw new ValidationError({ name: error });
    const parent = dirname(folder);
    const target = parent === '.' ? name : `${parent}/${name}`;
    if (target === folder) return folder;
    if (await exists(this.dir(target))) throw new ValidationError({ name: m.server.nameTaken });
    await rename(this.dir(folder), this.dir(target));
    return target;
  }

  /**
   * Regras do jogo gravadas no mapa, para ver as de um mundo guardado sem ligar. null se o
   * mundo nunca foi ligado (ainda não há regras gravadas).
   *   26.x: dimensions/minecraft/overworld/data/minecraft/game_rules.dat ("minecraft:keep_inventory": 0/1)
   *   antes: level.dat Data.GameRules com os nomes antigos em texto ("keepInventory": "false")
   */
  async readGameRules(folder: string): Promise<GameRulesResponse | null> {
    const dir = this.dir(folder);
    try {
      const root = readNbt(await readFile(join(dir, 'dimensions', 'minecraft', 'overworld', 'data', 'minecraft', 'game_rules.dat')));
      const data = isCompound(root.data) ? root.data : root;
      const rules: GameRuleValue[] = [];
      for (const rule of GAMERULES) {
        const value = data[`minecraft:${rule.name}`];
        if (typeof value !== 'number') continue;
        rules.push({ name: rule.name, serverName: rule.name, value: rule.type === 'bool' ? String(value !== 0) : String(value) });
      }
      if (rules.length > 0) return { naming: 'modern', rules, readOnly: true };
    } catch {
      // sem o arquivo das 26.x: tenta o formato antigo, dentro do level.dat
    }
    try {
      const root = readNbt(await readFile(join(dir, 'level.dat')));
      const data = isCompound(root.Data) ? root.Data : root;
      if (!isCompound(data.GameRules)) return null;
      const stored = data.GameRules;
      const rules: GameRuleValue[] = [];
      for (const rule of GAMERULES) {
        const value = rule.legacy ? stored[rule.legacy] : undefined;
        if (rule.legacy && typeof value === 'string') rules.push({ name: rule.name, serverName: rule.legacy, value });
      }
      return rules.length > 0 ? { naming: 'legacy', rules, readOnly: true } : null;
    } catch {
      return null;
    }
  }

  /** Apaga a pasta do mundo; só aceita pastas que são mesmo mundos (têm level.dat). */
  async remove(folder: string): Promise<void> {
    const dir = this.dir(folder);
    if (!(await exists(join(dir, 'level.dat')))) throw new Error(`"${folder}" não parece um mundo (não tem level.dat)`);
    await rm(dir, { recursive: true, force: true });
  }
}

/** Até a 1.21 a seed ficava no level.dat; nas 26.x não fica mais. */
function legacySeed(data: NbtCompound): string | undefined {
  const value = isCompound(data.WorldGenSettings) ? data.WorldGenSettings.seed : data.RandomSeed;
  return typeof value === 'bigint' ? value.toString() : undefined;
}

/**
 * Algum pedaço do mapa foi gravado numa versão mais nova que a anotada no level.dat?
 * Lê só os primeiros chunks de algumas regiões: basta um para o servidor travar.
 */
/** O Paper (e derivados) marca o level.dat com Bukkit.Version e liga o pacote de dados "paper". */
function savedByPaper(data: NbtCompound): boolean {
  const enabled = isCompound(data.DataPacks) ? data.DataPacks.Enabled : undefined;
  return 'Bukkit.Version' in data || (Array.isArray(enabled) && enabled.includes('paper'));
}

async function hasNewerChunks(dir: string, levelDataVersion: number | undefined): Promise<boolean> {
  if (levelDataVersion === undefined) return false;
  // 26.x guarda as regiões em dimensions/minecraft/overworld; antes ficavam em region/.
  for (const regionDir of [join(dir, 'dimensions', 'minecraft', 'overworld', 'region'), join(dir, 'region')]) {
    const files = (await readdir(regionDir).catch(() => [] as string[])).filter((file) => file.endsWith('.mca')).slice(0, 12);
    for (const file of files) {
      const newest = await regionDataVersion(join(regionDir, file)).catch(() => undefined);
      if (newest !== undefined && newest > levelDataVersion) return true;
    }
    if (files.length > 0) return false;
  }
  return false;
}

/** Maior DataVersion entre os primeiros chunks de um arquivo .mca (cabeçalho de 4 KB com os endereços). */
async function regionDataVersion(path: string, maxChunks = 6): Promise<number | undefined> {
  const handle = await open(path, 'r');
  try {
    const header = Buffer.alloc(4096);
    if ((await handle.read(header, 0, 4096, 0)).bytesRead < 4096) return undefined;
    let newest: number | undefined;
    let parsed = 0;
    for (let index = 0; index < 1024 && parsed < maxChunks; index++) {
      const offset = header.readUIntBE(index * 4, 3) * 4096;
      if (offset === 0) continue;
      const prefix = Buffer.alloc(5);
      if ((await handle.read(prefix, 0, 5, offset)).bytesRead < 5) continue;
      const length = prefix.readUInt32BE(0);
      if (length < 2 || length > 16 * 1024 * 1024) continue;
      const body = Buffer.alloc(length - 1);
      await handle.read(body, 0, length - 1, offset + 5);
      // 1 = gzip, 2 = zlib (padrão do jogo), 3 = sem compressão; LZ4 (4) fica de fora.
      const raw = prefix[4] === 2 ? inflateSync(body) : prefix[4] === 1 ? gunzipSync(body) : prefix[4] === 3 ? body : null;
      if (!raw) continue;
      parsed++;
      const version = readNbt(raw).DataVersion;
      if (typeof version === 'number' && (newest === undefined || version > newest)) newest = version;
    }
    return newest;
  } finally {
    await handle.close();
  }
}

async function dirSize(dir: string): Promise<number> {
  let total = 0;
  for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) total += await dirSize(full);
    else if (entry.isFile()) total += (await stat(full).catch(() => ({ size: 0 }))).size;
  }
  return total;
}
