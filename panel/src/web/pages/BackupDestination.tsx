import { useEffect, useMemo, useState } from 'react';
import type { BackupSettingsResponse, BackupTestResponse, BackupsResponse } from '../../shared/api.ts';
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
import { Icon, type IconName } from '../components/icons.tsx';
import { Alert, Button, Card, CheckLabel, Input, PageHeader, Spinner, TucSelect, useToast } from '../components/ui.tsx';
import { ApiError, api } from '../lib/api.ts';
import { useApi } from '../lib/hooks.ts';

const PROVIDERS: { id: BackupProvider; icon: IconName; note: string }[] = [
  { id: 'local', icon: 'save', note: 'Pasta ./backups nesta máquina' },
  { id: 'r2', icon: 'upload', note: 'Nuvem da Cloudflare, sem taxa de saída' },
  { id: 's3', icon: 'globe', note: 'Bucket na Amazon' },
  { id: 's3-compatible', icon: 'memory', note: 'RustFS, MinIO ou outro S3' },
  { id: 'custom', icon: 'settings', note: 'Repositório restic à mão' },
];

type TestState = { status: 'idle' } | { status: 'testing' } | { status: 'done'; result: BackupTestResponse } | { status: 'error'; message: string };

const goBack = () => {
  window.location.hash = '#/backups';
};

/**
 * Destino dos backups: onde guardar, com que frequência e por quanto tempo.
 * Página própria (e não modal) porque junta provedor, credenciais, teste de
 * conexão e agenda: é configuração que a pessoa faz com calma, lendo os avisos.
 */
