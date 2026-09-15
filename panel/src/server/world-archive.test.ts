import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createWriteStream } from 'node:fs';
import { test } from 'node:test';
import { crc32 } from 'node:zlib';
import yazl from 'yazl';
import { levelDat } from './nbt-fixture.ts';
import {
  extractWorldZip,
  inspectWorldZip,
  readLevelVersion,
  readZipText,
  sanitizeAccessList,
  sanitizeMeta,
  sanitizeServerEnv,
  zipDirectory,
} from './world-archive.ts';

const tmp = () => mkdtemp(join(tmpdir(), 'minetune-archive-'));

/** .zip montado com o yazl (como um programa de compactar faria). */
async function makeZip(files: Record<string, Buffer | string>): Promise<string> {
  const dir = await tmp();
  const path = join(dir, 'mundo.zip');
  const zip = new yazl.ZipFile();
  for (const [name, content] of Object.entries(files)) zip.addBuffer(Buffer.isBuffer(content) ? content : Buffer.from(content), name);
  zip.end();
  await pipeline(zip.outputStream, createWriteStream(path));
  return path;
}

/**
 * .zip escrito byte a byte, para montar o que um programa normal recusa criar:
 * nome com "../" e atalho (link simbólico).
 */
async function rawZip(entries: { name: string; data: Buffer; mode?: number }[]): Promise<string> {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const { name, data, mode = 0o100644 } of entries) {
    const nameBuf = Buffer.from(name);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(0x0314, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE((mode << 16) >>> 0, 38);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBuf, data);
    centrals.push(central, nameBuf);
    offset += local.length + nameBuf.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  const path = join(await tmp(), 'raw.zip');
  await writeFile(path, Buffer.concat([...locals, cd, end]));
  return path;
}

const LEVEL = levelDat({ name: 'MeuMundo', version: '26.1.2', dataVersion: 4790 });
const codes = (result: { problems: { code: string }[] }) => result.problems.map((p) => p.code);

test('mundo dentro de uma pasta é aceito, sem o lixo do Mac e sem a configuração', async () => {
  const zip = await makeZip({
    'MeuMundo/level.dat': LEVEL,
    'MeuMundo/region/r.0.0.mca': Buffer.alloc(4096, 1),
    'MeuMundo/datapacks/pack.zip': 'PK',
    'MeuMundo/session.lock': 'x',
    'MeuMundo/minetune/server.env': 'DIFFICULTY="hard"\n',
    'MeuMundo/minetune/acesso/ops.json': '[]',
    'MeuMundo/minetune/modrinth/paper.txt': 'worldedit',
    '__MACOSX/MeuMundo/._level.dat': 'x',
    'MeuMundo/.DS_Store': 'x',
  });
  const { problems, plan } = await inspectWorldZip(zip);
  assert.deepEqual(problems, []);
  assert.equal(plan!.root, 'MeuMundo/');
  assert.equal(plan!.suggestedName, 'MeuMundo');
  assert.deepEqual(plan!.files.map((f) => f.relative).sort(), ['datapacks/pack.zip', 'level.dat', 'region/r.0.0.mca']);
  assert.equal(plan!.profile.serverEnv, 'MeuMundo/minetune/server.env');
  assert.equal(plan!.profile.access['ops.json'], 'MeuMundo/minetune/acesso/ops.json');
  assert.equal(plan!.profile.ignoredModrinth, true);

  const dest = join(await tmp(), 'mundo');
  await extractWorldZip(zip, plan!, dest);
  assert.equal((await stat(join(dest, 'region/r.0.0.mca'))).size, 4096);
  assert.deepEqual(await readLevelVersion(dest), { version: '26.1.2' });
  assert.equal(await readZipText(zip, plan!.profile.serverEnv!, 1024), 'DIFFICULTY="hard"\n');
  await assert.rejects(stat(join(dest, 'minetune')), 'a configuração do .zip não é extraída');
});

test('mundo na raiz do .zip também vale', async () => {
  const { problems, plan } = await inspectWorldZip(await makeZip({ 'level.dat': LEVEL, 'region/r.0.0.mca': 'x' }));
  assert.deepEqual(problems, []);
  assert.equal(plan!.root, '');
});

