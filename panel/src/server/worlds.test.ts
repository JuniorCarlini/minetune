import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { gameRulesDat, levelDat, regionFile } from './nbt-fixture.ts';
import { ARCHIVE_DIR, PROFILE_DIR, WorldStore } from './worlds.ts';

/** /data de mentira: dois mundos na raiz, um guardado de outra versão e pastas do servidor. */
async function dataDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'minetune-worlds-'));
  const world = async (folder: string, version: string, lastPlayed: number) => {
    await mkdir(join(dir, folder), { recursive: true });
    await writeFile(join(dir, folder, 'level.dat'), levelDat({ version, dataVersion: 4790, lastPlayed }));
  };
  await world('world', '26.1.2', 2_000);
  await world('criativo', '26.1.2', 3_000);
  await world(`${ARCHIVE_DIR}/antigo-26.2`, '26.2', 1_000);
  await mkdir(join(dir, 'plugins'));
  await mkdir(join(dir, 'libraries'));
  await writeFile(join(dir, 'server.properties'), 'level-name=world\n');
  return dir;
}

test('lista só pastas com level.dat, o ligado primeiro e depois os jogados mais recentemente', async () => {
  const store = new WorldStore(await dataDir());
  const worlds = await store.list('world');
  assert.deepEqual(
    worlds.map((w) => [w.folder, w.active, w.archived, w.version]),
    [
      ['world', true, false, '26.1.2'],
      ['criativo', false, false, '26.1.2'],
      [`${ARCHIVE_DIR}/antigo-26.2`, false, true, '26.2'],
    ],
  );
  assert.equal(worlds[1]!.name, 'criativo');
  assert.equal(worlds[2]!.name, 'antigo-26.2');
  assert.equal(worlds[1]!.lastPlayed, new Date(3_000).toISOString());
  assert.ok(worlds[0]!.sizeBytes > 0);
});

test('anota se o mapa foi salvo pelo Paper ou por um servidor oficial', async () => {
  const dir = await dataDir();
  await mkdir(join(dir, 'do-paper'));
  await writeFile(join(dir, 'do-paper', 'level.dat'), levelDat({ version: '26.2', dataVersion: 4903, paper: true }));
  const worlds = await new WorldStore(dir).list('world');
  assert.equal(worlds.find((w) => w.folder === 'do-paper')?.savedBy, 'paper');
  assert.equal(worlds.find((w) => w.folder === 'world')?.savedBy, 'vanilla');
});

test('seed e tipo guardados pelo painel aparecem na lista', async () => {
  const store = new WorldStore(await dataDir());
  await store.writeMeta('criativo', { seed: '-8660647838225998762', levelType: 'minecraft:flat' });
  const criativo = (await store.list('world')).find((w) => w.folder === 'criativo');
  assert.equal(criativo?.seed, '-8660647838225998762');
  assert.equal(criativo?.levelType, 'minecraft:flat');
});

test('pasta só com a seed não é mundo; com a configuração criada pelo painel é um mundo ainda não gerado', async () => {
  const dir = await dataDir();
  const store = new WorldStore(dir);
  await store.writeMeta('ilha', { seed: '42' });
  assert.equal(await store.exists('ilha'), true);
  assert.equal((await store.list('world')).some((w) => w.folder === 'ilha'), false);
  assert.equal((await store.readMeta('ilha')).seed, '42');

  await writeFile(join(dir, 'ilha', PROFILE_DIR, 'server.env'), 'VERSION="26.2"\n');
  const ilha = (await store.list('world')).find((w) => w.folder === 'ilha');
  assert.equal(ilha?.generated, false);
  assert.equal(ilha?.hasProfile, true);
  assert.equal(ilha?.seed, '42');
});

