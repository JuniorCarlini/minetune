/**
 * CLI de operação, usada pelo Makefile:
 *
 *   node src/server/cli.ts backup [--tag manual]
 *   node src/server/cli.ts snapshots
 *   node src/server/cli.ts restore <id|latest> --yes [--no-safety-backup]
 *
 * Usa as mesmas rotinas e o mesmo lock do painel.
 */

import { parseArgs } from 'node:util';
import { loadBaseConfig } from './config.ts';
import { createServices } from './context.ts';
import { OperationLock, type JobContext } from './jobs.ts';
import { formatBytes } from './operations.ts';

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    tag: { type: 'string', default: 'manual' },
    yes: { type: 'boolean', default: false },
    'no-safety-backup': { type: 'boolean', default: false },
  },
});

const [command, arg] = positionals;
const config = loadBaseConfig();
const services = createServices(config);
const lock = new OperationLock(config.DATA_DIR);

const ctx: JobContext = {
  log: (message) => console.log(`[${new Date().toLocaleTimeString('pt-BR')}] ${message}`),
  progress: () => undefined,
};

async function withLock(kind: string, work: () => Promise<void>): Promise<void> {
  const release = await lock.acquire(kind);
  try {
    await work();
  } finally {
    await release();
  }
}

async function main(): Promise<void> {
  switch (command) {
    case 'backup':
      await withLock('backup', async () => {
        await services.operations.backup(ctx, values.tag!);
      });
      break;

    case 'snapshots': {
      const snapshots = await services.restic.snapshots();
      if (snapshots.length === 0) {
        console.log('Nenhum snapshot encontrado.');
        break;
      }
      console.table(
        snapshots.map((s) => ({
          id: s.shortId,
          data: new Date(s.time).toLocaleString('pt-BR'),
          tags: s.tags.join(', '),
          tamanho: s.sizeBytes ? formatBytes(s.sizeBytes) : '-',
        })),
      );
      break;
    }

    case 'restore':
      if (!arg) throw new Error('Informe o snapshot: restore <id|latest>');
      if (!values.yes) throw new Error('Restore substitui o mundo atual. Confirme com --yes');
      await withLock('restore', () =>
        services.operations.restore(ctx, arg, { safetyBackup: !values['no-safety-backup'] }),
      );
      break;

    default:
      console.log('Uso: cli.ts backup [--tag x] | snapshots | restore <id|latest> --yes [--no-safety-backup]');
      process.exitCode = 1;
  }
}

main()
  .catch((err: Error) => {
    console.error(`ERRO: ${err.message}`);
    process.exitCode = 1;
  })
  .finally(() => services.rcon.close());
