import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { ConfigStore } from './config-store.ts';
import { levelDat } from './nbt-fixture.ts';
import { WorldProfiles } from './world-profile.ts';
import { WorldStore } from './worlds.ts';

/** config/ e /data de mentira: "world" ligado na 26.1.2 e "criativo" guardado, sem perfil ainda. */
async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'minetune-profiles-'));
  const configDir = join(root, 'config');
  const dataDir = join(root, 'data');
  await mkdir(join(configDir, 'modrinth'), { recursive: true });
  await writeFile(join(configDir, 'server.env'), 'TYPE="PAPER"\nVERSION="26.1.2"\nLEVEL="world"\n');
  await writeFile(join(configDir, 'modrinth', 'paper.txt'), '# plugins\nchunky?\n');
  for (const [folder, version] of [
    ['world', '26.1.2'],
    ['criativo', '26.2'],
  ]) {
    await mkdir(join(dataDir, folder!), { recursive: true });
    await writeFile(join(dataDir, folder!, 'level.dat'), levelDat({ version }));
  }
  await writeFile(join(dataDir, 'whitelist.json'), '[{"name":"Steve"}]');
  await writeFile(join(dataDir, 'banned-players.json'), '[{"name":"Griefer"}]');
  const worlds = new WorldStore(dataDir);
  return { configDir, dataDir, profiles: new WorldProfiles({ CONFIG_DIR: configDir, DATA_DIR: dataDir }, worlds), live: new ConfigStore(configDir) };
}

test('mundo guardado herda a configuração em uso e depois muda sem mexer no ligado', async () => {
  const { profiles, live } = await setup();
  assert.equal(await profiles.hasProfile('criativo'), false);

  await profiles.ensure('criativo');
  assert.equal(await profiles.hasProfile('criativo'), true);
  assert.equal((await profiles.store('criativo').readSettings()).values.VERSION, '26.1.2');

  await profiles.store('criativo').updateSettings({ VERSION: '26.2', MOTD: 'Criativo' });
  assert.equal((await profiles.store('criativo').readSettings()).values.VERSION, '26.2');
  assert.equal((await live.readSettings()).values.VERSION, '26.1.2');
  assert.match(await readFile(join(profiles.accessDir('criativo'), 'whitelist.json'), 'utf8'), /Steve/);
});

test('trocar de mundo leva e traz a configuração, os plugins e as listas de cada um', async () => {
  const { profiles, live, configDir, dataDir } = await setup();
  await profiles.ensure('criativo');
  await profiles.store('criativo').updateSettings({ VERSION: '26.2', MOTD: 'Criativo' });
  await writeFile(join(profiles.accessDir('criativo'), 'whitelist.json'), '[{"name":"Alex"}]');
  await writeFile(join(profiles.dir('criativo'), 'modrinth', 'paper.txt'), 'worldedit\n');
  // No criativo ninguém foi banido.
  await writeFile(join(profiles.accessDir('criativo'), 'banned-players.json'), '[]');

  // world → criativo
  await profiles.saveLive('world');
  await profiles.applyToLive('criativo');
  await live.updateSettings({ LEVEL: 'criativo' });
  assert.equal((await live.readSettings()).values.VERSION, '26.2');
  assert.match(await readFile(join(dataDir, 'whitelist.json'), 'utf8'), /Alex/);
  assert.equal(await readFile(join(dataDir, 'banned-players.json'), 'utf8'), '[]');
  assert.equal(await readFile(join(configDir, 'modrinth', 'paper.txt'), 'utf8'), 'worldedit\n');

  // criativo → world: tudo volta como estava
  await profiles.saveLive('criativo');
  await profiles.applyToLive('world');
  await live.updateSettings({ LEVEL: 'world' });
  const values = (await live.readSettings()).values;
  assert.equal(values.VERSION, '26.1.2');
  assert.equal(values.MOTD, undefined);
  assert.match(await readFile(join(dataDir, 'whitelist.json'), 'utf8'), /Steve/);
  assert.match(await readFile(join(dataDir, 'banned-players.json'), 'utf8'), /Griefer/);
  assert.match(await readFile(join(configDir, 'modrinth', 'paper.txt'), 'utf8'), /chunky/);
  // E o criativo guardou o que estava em uso nele.
  assert.equal((await profiles.store('criativo').readSettings()).values.MOTD, 'Criativo');
});

test('mundo novo herda a configuração mas começa sem convidados, administradores e banidos', async () => {
  const { profiles, dataDir } = await setup();
  await writeFile(join(dataDir, 'ops.json'), '[{"name":"Steve","level":4}]');

  // Mesmo passo a passo do POST /worlds: copia o que está em uso e limpa as pessoas.
  await profiles.saveLive('novo');
  await profiles.clearAccess('novo');
  assert.equal((await profiles.store('novo').readSettings()).values.VERSION, '26.1.2');

  await profiles.saveLive('world');
  await profiles.applyToLive('novo');
  for (const file of ['whitelist.json', 'ops.json', 'banned-players.json']) {
    await assert.rejects(readFile(join(dataDir, file), 'utf8'), { code: 'ENOENT' }, `${file} não deveria vir do mundo anterior`);
  }

  // O mundo de onde veio continua com as pessoas dele.
  await profiles.applyToLive('world');
  assert.match(await readFile(join(dataDir, 'ops.json'), 'utf8'), /Steve/);
});

test('ligar mundo sem configuração guardada falha em vez de ligar com a do anterior', async () => {
  const { profiles } = await setup();
  await assert.rejects(profiles.applyToLive('criativo'), /não tem configuração guardada/);
});
