import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EnvDocument, parseValue } from './env-file.ts';

test('parseValue entende aspas duplas, simples e valores sem aspas', () => {
  assert.equal(parseValue('"a \\"b\\" \\$HOME"'), 'a "b" $HOME');
  assert.equal(parseValue("'literal $x'"), 'literal $x');
  assert.equal(parseValue('valor   # comentário'), 'valor');
  assert.equal(parseValue('""'), '');
});

test('set preserva comentários, atualiza no lugar e remove duplicatas', () => {
  const doc = new EnvDocument('# topo\nA="1"\n\nB=2\nA=3\n');
  doc.set('A', 'novo');
  doc.set('C', 'x');
  doc.set('B', null);
  assert.equal(doc.toString(), '# topo\n\nA="novo"\nC="x"\n');
});

test('o arquivo gerado é shell válido e o bash lê os mesmos valores', () => {
  const tricky = 'Olá "mundo" $USER `id` \\ fim';
  const doc = new EnvDocument('');
  doc.set('MOTD', tricky);
  doc.set('EMPTY', '');

  const dir = mkdtempSync(join(tmpdir(), 'envfile-'));
  const file = join(dir, 'server.env');
  writeFileSync(file, doc.toString());

  const out = execFileSync('bash', ['-c', 'set -a; . "$1"; printf "%s|%s" "$MOTD" "$EMPTY"', '_', file], {
    encoding: 'utf8',
  });
  assert.equal(out, `${tricky}|`);
  assert.equal(new EnvDocument(doc.toString()).get('MOTD'), tricky);
});
