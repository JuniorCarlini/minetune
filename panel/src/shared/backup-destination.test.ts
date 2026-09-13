import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEFAULT_SCHEDULE,
  describeInterval,
  describeRetention,
  destinationFromRepository,
  emptyDestination,
  regionFor,
  repositoryFor,
  retentionArgs,
  scheduleFromEnv,
  validateBackupSettings,
  type BackupDestination,
} from './backup-destination.ts';

const ACCOUNT = '0123456789abcdef0123456789abcdef';

describe('repositório', () => {
  const cases: [string, BackupDestination][] = [
    ['/backups/restic', { ...emptyDestination('local') }],
    [`s3:https://${ACCOUNT}.r2.cloudflarestorage.com/meu-bucket`, { ...emptyDestination('r2'), accountId: ACCOUNT, bucket: 'meu-bucket' }],
    ['s3:s3.sa-east-1.amazonaws.com/meu-bucket/mundo', { ...emptyDestination('s3'), region: 'sa-east-1', bucket: 'meu-bucket', prefix: 'mundo' }],
    ['s3:http://192.168.0.50:9000/minetune-backups', { ...emptyDestination('s3-compatible'), endpoint: 'http://192.168.0.50:9000', bucket: 'minetune-backups' }],
    ['sftp:user@host:/srv/backups', { ...emptyDestination('custom'), repository: 'sftp:user@host:/srv/backups' }],
  ];

  for (const [repository, destination] of cases) {
    it(`monta e lê de volta ${destination.provider}`, () => {
      assert.equal(repositoryFor(destination), repository);
      const parsed = destinationFromRepository(repository, destination.region);
      assert.equal(parsed.provider, destination.provider);
      assert.equal(repositoryFor(parsed), repository);
    });
  }

  it('limpa barras do prefixo', () => {
    assert.equal(
      repositoryFor({ ...emptyDestination('r2'), accountId: ACCOUNT, bucket: 'b-1', prefix: '/servidor/mundo/' }),
      `s3:https://${ACCOUNT}.r2.cloudflarestorage.com/b-1/servidor/mundo`,
    );
  });

  it('usa a região certa por provedor', () => {
    assert.equal(regionFor({ ...emptyDestination('r2') }), 'auto');
    assert.equal(regionFor({ ...emptyDestination('s3'), region: 'us-east-1' }), 'us-east-1');
    assert.equal(regionFor({ ...emptyDestination('s3-compatible') }), 'us-east-1');
  });
});

describe('agenda e retenção', () => {
  it('converte a retenção nos dois sentidos', () => {
    const schedule = scheduleFromEnv({ interval: '12h', retention: '--keep-last 2 --keep-daily 5', uploadLimitKib: '2048' });
    assert.equal(schedule.keepLast, 2);
    assert.equal(schedule.keepDaily, 5);
    assert.equal(schedule.keepWeekly, 0);
    assert.equal(schedule.uploadLimitMb, 2);
    assert.equal(retentionArgs(schedule), '--keep-last 2 --keep-daily 5');
  });

  it('usa o padrão quando não há variáveis', () => {
    assert.deepEqual(scheduleFromEnv({}), DEFAULT_SCHEDULE);
  });

  it('descreve em português', () => {
    assert.equal(describeInterval('6h'), 'a cada 6 horas');
    assert.equal(describeInterval('90m'), 'a cada 90 minutos');
    assert.equal(describeRetention(DEFAULT_SCHEDULE), '4 últimos · 7 diários · 4 semanais · 6 mensais');
  });
});

describe('validação', () => {
  const r2 = (overrides: Partial<BackupDestination> = {}) => ({
    destination: { ...emptyDestination('r2'), accountId: ACCOUNT, bucket: 'meu-bucket', accessKeyId: 'AKIAEXEMPLO', ...overrides },
    schedule: { ...DEFAULT_SCHEDULE },
  });

  it('aceita um R2 completo', () => {
    assert.deepEqual(validateBackupSettings({ ...r2(), secretAccessKey: 'segredo-bem-longo' }, { hasSecret: false }), {});
  });

  it('mantém o segredo salvo quando o campo vem vazio', () => {
    assert.deepEqual(validateBackupSettings(r2(), { hasSecret: true }), {});
    assert.ok(validateBackupSettings(r2(), { hasSecret: false }).secretAccessKey);
  });

  it('aponta os campos errados', () => {
    const errors = validateBackupSettings({ ...r2({ accountId: '123', bucket: 'Bucket_Invalido' }), secretAccessKey: 'x'.repeat(20) }, { hasSecret: false });
    assert.ok(errors.accountId);
    assert.ok(errors.bucket);
  });

  it('exige pelo menos um backup na retenção', () => {
    const errors = validateBackupSettings(
      { destination: emptyDestination('local'), schedule: { ...DEFAULT_SCHEDULE, keepLast: 0, keepDaily: 0, keepWeekly: 0, keepMonthly: 0 } },
      { hasSecret: false },
    );
    assert.ok(errors.keepLast);
  });

  it('não pede credenciais para o disco local', () => {
    assert.deepEqual(validateBackupSettings({ destination: emptyDestination('local'), schedule: DEFAULT_SCHEDULE }, { hasSecret: false }), {});
  });
});
