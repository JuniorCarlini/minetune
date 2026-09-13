import { useEffect, useMemo, useState } from 'react';
import type { BackupSettingsResponse, BackupTestResponse } from '../../shared/api.ts';
import {
  INTERVAL_OPTIONS,
  PROVIDER_LABELS,
  emptyDestination,
  repositoryFor,
  usesS3Credentials,
  validateBackupSettings,
  type BackupDestination,
  type BackupProvider,
  type BackupSchedule,
} from '../../shared/backup-destination.ts';
import { ApiError, api } from '../lib/api.ts';
import { Icon, type IconName } from './icons.tsx';
import { Alert, Button, CheckLabel, Input, Modal, Spinner, TucSelect, useToast } from './ui.tsx';

const PROVIDERS: { id: BackupProvider; icon: IconName; note: string }[] = [
  { id: 'local', icon: 'save', note: 'Pasta ./backups nesta máquina' },
  { id: 'r2', icon: 'upload', note: 'Nuvem da Cloudflare, sem taxa de saída' },
  { id: 's3', icon: 'globe', note: 'Bucket na Amazon' },
  { id: 's3-compatible', icon: 'memory', note: 'RustFS, MinIO ou outro S3' },
  { id: 'custom', icon: 'settings', note: 'Repositório restic à mão' },
];

type TestState = { status: 'idle' } | { status: 'testing' } | { status: 'done'; result: BackupTestResponse } | { status: 'error'; message: string };

/**
 * Configuração do destino dos backups: onde guardar, com que frequência e por
 * quanto tempo. Testa a conexão antes de salvar e reinicia o agendador ao aplicar.
 */
