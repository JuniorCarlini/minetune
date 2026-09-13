import { useEffect, useMemo, useState } from 'react';
import type { BackupSettingsResponse, BackupTestResponse, BackupsResponse } from '../../shared/api.ts';
import {
  INTERVAL_OPTIONS,
  emptyDestination,
  repositoryFor,
  usesS3Credentials,
  validateBackupSettings,
  type BackupDestination,
  type BackupProvider,
  type BackupSchedule,
} from '../../shared/backup-destination.ts';
import { Icon, type IconName } from '../components/icons.tsx';
import { Notice, Page } from '../components/page.tsx';
import { Button, Card, CheckLabel, Input, TucSelect, useToast } from '../components/ui.tsx';
import { ApiError, api } from '../lib/api.ts';
import { useApi } from '../lib/hooks.ts';

/** Rótulos da planta de telas, em palavras de quem usa (os nomes compartilhados continuam técnicos). */
const PROVIDERS: { id: BackupProvider; icon: IconName; label: string; note: string }[] = [
  { id: 'local', icon: 'save', label: 'Este computador', note: 'Não protege de falha no disco' },
  { id: 'r2', icon: 'upload', label: 'Cloudflare R2', note: 'Nuvem, recomendado' },
  { id: 's3', icon: 'globe', label: 'Amazon S3', note: 'Nuvem' },
  { id: 's3-compatible', icon: 'memory', label: 'Meu servidor S3', note: 'RustFS, MinIO' },
  { id: 'custom', icon: 'settings', label: 'Avançado', note: 'Repositório restic à mão' },
];

type TestState = { status: 'idle' } | { status: 'testing' } | { status: 'done'; result: BackupTestResponse } | { status: 'error'; message: string };

/**
 * Onde guardar os backups, com que frequência e por quanto tempo.
 * Página própria porque junta lugar, credenciais, teste de conexão e agenda: é
 * configuração que a pessoa faz com calma, lendo os avisos.
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
  // Destino novo fora deste computador só salva depois de um teste que deu certo.
  const needsTest = changedDestination && destination.provider !== 'local' && test.status !== 'done';
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
      window.location.hash = '#/backups';
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

  const credentials = usesS3Credentials(destination.provider);
  const ready = !!loaded && !!schedule;

  return (
    <>
      <Page
        crumbs={[{ label: 'Backups', href: '#/backups' }, { label: 'Onde guardar' }]}
        title="Onde guardar os backups"
        description="Escolha um lugar fora deste computador para não perder o mundo."
        loading={!ready && !loadError}
        error={loadError}
        onRetry={load}
      >
        {ready && (
          <div className="destination-page">
            <Card title="Lugar" description="Dá para trocar depois.">
              <div className="choice-grid" role="radiogroup" aria-label="Lugar dos backups">
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
                    <strong>{p.label}</strong>
                    <span>{p.note}</span>
                  </button>
                ))}
              </div>
              {destination.provider === 'local' && (
                <Notice tone="warning">
                  Protege contra erros, grief e mundo corrompido, mas não contra perda do disco ou da máquina. Para dados que importam, use a nuvem.
                </Notice>
              )}
              {changedDestination && snapshotCount > 0 && (
                <Notice tone="info">
                  As {snapshotCount} cópias atuais continuam no lugar antigo. A lista passa a mostrar só as do novo lugar; a primeira cópia lá é
                  completa.
                </Notice>
              )}
            </Card>

            {destination.provider !== 'local' && (
              <Card
                title="Conexão"
                description={credentials ? 'Dados do bucket e da chave de acesso criada no provedor.' : 'Qualquer destino suportado pelo restic.'}
                actions={
                  <Button size="sm" onClick={runTest} loading={test.status === 'testing'} disabled={hasErrors || saving}>
                    <Icon name="refresh" /> Testar
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
                      {field('bucket', 'Nome do bucket', { placeholder: 'minetune-backups' })}
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

                {test.status === 'idle' && <p className="muted small">Teste antes de salvar: o painel confere se o lugar responde e se já tem cópias.</p>}
                {test.status === 'done' && (
                  <Notice tone="success">
                    {test.result.status === 'ok'
                      ? 'Conexão ok: este lugar já tem cópias de segurança com a senha atual.'
                      : 'Conexão ok: lugar vazio. O repositório será criado ao salvar.'}
                  </Notice>
                )}
                {test.status === 'error' && (
                  <Notice tone="danger" title="Não deu para usar este lugar">
                    {test.message}
                  </Notice>
                )}
              </Card>
            )}

            <Card title="Frequência e retenção" description="Quando fazer backup e quantas cópias guardar. O restante é apagado após cada backup automático.">
              <div className="form-grid">
                {/* div, não label: um <label> repassa o clique ao campo interno e o select do Tucano fecha logo após abrir. */}
                <div className="field">
                  <span className="field-label">Fazer backup</span>
                  <TucSelect
                    value={schedule!.interval}
                    options={
                      INTERVAL_OPTIONS.some((o) => o.value === schedule!.interval)
                        ? INTERVAL_OPTIONS
                        : [...INTERVAL_OPTIONS, { value: schedule!.interval, label: `A cada ${schedule!.interval}` }]
                    }
                    placeholder="Frequência"
                    onChange={(interval) => interval && updateSchedule({ interval })}
                  />
                </div>
                <label className="field">
                  <span className="field-label">Limite de upload (MB/s)</span>
                  <Input
                    type="number"
                    min={0}
                    step={0.5}
                    value={String(schedule!.uploadLimitMb)}
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
                    ['keepLast', 'Últimas', 'mais recentes'],
                    ['keepDaily', 'Diárias', 'uma por dia'],
                    ['keepWeekly', 'Semanais', 'uma por semana'],
                    ['keepMonthly', 'Mensais', 'uma por mês'],
                  ] as const
                ).map(([key, label, hint]) => (
                  <label key={key} className="field">
                    <span className="field-label">{label}</span>
                    <Input
                      type="number"
                      min={0}
                      max={1000}
                      value={String(schedule![key])}
                      invalid={!!errors[key]}
                      onChange={(e) => updateSchedule({ [key]: Number(e.target.value) })}
                    />
                    <span className="field-help">{hint}</span>
                  </label>
                ))}
              </div>
              {(errors.keepLast || errors.keepDaily || errors.keepWeekly || errors.keepMonthly) && (
                <span className="field-error">{errors.keepLast ?? errors.keepDaily ?? errors.keepWeekly ?? errors.keepMonthly}</span>
              )}

              <CheckLabel checked={schedule!.pauseIfNoPlayers} onChange={(pauseIfNoPlayers) => updateSchedule({ pauseIfNoPlayers })}>
                Pular backups enquanto ninguém joga (o mundo não mudou)
              </CheckLabel>
            </Card>
          </div>
        )}
      </Page>

      {dirty && (
        <div className="savebar">
          <span>{hasErrors ? 'Corrija os campos marcados para salvar' : needsTest ? 'Teste a conexão para poder salvar' : 'Alterações não salvas'}</span>
          <div className="row">
            <Button variant="ghost" onClick={load} disabled={saving}>
              <Icon name="undo" /> Descartar
            </Button>
            <Button variant="primary" onClick={save} loading={saving} disabled={hasErrors || needsTest || test.status === 'testing'}>
              <Icon name="save" /> Salvar
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
