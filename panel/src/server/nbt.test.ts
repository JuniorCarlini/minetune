import assert from 'node:assert/strict';
import { test } from 'node:test';
import { levelDat } from './nbt-fixture.ts';
import { readNbt } from './nbt.ts';

test('lê nome, versão e última vez jogado de um level.dat', () => {
  const root = readNbt(levelDat({ name: 'sobrevivencia', version: '26.1.2', dataVersion: 4790, lastPlayed: 1789324946823 }));
  const data = root.Data as Record<string, unknown>;
  assert.equal(data.LevelName, 'sobrevivencia');
  assert.equal(data.DataVersion, 4790);
  assert.equal(data.LastPlayed, 1789324946823n);
  assert.deepEqual(data.Version, { Name: '26.1.2', Id: 4790, Snapshot: 0 });
});

test('recusa arquivo que não é NBT e arquivo cortado no meio', () => {
  assert.throws(() => readNbt(Buffer.from('não é um mundo')), /não é NBT/);
  const cut = readNbt.bind(null, Buffer.from([10, 0, 0, 8, 0, 9]));
  assert.throws(cut, /truncado/);
});
