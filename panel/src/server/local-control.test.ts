import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { LocalControl, type SupervisorState } from './local-control.ts';

const base: SupervisorState = {
  state: 'running',
  want: 'up',
  pid: 10,
  startedAt: '2026-10-19T03:00:00Z',
  finishedAt: '',
  exitCode: 0,
  restarts: 0,
  starts: 1,
  health: 'healthy',
};

describe('LocalControl', () => {
  let dir: string;
  let control: LocalControl;
  const writeState = (service: string, state: Partial<SupervisorState>) =>
    writeFile(join(dir, 'run', 'state', `${service}.json`), JSON.stringify({ ...base, ...state }));

  before(async () => {
    dir = await mkdtemp(join(tmpdir(), 'minetune-local-'));
    await mkdir(join(dir, 'run', 'state'), { recursive: true });
    await mkdir(join(dir, 'run', 'control'), { recursive: true });
    await mkdir(join(dir, 'logs'), { recursive: true });
    await mkdir(join(dir, 'cgroup'), { recursive: true });
    control = new LocalControl({ runDir: join(dir, 'run'), logDir: join(dir, 'logs'), image: 'ghcr.io/juniorcarlini/minetune', cgroupDir: join(dir, 'cgroup') });
  });
  after(() => rm(dir, { recursive: true, force: true }));

  test('sem estado do supervisor o processo aparece como ausente', async () => {
    assert.deepEqual(await control.info('gate'), { state: 'missing' });
  });

  test('desligando continua "running", como no Docker; saúde só do servidor', async () => {
    await writeState('mc', { state: 'stopping', health: 'healthy' });
    await writeState('backup', { state: 'running', health: '' });
    assert.equal((await control.info('server')).state, 'running');
    assert.equal((await control.info('server')).health, 'healthy');
    assert.equal((await control.info('backup')).health, undefined);
    assert.equal((await control.info('backup')).image, 'ghcr.io/juniorcarlini/minetune');
  });

  test('pedido vai para a pasta de controle e só volta quando o supervisor conclui', async () => {
    await writeState('mc', { state: 'running', starts: 1 });
    // Supervisor de mentira: pega o pedido e liga o servidor de novo.
    const supervisor = (async () => {
      for (let i = 0; i < 50; i++) {
        const files = (await readdir(join(dir, 'run', 'control'))).filter((f) => f.endsWith('.cmd'));
        if (files.length) {
          const request = await readFile(join(dir, 'run', 'control', files[0]!), 'utf8');
          await rm(join(dir, 'run', 'control', files[0]!));
          await writeState('mc', { state: 'stopping', starts: 1 });
          await new Promise((r) => setTimeout(r, 200));
          await writeState('mc', { state: 'running', starts: 2 });
          return request;
        }
        await new Promise((r) => setTimeout(r, 50));
      }
      return null;
    })();
    await control.action('server', 'restart', 5);
    assert.equal(await supervisor, 'restart mc\n');
  });

  test('memória e CPU vêm do cgroup do container', async () => {
    const cg = join(dir, 'cgroup');
    await writeFile(join(cg, 'memory.current'), '3000000000\n');
    await writeFile(join(cg, 'memory.stat'), 'anon 2800000000\ninactive_file 1000000000\n');
    await writeFile(join(cg, 'memory.max'), '6442450944\n');
    await writeFile(join(cg, 'cpu.stat'), 'usage_usec 1000000\n');
    const first = await control.stats('server');
    assert.equal(first?.memoryUsed, 2_000_000_000);
    assert.equal(first?.memoryLimit, 6442450944);
    assert.equal(first?.cpuPercent, null);
    await writeFile(join(cg, 'cpu.stat'), 'usage_usec 1100000\n');
    const second = await control.stats('server');
    assert.ok(typeof second?.cpuPercent === 'number' && second.cpuPercent > 0);
    // O servidor não pode usar o limite inteiro: painel e portão dividem o container.
    assert.equal((await control.inspect('server'))?.memoryLimit, 6442450944 - 256 * 1024 ** 2);
  });

  test('logs: últimas linhas do arquivo do processo', async () => {
    await writeFile(join(dir, 'logs', 'mc.log'), 'um\ndois\ntrês\n');
    const lines: string[] = [];
    for await (const line of control.logs('server', { tail: 2 })) lines.push(line);
    assert.deepEqual(lines, ['dois', 'três']);
  });
});
