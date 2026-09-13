/**
 * Lista de versões disponíveis por software, direto das fontes oficiais.
 * Só versões que a imagem itzg consegue baixar para aquele software aparecem.
 */

import { compareVersions, neoforgeToMinecraft, type ServerType } from '../shared/versions.ts';

export interface RawVersion {
  id: string;
  stable: boolean;
}

const HEADERS = { 'User-Agent': 'minetune-panel/0.1 (self-hosted)' };

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`${new URL(url).host} respondeu ${res.status}`);
  return (await res.json()) as T;
}

const isPrerelease = (id: string) => /-(pre|rc|snapshot)|w\d+[a-z]$|-/i.test(id);

const sortDesc = (versions: RawVersion[]) => [...versions].sort((a, b) => compareVersions(b.id, a.id));

const FETCHERS: Record<ServerType, () => Promise<RawVersion[]>> = {
  async VANILLA() {
    const manifest = await getJson<{ versions: { id: string; type: string }[] }>(
      'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json',
    );
    // Já vem do mais novo para o mais antigo; alfa e beta de 2010 ficam de fora.
    return manifest.versions
      .filter((v) => v.type === 'release' || v.type === 'snapshot')
      .map((v) => ({ id: v.id, stable: v.type === 'release' }));
  },

  async PAPER() {
    const project = await getJson<{ versions: Record<string, string[]> }>('https://fill.papermc.io/v3/projects/paper');
    const ids = Object.values(project.versions).flat();
    return sortDesc(ids.map((id) => ({ id, stable: !isPrerelease(id) })));
  },

  async PURPUR() {
    const project = await getJson<{ versions: string[] }>('https://api.purpurmc.org/v2/purpur');
    return sortDesc(project.versions.map((id) => ({ id, stable: !isPrerelease(id) })));
  },

  async FABRIC() {
    const games = await getJson<{ version: string; stable: boolean }[]>('https://meta.fabricmc.net/v2/versions/game');
    return games.map((g) => ({ id: g.version, stable: g.stable }));
  },

  async NEOFORGE() {
    const maven = await getJson<{ versions: string[] }>(
      'https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge',
    );
    // Várias builds por versão do jogo: a versão é estável se tiver ao menos uma build não-beta.
    const byMinecraft = new Map<string, boolean>();
    for (const build of maven.versions) {
      const parsed = neoforgeToMinecraft(build);
      if (parsed) byMinecraft.set(parsed.minecraft, (byMinecraft.get(parsed.minecraft) ?? false) || parsed.stable);
    }
    return sortDesc([...byMinecraft].map(([id, stable]) => ({ id, stable })));
  },
};

export function fetchVersions(type: ServerType): Promise<RawVersion[]> {
  return FETCHERS[type]();
}