test('programas, arquivos estranhos e mundos do Bedrock são recusados com o motivo', async () => {
  assert.deepEqual(codes(await inspectWorldZip(await makeZip({ 'level.dat': LEVEL, 'plugins/virus.jar': 'x', 'run.sh': 'x' }))), ['executable', 'executable']);
  assert.deepEqual(codes(await inspectWorldZip(await makeZip({ 'level.dat': LEVEL, 'foto.heic': 'x' }))), ['foreignFile']);
  assert.deepEqual(codes(await inspectWorldZip(await makeZip({ 'db/000003.log': 'x', 'levelname.txt': 'Mundo' }))), ['bedrock']);
  assert.deepEqual(codes(await inspectWorldZip(await makeZip({ 'fotos/praia.png': 'x' }))), ['noLevelDat']);
  assert.deepEqual(codes(await inspectWorldZip(await makeZip({ 'a/level.dat': LEVEL, 'b/level.dat': LEVEL }))), ['manyWorlds']);
  const notZip = join(await tmp(), 'falso.zip');
  await writeFile(notZip, 'isto não é um zip');
  assert.deepEqual(codes(await inspectWorldZip(notZip)), ['notZip']);
});

test('caminho que sai da pasta, atalho e zip bomb não passam', async () => {
  const escape = await rawZip([
    { name: 'level.dat', data: LEVEL },
    { name: '../../etc/cron.d/x', data: Buffer.from('x') },
  ]);
  assert.deepEqual(codes(await inspectWorldZip(escape)), ['unsafePath']);

  const link = await rawZip([
    { name: 'level.dat', data: LEVEL },
    { name: 'region/r.0.0.mca', data: Buffer.from('/etc/passwd'), mode: 0o120777 },
  ]);
  assert.deepEqual(codes(await inspectWorldZip(link)), ['special']);

  const bomb = await makeZip({ 'level.dat': LEVEL, 'region/r.0.0.mca': Buffer.alloc(20 * 1024 * 1024) });
  assert.deepEqual(codes(await inspectWorldZip(bomb)), ['zipBomb']);

  const big = await makeZip({ 'level.dat': LEVEL, 'region/r.0.0.mca': 'x'.repeat(2048) });
  assert.deepEqual(codes(await inspectWorldZip(big, { limits: { maxEntries: 10, maxUnzippedBytes: 1024, maxRatio: 150 } })), ['tooBig']);
});

test('do server.env só entram opções do painel com valor válido', () => {
  const { values, ignored } = sanitizeServerEnv(
    ['DIFFICULTY="hard"', 'RCON_PASSWORD="troca"', 'LEVEL="outro"', 'MEMORY="999"', 'JVM_OPTS="-javaagent:x.jar"', 'MOTD="$(rm -rf /)"'].join('\n'),
  );
  assert.deepEqual(values, { DIFFICULTY: 'hard', MOTD: '$(rm -rf /)' });
  assert.deepEqual(ignored.sort(), ['JVM_OPTS', 'LEVEL', 'MEMORY', 'RCON_PASSWORD']);
});

test('listas de jogadores só no formato do servidor', () => {
  const ops = sanitizeAccessList('ops.json', JSON.stringify([{ uuid: '6aa8c5f1-efb9-3269-9747-21c2f55e6509', name: 'Steve', level: 4, extra: '<script>' }]));
  assert.deepEqual(JSON.parse(ops!), [{ uuid: '6aa8c5f1-efb9-3269-9747-21c2f55e6509', name: 'Steve', level: 4 }]);
  assert.equal(sanitizeAccessList('whitelist.json', JSON.stringify([{ name: 'rm -rf /' }])), null);
  assert.equal(sanitizeAccessList('whitelist.json', '{"nao":"lista"}'), null);
  assert.deepEqual(sanitizeMeta('{"seed":"-123","levelType":"minecraft:flat","hack":true}'), { seed: '-123', levelType: 'minecraft:flat' });
  assert.deepEqual(sanitizeMeta('{"seed":"$(x)"}'), {});
});

test('o .zip baixado é aceito de volta, sem o session.lock', async () => {
  const world = join(await tmp(), 'wordcrias');
  await mkdir(join(world, 'region'), { recursive: true });
  await writeFile(join(world, 'level.dat'), LEVEL);
  await writeFile(join(world, 'region', 'r.0.0.mca'), Buffer.alloc(8192, 7));
  await writeFile(join(world, 'session.lock'), 'x');
  const out = join(await tmp(), 'baixado.zip');
  await pipeline(await zipDirectory(world, 'wordcrias'), createWriteStream(out));

  const { problems, plan } = await inspectWorldZip(out);
  assert.deepEqual(problems, []);
  assert.equal(plan!.root, 'wordcrias/');
  assert.ok(!plan!.files.some((f) => f.relative === 'session.lock'));
  const dest = join(await tmp(), 'volta');
  await extractWorldZip(out, plan!, dest);
  assert.deepEqual(await readFile(join(dest, 'region', 'r.0.0.mca')), Buffer.alloc(8192, 7));
});