export function BackupSettingsModal({
  open,
  snapshotCount,
  onClose,
  onSaved,
}: {
  open: boolean;
  snapshotCount: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [loaded, setLoaded] = useState<BackupSettingsResponse>();
  const [loadError, setLoadError] = useState<string>();
  const [destination, setDestination] = useState<BackupDestination>(emptyDestination());
  const [schedule, setSchedule] = useState<BackupSchedule>();
  const [secret, setSecret] = useState('');
  const [test, setTest] = useState<TestState>({ status: 'idle' });
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (!open) return;
    setLoaded(undefined);
    setLoadError(undefined);
    setSecret('');
    setTest({ status: 'idle' });
    setServerErrors({});
    api.get<BackupSettingsResponse>('/backups/settings').then(
      (res) => {
        setLoaded(res);
        setDestination(res.settings.destination);
        setSchedule(res.settings.schedule);
      },
      (err: Error) => setLoadError(err.message),
    );
  }, [open]);

  const input = schedule ? { destination, schedule, secretAccessKey: secret } : undefined;
  const keepsSecret = !!loaded?.hasSecret && destination.accessKeyId.trim() === loaded.settings.destination.accessKeyId;
  const errors = useMemo(
    () => (input ? { ...validateBackupSettings(input, { hasSecret: keepsSecret }), ...serverErrors } : {}),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [destination, schedule, secret, keepsSecret, serverErrors],
  );
  const hasErrors = Object.keys(errors).length > 0;
  const changedDestination = !!loaded && repositoryFor(destination) !== repositoryFor(loaded.settings.destination);

  const updateDestination = (patch: Partial<BackupDestination>) => {
    setDestination((d) => ({ ...d, ...patch }));
    setTest({ status: 'idle' });
    setServerErrors({});
  };
  const updateSchedule = (patch: Partial<BackupSchedule>) => setSchedule((s) => (s ? { ...s, ...patch } : s));

  const runTest = async () => {
    if (!input) return;
    setTest({ status: 'testing' });
    try {
      setTest({ status: 'done', result: await api.post<BackupTestResponse>('/backups/settings/test', input) });
    } catch (err) {
      if (err instanceof ApiError && err.fields) setServerErrors(err.fields);
      setTest({ status: 'error', message: (err as Error).message });
    }
  };

  const save = async () => {
    if (!input) return;
    setSaving(true);
    try {
      const res = await api.put<{ restartedScheduler: boolean; initialized: boolean }>('/backups/settings', input);
      toast.success(
        `Backups configurados${res.initialized ? ', repositório criado' : ''}${res.restartedScheduler ? ' e agendador reiniciado' : ''}.`,
      );
      onSaved();
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.fields) setServerErrors(err.fields);
      toast.error(err);
    } finally {
      setSaving(false);
    }
  };

  const field = (key: keyof BackupDestination, label: string, props: React.InputHTMLAttributes<HTMLInputElement> & { hint?: string } = {}) => {
    const { hint, ...rest } = props;
    return (
      <label className="field">
        <span className="field-label">{label}</span>
        <Input
          value={destination[key] as string}
          invalid={!!errors[key]}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => updateDestination({ [key]: e.target.value })}
          {...rest}
        />
        {errors[key] ? <span className="field-error">{errors[key]}</span> : hint && <span className="field-help">{hint}</span>}
      </label>
    );
  };

  return (
    <Modal
      open={open}
      title="Destino dos backups"
      text="Onde guardar, com que frequência e por quanto tempo. A senha de criptografia continua no .env."
      size="lg"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>
            <Icon name="x" /> Cancelar
          </Button>
          <Button onClick={runTest} loading={test.status === 'testing'} disabled={!input || hasErrors || saving}>
            <Icon name="refresh" /> Testar conexão
          </Button>
          <Button variant="primary" onClick={save} loading={saving} disabled={!input || hasErrors || test.status === 'testing'}>
            <Icon name="save" /> Salvar e aplicar
          </Button>
        </>
      }
    >
      {loadError && <Alert tone="danger">{loadError}</Alert>}
      {!loaded && !loadError && <Spinner />}

      {loaded && schedule && (
        <div className="backup-settings">
          <div className="field">
            <span className="field-label">Onde guardar</span>
            <div className="choice-grid" role="radiogroup" aria-label="Destino">
              {PROVIDERS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  role="radio"
                  aria-checked={destination.provider === p.id}
                  className={`choice ${destination.provider === p.id ? 'is-selected' : ''}`}
                  onClick={() => updateDestination({ ...emptyDestination(p.id), accessKeyId: destination.accessKeyId, bucket: destination.bucket })}
                >
                  <span className="choice-icon">
                    <Icon name={p.icon} />
                  </span>
                  <strong>{PROVIDER_LABELS[p.id]}</strong>
                  <span>{p.note}</span>
                </button>
              ))}
            </div>
          </div>

          {destination.provider === 'local' && (
            <Alert tone="warning">
              Protege contra erros, grief e mundo corrompido, mas não contra perda do disco ou da máquina. Para dados que importam, use a nuvem.
            </Alert>
          )}

          <div className="form-grid">
            {destination.provider === 'r2' && field('accountId', 'ID da conta (Account ID)', { placeholder: '32 caracteres', hint: 'Painel da Cloudflare → R2 → Account ID' })}
            {destination.provider === 's3' && field('region', 'Região do bucket', { placeholder: 'sa-east-1' })}
            {destination.provider === 's3-compatible' &&
              field('endpoint', 'Endereço do servidor', { placeholder: 'http://192.168.0.50:9000', hint: 'Com a stack RustFS local: http://rustfs:9000' })}
            {usesS3Credentials(destination.provider) && (
              <>
                {field('bucket', 'Bucket', { placeholder: 'minetune-backups' })}
                {field('prefix', 'Pasta no bucket (opcional)', { placeholder: 'servidor-principal' })}
                {destination.provider === 's3-compatible' && field('region', 'Região (opcional)', { placeholder: 'us-east-1' })}
                {field('accessKeyId', 'Chave de acesso (Access Key ID)')}
                <label className="field">
                  <span className="field-label">Segredo (Secret Access Key)</span>
                  <Input
                    type="password"
                    value={secret}
                    invalid={!!errors.secretAccessKey}
                    autoComplete="new-password"
                    placeholder={keepsSecret ? '•••••••• (mantém o atual)' : ''}
                    onChange={(e) => {
                      setSecret(e.target.value);
                      setTest({ status: 'idle' });
                    }}
                  />
                  {errors.secretAccessKey ? (
                    <span className="field-error">{errors.secretAccessKey}</span>
                  ) : (
                    <span className="field-help">{keepsSecret ? 'Deixe vazio para manter o segredo salvo.' : 'Guardado só neste servidor (config/backup.env, permissão 600).'}</span>
                  )}
                </label>
              </>
            )}
            {destination.provider === 'custom' &&
              field('repository', 'Repositório restic', { placeholder: 'sftp:usuario@host:/srv/backups', hint: 'Qualquer destino suportado pelo restic.' })}
          </div>

          {changedDestination && snapshotCount > 0 && (
            <Alert tone="info">
              Os {snapshotCount} backups atuais continuam no destino antigo. A lista passa a mostrar só os do novo destino; o primeiro backup
              lá é completo.
            </Alert>
          )}

          <div className="field">
            <span className="field-label">Frequência e retenção</span>
            <div className="form-grid">
              <label className="field">
                <span className="field-label">Fazer backup</span>
                <TucSelect
                  value={schedule.interval}
                  options={INTERVAL_OPTIONS.some((o) => o.value === schedule.interval) ? INTERVAL_OPTIONS : [...INTERVAL_OPTIONS, { value: schedule.interval, label: `A cada ${schedule.interval}` }]}
                  placeholder="Frequência"
                  onChange={(interval) => interval && updateSchedule({ interval })}
                />
              </label>
              <label className="field">
                <span className="field-label">Limite de upload (MB/s)</span>
                <Input
                  type="number"
                  min={0}
                  step={0.5}
                  value={String(schedule.uploadLimitMb)}
                  invalid={!!errors.uploadLimitMb}
                  onChange={(e) => updateSchedule({ uploadLimitMb: Number(e.target.value) })}
                />
                {errors.uploadLimitMb ? <span className="field-error">{errors.uploadLimitMb}</span> : <span className="field-help">0 = sem limite. Útil em internet de casa.</span>}
              </label>
            </div>
            <div className="retention-grid">
              {(
                [
                  ['keepLast', 'Últimos'],
                  ['keepDaily', 'Diários'],
                  ['keepWeekly', 'Semanais'],
                  ['keepMonthly', 'Mensais'],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="field">
                  <span className="field-label">{label}</span>
                  <Input type="number" min={0} max={1000} value={String(schedule[key])} invalid={!!errors[key]} onChange={(e) => updateSchedule({ [key]: Number(e.target.value) })} />
                </label>
              ))}
            </div>
            {(errors.keepLast || errors.keepDaily || errors.keepWeekly || errors.keepMonthly) && (
              <span className="field-error">{errors.keepLast ?? errors.keepDaily ?? errors.keepWeekly ?? errors.keepMonthly}</span>
            )}
            <span className="field-help">Quantos backups guardar de cada tipo. O restante é apagado após cada backup agendado.</span>
            <CheckLabel checked={schedule.pauseIfNoPlayers} onChange={(pauseIfNoPlayers) => updateSchedule({ pauseIfNoPlayers })}>
              Pular backups enquanto ninguém joga (o mundo não mudou)
            </CheckLabel>
          </div>

          {test.status === 'done' && (
            <Alert tone="success">
              {test.result.status === 'ok'
                ? 'Conexão ok: o destino já tem um repositório de backups com a senha atual.'
                : 'Conexão ok: destino vazio. O repositório será criado ao salvar.'}
            </Alert>
          )}
          {test.status === 'error' && <Alert tone="danger" title="Não foi possível usar este destino">{test.message}</Alert>}
        </div>
      )}
    </Modal>
  );
}