export function BackupDestinationPage() {
  const [loaded, setLoaded] = useState<BackupSettingsResponse>();
  const [loadError, setLoadError] = useState<string>();
  const [destination, setDestination] = useState<BackupDestination>(emptyDestination());
  const [schedule, setSchedule] = useState<BackupSchedule>();
  const [secret, setSecret] = useState('');
  const [test, setTest] = useState<TestState>({ status: 'idle' });
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  // Só para o aviso de troca de destino; a página não espera por isso.
  const backups = useApi<BackupsResponse>('/backups');
  const toast = useToast();

  const load = () => {
    setLoadError(undefined);
    api.get<BackupSettingsResponse>('/backups/settings').then(
      (res) => {
        setLoaded(res);
        setDestination(res.settings.destination);
        setSchedule(res.settings.schedule);
        setSecret('');
        setTest({ status: 'idle' });
        setServerErrors({});
      },
      (err: Error) => setLoadError(err.message),
    );
  };
  useEffect(load, []);

  const input = schedule ? { destination, schedule, secretAccessKey: secret } : undefined;
  const keepsSecret = !!loaded?.hasSecret && destination.accessKeyId.trim() === loaded.settings.destination.accessKeyId;
  const errors = useMemo(
    () => (input ? { ...validateBackupSettings(input, { hasSecret: keepsSecret }), ...serverErrors } : {}),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [destination, schedule, secret, keepsSecret, serverErrors],
  );
  const hasErrors = Object.keys(errors).length > 0;
  const dirty =
    !!loaded &&
    !!schedule &&
    (JSON.stringify(destination) !== JSON.stringify(loaded.settings.destination) ||
      JSON.stringify(schedule) !== JSON.stringify(loaded.settings.schedule) ||
      secret !== '');
  const changedDestination = !!loaded && repositoryFor(destination) !== repositoryFor(loaded.settings.destination);
  const snapshotCount = backups.data?.snapshots.length ?? 0;

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
      goBack();
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

  const header = (
    <PageHeader
      title="Destino dos backups"
      description="Onde guardar, com que frequência e por quanto tempo. A senha de criptografia continua no .env."
      actions={
        <Button onClick={goBack}>
          <Icon name="undo" /> Voltar para Backups
        </Button>
      }
    />
  );

  if (loadError) {
    return (
      <>
        {header}
        <Alert tone="danger" title="Não foi possível carregar a configuração">
          {loadError}
        </Alert>
      </>
    );
  }
  if (!loaded || !schedule) {
    return (
      <>
        {header}
        <Spinner />
      </>
    );
  }

  const credentials = usesS3Credentials(destination.provider);

  return (
    <>
      <nav className="breadcrumb" aria-label="Caminho">
        <a href="#/backups">Backups</a>
        <span aria-hidden>/</span>
        <span>Destino</span>
      </nav>
      {header}

      <div className="destination-page">
        <Card title="Onde guardar" description="Escolha o lugar dos backups. Dá para trocar depois.">
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
          {destination.provider === 'local' && (
            <Alert tone="warning">
              Protege contra erros, grief e mundo corrompido, mas não contra perda do disco ou da máquina. Para dados que importam, use a nuvem.
            </Alert>
          )}
          {changedDestination && snapshotCount > 0 && (
            <Alert tone="info">
              Os {snapshotCount} backups atuais continuam no destino antigo. A lista passa a mostrar só os do novo destino; o primeiro backup lá é
              completo.
            </Alert>
          )}
        </Card>

        {destination.provider !== 'local' && (
          <Card
            title="Conexão"
            description={credentials ? 'Dados do bucket e da chave de acesso criada no provedor.' : 'Qualquer destino suportado pelo restic.'}
            actions={
              <Button size="sm" onClick={runTest} loading={test.status === 'testing'} disabled={hasErrors || saving}>
                <Icon name="refresh" /> Testar conexão
              </Button>
            }
          >
            <div className="form-grid">
              {destination.provider === 'r2' &&
                field('accountId', 'ID da conta (Account ID)', { placeholder: '32 caracteres', hint: 'Painel da Cloudflare → R2 → Account ID' })}
              {destination.provider === 's3' && field('region', 'Região do bucket', { placeholder: 'sa-east-1' })}
              {destination.provider === 's3-compatible' &&
                field('endpoint', 'Endereço do servidor', { placeholder: 'http://192.168.0.50:9000', hint: 'Com a stack RustFS local: http://rustfs:9000' })}
              {credentials && (
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
                      <span className="field-help">
                        {keepsSecret ? 'Deixe vazio para manter o segredo salvo.' : 'Guardado só neste servidor (config/backup.env, permissão 600).'}
                      </span>
                    )}
                  </label>
                </>
              )}
              {destination.provider === 'custom' &&
                field('repository', 'Repositório restic', { placeholder: 'sftp:usuario@host:/srv/backups', hint: 'Ex.: sftp:, rest:, b2:, azure:, gs:' })}
            </div>

            {test.status === 'idle' && <p className="muted small">Teste antes de salvar: o painel confere se o destino responde e se já tem backups.</p>}
            {test.status === 'done' && (
              <Alert tone="success">
                {test.result.status === 'ok'
                  ? 'Conexão ok: o destino já tem um repositório de backups com a senha atual.'
                  : 'Conexão ok: destino vazio. O repositório será criado ao salvar.'}
              </Alert>
            )}
            {test.status === 'error' && (
              <Alert tone="danger" title="Não foi possível usar este destino">
                {test.message}
              </Alert>
            )}
          </Card>
        )}

        <Card title="Frequência e retenção" description="Quando fazer backup e quantos guardar. O restante é apagado após cada backup agendado.">
          <div className="form-grid">
            <label className="field">
              <span className="field-label">Fazer backup</span>
              <TucSelect
                value={schedule.interval}
                options={
                  INTERVAL_OPTIONS.some((o) => o.value === schedule.interval)
                    ? INTERVAL_OPTIONS
                    : [...INTERVAL_OPTIONS, { value: schedule.interval, label: `A cada ${schedule.interval}` }]
                }
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
              {errors.uploadLimitMb ? (
                <span className="field-error">{errors.uploadLimitMb}</span>
              ) : (
                <span className="field-help">0 = sem limite. Útil em internet de casa.</span>
              )}
            </label>
          </div>

          <div className="retention-grid">
            {(
              [
                ['keepLast', 'Últimos', 'mais recentes'],
                ['keepDaily', 'Diários', 'um por dia'],
                ['keepWeekly', 'Semanais', 'um por semana'],
                ['keepMonthly', 'Mensais', 'um por mês'],
              ] as const
            ).map(([key, label, hint]) => (
              <label key={key} className="field">
                <span className="field-label">{label}</span>
                <Input type="number" min={0} max={1000} value={String(schedule[key])} invalid={!!errors[key]} onChange={(e) => updateSchedule({ [key]: Number(e.target.value) })} />
                <span className="field-help">{hint}</span>
              </label>
            ))}
          </div>
          {(errors.keepLast || errors.keepDaily || errors.keepWeekly || errors.keepMonthly) && (
            <span className="field-error">{errors.keepLast ?? errors.keepDaily ?? errors.keepWeekly ?? errors.keepMonthly}</span>
          )}

          <CheckLabel checked={schedule.pauseIfNoPlayers} onChange={(pauseIfNoPlayers) => updateSchedule({ pauseIfNoPlayers })}>
            Pular backups enquanto ninguém joga (o mundo não mudou)
          </CheckLabel>
        </Card>
      </div>

      {dirty && (
        <div className="savebar">
          <span>
            {hasErrors ? 'Corrija os campos marcados para salvar' : changedDestination && destination.provider !== 'local' && test.status !== 'done' ? 'Destino alterado: teste a conexão antes de salvar' : 'Alterações não salvas'}
          </span>
          <div className="row">
            <Button variant="ghost" onClick={load} disabled={saving}>
              <Icon name="undo" /> Descartar
            </Button>
            <Button variant="primary" onClick={save} loading={saving} disabled={hasErrors || test.status === 'testing'}>
              <Icon name="save" /> Salvar e aplicar
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
