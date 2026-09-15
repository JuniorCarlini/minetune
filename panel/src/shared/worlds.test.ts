import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseSeed, worldBlockReason, worldFolderFrom, worldNameError, worldNameInputError, worldSettingsErrors, worldTooNew } from './worlds.ts';

test('mundo salvo pelo Paper não troca para Vanilla, Fabric ou NeoForge', () => {
  const paperWorld = { name: 'sobrevivencia', generated: true, version: '26.2', savedBy: 'paper' as const };
  for (const type of ['NEOFORGE', 'FABRIC', 'VANILLA', '']) {
    assert.match(worldSettingsErrors(paperWorld, { TYPE: type }, { TYPE: 'PAPER' }).TYPE!, /salvo pelo Paper/, `Paper → ${type || 'vazio'}`);
  }
  assert.deepEqual(worldSettingsErrors(paperWorld, { TYPE: 'PURPUR' }, { TYPE: 'PAPER' }), {});
  // O contrário funciona: o Paper converte um mundo oficial.
  assert.deepEqual(worldSettingsErrors({ ...paperWorld, savedBy: 'vanilla' }, { TYPE: 'PAPER' }, { TYPE: 'NEOFORGE' }), {});
  // Mundo ainda sem mapa aceita qualquer tipo.
  assert.deepEqual(worldSettingsErrors({ ...paperWorld, generated: false }, { TYPE: 'NEOFORGE' }, { TYPE: 'PAPER' }), {});
  // Ligar um mundo guardado com tipo que não abre também é bloqueado.
  assert.match(worldBlockReason({ ...paperWorld, mixedVersions: false }, '26.2', 'NEOFORGE')!, /salvo pelo Paper/);
  assert.equal(worldBlockReason({ ...paperWorld, mixedVersions: false }, '26.2', 'PAPER'), null);
});

test('texto colado no campo de nome é recusado; nomes curtos continuam valendo', () => {
  const pasted = 'O mapa sai da seed e do tipo. Depois que o servidor gera, ele não muda mais.';
  assert.match(worldNameInputError(pasted)!, /texto colado/);
  assert.match(worldNameInputError('meu mundo, com amigos')!, /texto colado/);
  assert.equal(worldNameInputError('Mundo do João 2'), null);
  assert.equal(worldNameInputError('sobrevivencia'), null);
  // No servidor, a pasta que já saiu desse texto também é recusada.
  assert.match(worldNameError('o-mapa-sai-da-seed-e-do-tipo.-de')!, /texto colado/);
  assert.equal(worldNameError('mundo-do-joao-2'), null);
});

test('mundo gerado não volta de versão, e só o que mudou é conferido', () => {
  const w = { name: 'w', generated: true, version: '26.2', savedBy: 'paper' as const };
  assert.match(worldSettingsErrors(w, { VERSION: '26.1.2' }, { VERSION: '26.2' }).VERSION!, /26\.2 ou mais nova/);
  assert.deepEqual(worldSettingsErrors(w, { VERSION: 'LATEST' }, { VERSION: '26.2' }), {});
  // Configuração antiga já salva (NeoForge) não trava mudar outra coisa.
  assert.deepEqual(worldSettingsErrors(w, { TYPE: 'NEOFORGE', MOTD: 'oi' }, { TYPE: 'NEOFORGE' }), {});
});

test('nome de mundo: aceita pasta simples e recusa o que atrapalha o servidor', () => {
  assert.equal(worldNameError('sobrevivencia-2'), null);
  assert.equal(worldNameError('world-26.2-2026-09-13'), null);
  assert.match(worldNameError('')!, /nome/);
  assert.match(worldNameError('meu mundo')!, /espaços/);
  assert.match(worldNameError('../fora')!, /letras/);
  assert.match(worldNameError('a..b')!, /letras/);
  assert.match(worldNameError('plugins')!, /pasta do servidor/);
  assert.match(worldNameError('x'.repeat(33))!, /32/);
});

test('o que a pessoa digita vira nome de pasta válido', () => {
  assert.equal(worldFolderFrom('Mundo do João!'), 'mundo-do-joao');
  assert.equal(worldFolderFrom('  Criativo 2  '), 'criativo-2');
  assert.equal(worldNameError(worldFolderFrom('...Ilha...')), null);
});

test('mundo de versão mais nova que a do servidor não abre', () => {
  assert.equal(worldTooNew('26.2', '26.1.2'), true);
  assert.equal(worldTooNew('26.1.2', '26.2'), false);
  assert.equal(worldTooNew('26.1.2', '26.1.2'), false);
  assert.equal(worldTooNew('26.2', 'LATEST'), false);
  assert.equal(worldTooNew(undefined, '26.1.2'), false);
});

test('seed lida da resposta do /seed', () => {
  assert.equal(parseSeed('Seed: [-8660647838225998762]'), '-8660647838225998762');
  assert.equal(parseSeed('Unknown or incomplete command'), undefined);
});

test('quando o mundo pode ou não abrir no servidor', () => {
  const mixed = { name: 'antigo', version: '26.1.2', mixedVersions: true };
  // Mesmo servidor que estragou o mundo: continua sem ler as partes 26.2.
  assert.match(worldBlockReason(mixed, '26.1.2')!, /versão mais antiga/);
  // Servidor mais novo que a versão anotada: volta a ler tudo.
  assert.equal(worldBlockReason(mixed, '26.2'), null);
  assert.match(worldBlockReason({ name: 'novo', version: '26.2', mixedVersions: false }, '26.1.2')!, /26\.2 ou mais nova/);
  assert.equal(worldBlockReason({ name: 'ok', version: '26.1.2', mixedVersions: false }, '26.1.2'), null);
});