test('seed anotada no lugar antigo (minetune.json) continua valendo e migra ao regravar', async () => {
  const dir = await dataDir();
  const store = new WorldStore(dir);
  await writeFile(join(dir, 'world', 'minetune.json'), '{"seed":"-1"}');
  assert.equal((await store.readMeta('world')).seed, '-1');
  await store.writeMeta('world', { seed: '-1', createdAt: 'hoje' });
  assert.equal((await store.readMeta('world')).createdAt, 'hoje');
  await assert.rejects(readFile(join(dir, 'world', 'minetune.json')), /ENOENT/);
});

test('trazer de mundos-guardados, renomear e apagar', async () => {
  const store = new WorldStore(await dataDir());
  assert.equal(await store.bringToRoot(`${ARCHIVE_DIR}/antigo-26.2`), 'antigo-26.2');
  assert.equal(await store.rename('antigo-26.2', 'antigo'), 'antigo');
  await assert.rejects(store.rename('antigo', 'criativo'), /existe/);
  await assert.rejects(store.rename('antigo', 'meu mundo'), /espaços/);

  await store.remove('antigo');
  assert.deepEqual(
    (await store.list('world')).map((w) => w.folder),
    ['world', 'criativo'],
  );
  await assert.rejects(store.remove('plugins'), /não parece um mundo/);
});

test('não sai de /data nem entra em pastas fora de mundos-guardados', async () => {
  const store = new WorldStore(await dataDir());
  await assert.rejects(store.exists('../fora'), /inválida/);
  await assert.rejects(store.exists('plugins/qualquer'), /inválida/);
  await assert.rejects(store.remove(`${ARCHIVE_DIR}/../../etc`), /inválida/);
});

test('regras de um mundo guardado vêm do arquivo do mapa, sem ligar o mundo', async () => {
  const dir = await dataDir();
  const rulesDir = join(dir, 'criativo', 'dimensions', 'minecraft', 'overworld', 'data', 'minecraft');
  await mkdir(rulesDir, { recursive: true });
  await writeFile(join(rulesDir, 'game_rules.dat'), gameRulesDat({ keep_inventory: true, advance_time: false, random_tick_speed: 7 }));

  const store = new WorldStore(dir);
  const result = await store.readGameRules('criativo');
  assert.equal(result?.readOnly, true);
  assert.equal(result?.naming, 'modern');
  const values = new Map(result!.rules.map((rule) => [rule.name, rule.value]));
  assert.equal(values.get('keep_inventory'), 'true');
  assert.equal(values.get('advance_time'), 'false');
  assert.equal(values.get('random_tick_speed'), '7');
  // Mundo sem regras gravadas (nunca ligado): nada para mostrar.
  assert.equal(await store.readGameRules('world'), null);
});

test('mundo 26.2 aberto num servidor 26.1.2 fica marcado: level.dat diz 26.1.2, mas o mapa é 26.2', async () => {
  const dir = await dataDir();
  // O caso real: o servidor mais antigo regrava o level.dat (4790) e deixa os chunks em 4903.
  const folder = join(dir, ARCHIVE_DIR, 'misturado');
  await mkdir(join(folder, 'dimensions', 'minecraft', 'overworld', 'region'), { recursive: true });
  await writeFile(join(folder, 'level.dat'), levelDat({ version: '26.1.2', dataVersion: 4790, lastPlayed: 500 }));
  await writeFile(join(folder, 'dimensions', 'minecraft', 'overworld', 'region', 'r.0.0.mca'), regionFile([4790, 4903]));
  // Mundo saudável: chunks na mesma versão do level.dat.
  await mkdir(join(dir, 'world', 'dimensions', 'minecraft', 'overworld', 'region'), { recursive: true });
  await writeFile(join(dir, 'world', 'dimensions', 'minecraft', 'overworld', 'region', 'r.0.0.mca'), regionFile([4790, 4790]));

  const worlds = await new WorldStore(dir).list('world');
  assert.equal(worlds.find((w) => w.folder === `${ARCHIVE_DIR}/misturado`)?.mixedVersions, true);
  assert.equal(worlds.find((w) => w.folder === 'world')?.mixedVersions, false);
  assert.equal(worlds.find((w) => w.folder === 'criativo')?.mixedVersions, false);
});
