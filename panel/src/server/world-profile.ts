/**
 * Perfil de cada mundo: a configuração que vai junto com ele, guardada em <mundo>/minetune/.
 *   server.env        versão, tipo de servidor, memória, jogabilidade... (tudo do painel)
 *   modrinth/*.txt    listas de plugins e mods
 *   acesso/*.json     convidados, administradores e banidos
 *
 * O servidor continua lendo config/ e os .json da raiz de /data: esses arquivos são
 * sempre os do mundo ligado. Ao trocar de mundo, a configuração em uso é guardada no
 * mundo que sai e a do mundo que entra é copiada para o lugar dela. Como fica dentro
 * da pasta do mundo, o perfil acompanha renomear, guardar, apagar e os backups.
 */

import { access, copyFile, mkdir, readdir, rename, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { BaseConfig } from './config.ts';
import { ConfigStore } from './config-store.ts';
import { PROFILE_DIR, type WorldStore } from './worlds.ts';

/** Listas que o servidor grava na raiz de /data e que passam a ser de cada mundo. */
export const ACCESS_FILES = ['whitelist.json', 'ops.json', 'banned-players.json', 'banned-ips.json'] as const;
const ACCESS_DIR = 'acesso';

const exists = (path: string) =>
  access(path).then(
    () => true,
    () => false,
  );

async function copyAtomic(from: string, to: string): Promise<void> {
  await mkdir(dirname(to), { recursive: true });
  const tmp = `${to}.tmp-${process.pid}`;
  await copyFile(from, tmp);
  await rename(tmp, to);
}

const listTxt = async (dir: string) => (await readdir(dir).catch(() => [] as string[])).filter((file) => file.endsWith('.txt'));

export class WorldProfiles {
  private readonly configDir: string;
  private readonly dataDir: string;
  private readonly worlds: WorldStore;

  constructor(config: Pick<BaseConfig, 'CONFIG_DIR' | 'DATA_DIR'>, worlds: WorldStore) {
    this.configDir = config.CONFIG_DIR;
    this.dataDir = config.DATA_DIR;
    this.worlds = worlds;
  }

  dir(folder: string): string {
    return join(this.worlds.dir(folder), PROFILE_DIR);
  }

  hasProfile(folder: string): Promise<boolean> {
    return Promise.resolve().then(() => exists(join(this.dir(folder), 'server.env')));
  }

  /** server.env e modrinth/ do perfil, com a mesma validação e escrita atômica do config/. */
  store(folder: string): ConfigStore {
    return new ConfigStore(this.dir(folder));
  }

  accessDir(folder: string): string {
    return join(this.dir(folder), ACCESS_DIR);
  }

  /** Guarda a configuração em uso (config/ e listas de acesso) dentro do mundo. */
  async saveLive(folder: string): Promise<void> {
    const dir = this.dir(folder);
    await mkdir(dir, { recursive: true });
    if (await exists(join(this.configDir, 'server.env'))) await copyAtomic(join(this.configDir, 'server.env'), join(dir, 'server.env'));
    for (const file of await listTxt(join(this.configDir, 'modrinth'))) {
      await copyAtomic(join(this.configDir, 'modrinth', file), join(dir, 'modrinth', file));
    }
    for (const file of ACCESS_FILES) {
      const live = join(this.dataDir, file);
      if (await exists(live)) await copyAtomic(live, join(dir, ACCESS_DIR, file));
      else await rm(join(dir, ACCESS_DIR, file), { force: true });
    }
  }

  /** Mundo novo começando com a configuração de um mundo guardado (sem a seed e o mapa dele). */
  async copyFrom(from: string, to: string): Promise<void> {
    const source = this.dir(from);
    const target = this.dir(to);
    await copyAtomic(join(source, 'server.env'), join(target, 'server.env'));
    for (const file of await listTxt(join(source, 'modrinth'))) {
      await copyAtomic(join(source, 'modrinth', file), join(target, 'modrinth', file));
    }
    for (const file of ACCESS_FILES) {
      const saved = join(source, ACCESS_DIR, file);
      if (await exists(saved)) await copyAtomic(saved, join(target, ACCESS_DIR, file));
    }
  }

  /**
   * Mundo novo começa sem convidados, administradores nem banidos: cada mapa tem as suas
   * pessoas. Sem os arquivos, applyToLive apaga as listas da raiz e o servidor cria vazias.
   */
  async clearAccess(folder: string): Promise<void> {
    await rm(join(this.dir(folder), ACCESS_DIR), { recursive: true, force: true });
  }

  /** Mundo sem perfil herda a configuração em uso na primeira vez que é configurado ou ligado. */
  async ensure(folder: string): Promise<void> {
    if (!(await this.hasProfile(folder))) await this.saveLive(folder);
  }

  /** Copia a configuração guardada no mundo para config/ e para as listas da raiz de /data. */
  async applyToLive(folder: string): Promise<void> {
    const dir = this.dir(folder);
    if (!(await exists(join(dir, 'server.env')))) throw new Error(`"${folder}" não tem configuração guardada`);
    await copyAtomic(join(dir, 'server.env'), join(this.configDir, 'server.env'));
    for (const file of await listTxt(join(dir, 'modrinth'))) {
      await copyAtomic(join(dir, 'modrinth', file), join(this.configDir, 'modrinth', file));
    }
    for (const file of ACCESS_FILES) {
      const saved = join(dir, ACCESS_DIR, file);
      // Lista que o mundo não tem (ninguém banido, por exemplo) não fica herdada do mundo anterior.
      if (await exists(saved)) await copyAtomic(saved, join(this.dataDir, file));
      else await rm(join(this.dataDir, file), { force: true });
    }
  }
}
