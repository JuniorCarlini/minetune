import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { DEFAULT_SCHEDULE, emptyDestination } from '../shared/backup-destination.ts';
import { BackupConfig, explainBackupError } from './backup-config.ts';
import type { BaseConfig } from './config.ts';

const base = {
  RESTIC_REPOSITORY: '/backups/restic',
  BACKUP_INTERVAL: '6h',
  BACKUP_RETENTION: '--keep-last 4 --keep-daily 7 --keep-weekly 4 --keep-monthly 6',
} as BaseConfig;

describe('explainBackupError', () => {
  // Mensagens reais do restic contra RustFS e contra um host inexistente.
  it('traduz credencial recusada, inclusive "Access Denied" com espaço', () => {
    assert.match(explainBackupError('Stat(<config/>) failed: Stat: Access Denied. Fatal: unable to open config file'), /recusou as credenciais/);
    assert.match(explainBackupError('api error AccessDenied: Access Denied'), /recusou as credenciais/);
  });

  it('traduz senha do repositório diferente', () => {
    assert.match(explainBackupError('Fatal: wrong password or no key found'), /outra senha/);
  });

  it('traduz falha de conexão', () => {
    assert.match(explainBackupError('Tempo esgotado ao conectar no destino'), /conectar ao endereço/);
    assert.match(explainBackupError('dial tcp: lookup nao-existe: no such host'), /conectar ao endereço/);
  });

  it('mantém mensagens desconhecidas como vieram', () => {
    assert.equal(explainBackupError('algo inesperado'), 'algo inesperado');
  });
});

describe('BackupConfig', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'minetune-backup-'));
  after(() => rm(dir, { recursive: true, force: true }));
  const env = { AWS_SECRET_ACCESS_KEY: '', AWS_ACCESS_KEY_ID: '' };

  it('usa o .env enquanto o painel não salvou nada', async () => {
    const config = new BackupConfig(dir, base, env);
    const { settings, managedByPanel } = await config.settings();
    assert.equal(managedByPanel, false);
    assert.equal(settings.destination.provider, 'local');
    assert.deepEqual(settings.schedule, DEFAULT_SCHEDULE);
  });

  it('grava com permissão 600 e mantém o segredo quando a chave não muda', async () => {
    const config = new BackupConfig(dir, base, env);
    const destination = { ...emptyDestination('s3-compatible'), endpoint: 'http://rustfs:9000', bucket: 'mundo', accessKeyId: 'chave-1' };
    await config.save(await config.candidate({ destination, schedule: DEFAULT_SCHEDULE, secretAccessKey: 'segredo-original' }));

    assert.equal((await stat(join(dir, 'backup.env'))).mode & 0o777, 0o600);
    const saved = await config.settings();
    assert.equal(saved.managedByPanel, true);
    assert.equal(saved.hasSecret, true);
    assert.equal(saved.settings.destination.bucket, 'mundo');

    const keep = await config.candidate({ destination, schedule: DEFAULT_SCHEDULE });
    assert.equal(keep.AWS_SECRET_ACCESS_KEY, 'segredo-original');

    const otherKey = await config.candidate({ destination: { ...destination, accessKeyId: 'chave-2' }, schedule: DEFAULT_SCHEDULE });
    assert.equal(otherKey.AWS_SECRET_ACCESS_KEY, '', 'chave nova não herda o segredo da chave antiga');
    assert.equal(await config.canKeepSecret({ destination: { ...destination, accessKeyId: 'chave-2' }, schedule: DEFAULT_SCHEDULE }), false);

    assert.match(await readFile(join(dir, 'backup.env'), 'utf8'), /RESTIC_REPOSITORY="s3:http:\/\/rustfs:9000\/mundo"/);
  });
});
