import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseGameRuleQuery, parseList, parseTps } from './minecraft.ts';
import { stripFormatting } from './rcon.ts';

// Respostas reais capturadas de um Paper 26.2 via RCON.
test('stripFormatting + parseTps com cores ANSI do Paper', () => {
  const raw = '\x1b[33mTPS from last 1m, 5m, 15m: \x1b[32m20.0\x1b[0m, \x1b[32m19.9\x1b[0m, \x1b[32m20.0\n\x1b[0m';
  assert.deepEqual(parseTps(stripFormatting(raw)), [20, 19.9, 20]);
  assert.equal(stripFormatting('§aVerde§r normal'), 'Verde normal');
});

test('regra inexistente responde erro com ANSI e não é confundida com valor', () => {
  const raw = 'Incorrect argument for command\n\x1b[0mgamerule keepInventory<--[HERE]';
  assert.equal(parseGameRuleQuery(stripFormatting(raw)), null);
});

test('parseList com e sem jogadores', () => {
  assert.deepEqual(parseList('There are 0 of a max of 20 players online: '), { online: 0, max: 20, names: [] });
  assert.deepEqual(parseList('There are 2 of a max of 20 players online: Steve, Alex'), {
    online: 2,
    max: 20,
    names: ['Steve', 'Alex'],
  });
  assert.equal(parseList('Unknown command'), null);
});

test('parseTps ignora marcadores do Paper', () => {
  assert.deepEqual(parseTps('TPS from last 1m, 5m, 15m: *20.0, 19.5, 18.25'), [20, 19.5, 18.25]);
  assert.equal(parseTps('Unknown or incomplete command'), undefined);
});

test('parseGameRuleQuery reconhece valor e regra inexistente', () => {
  assert.equal(parseGameRuleQuery('Gamerule keep_inventory is currently set to: false'), 'false');
  assert.equal(parseGameRuleQuery('Gamerule random_tick_speed is currently set to: 3'), '3');
  assert.equal(parseGameRuleQuery('Incorrect argument for command'), null);
});
