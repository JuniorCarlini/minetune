import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { StatusResponse } from '../shared/api.ts';
import { attentionItems } from './routes.ts';

const HOUR = 60 * 60 * 1000;

const status = (overrides: Partial<StatusResponse> = {}): StatusResponse => ({
  server: { state: 'running', health: 'healthy' },
  backup: { state: 'running' },
  game: { type: 'PAPER', version: '26.2', motd: '' },
  backupProvider: 'r2',
  lastBackup: { id: 'a', shortId: 'a', time: new Date(Date.now() - 2 * HOUR).toISOString(), tags: [] },
  resources: { memoryUsed: 3 * 1024 ** 3, memoryLimit: 6 * 1024 ** 3, cpuPercent: 5, cpuCores: 4 },
  tps: [20, 20, 20],
  attention: [],
  join: { port: 25565 },
  ...overrides,
});

const ids = (s: StatusResponse, snapshotsKnown = true) => attentionItems(s, snapshotsKnown).map((i) => i.id);

describe('avisos da tela Início', () => {
  it('não mostra nada quando está tudo certo', () => {
    assert.deepEqual(ids(status()), []);
  });

  it('servidor desligado vem primeiro e oferece ligar', () => {
    const items = attentionItems(status({ server: { state: 'exited' }, resources: undefined, tps: undefined }), true);
    assert.equal(items[0]?.id, 'server-stopped');
    assert.equal(items[0]?.action?.server, 'start');
  });

  it('avisa memória acima de 90% e jogo travando', () => {
    const s = status({ resources: { memoryUsed: 5.6 * 1024 ** 3, memoryLimit: 6 * 1024 ** 3, cpuPercent: 90, cpuCores: 4 }, tps: [12, 14, 16] });
    assert.deepEqual(ids(s), ['memory', 'performance']);
  });

  it('avisa backup só local e backup antigo', () => {
    const s = status({ backupProvider: 'local', lastBackup: { id: 'b', shortId: 'b', time: new Date(Date.now() - 72 * HOUR).toISOString(), tags: [] } });
    assert.deepEqual(ids(s), ['backup-local', 'backup-old']);
  });

  it('não acusa falta de backup antes de a lista de cópias ser lida', () => {
    assert.deepEqual(ids(status({ lastBackup: undefined }), false), []);
    assert.deepEqual(ids(status({ lastBackup: undefined }), true), ['backup-old']);
  });
});
