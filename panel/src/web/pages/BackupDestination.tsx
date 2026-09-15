import { useEffect, useMemo, useState } from 'react';
import type { BackupSettingsResponse, BackupTestResponse, BackupsResponse } from '../../shared/api.ts';
import {
  emptyDestination,
  intervalOptions,
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
import { useMessages } from '../lib/i18n.tsx';

/** Ícone de cada lugar; nome e nota vêm dos textos da língua escolhida (m.backups.providerChoices). */
const PROVIDERS: { id: BackupProvider; icon: IconName }[] = [
  { id: 'local', icon: 'save' },
  { id: 'r2', icon: 'upload' },
  { id: 's3', icon: 'globe' },
  { id: 's3-compatible', icon: 'memory' },
  { id: 'custom', icon: 'settings' },
];

type TestState = { status: 'idle' } | { status: 'testing' } | { status: 'done'; result: BackupTestResponse } | { status: 'error'; message: string };

/**
 * Onde guardar os backups, com que frequência e por quanto tempo.
 * Página própria porque junta lugar, credenciais, teste de conexão e agenda: é
 * configuração que a pessoa faz com calma, lendo os avisos.
 */
export function BackupDestinationPage() {
  const m = useMessages();
  const b = m.backups;
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
    () => (input ? { ...validateBackupSettings(input, { hasSecret: keepsSecret }, m), ...serverErrors } : {}),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [destination, schedule, secret, keepsSecret, serverErrors, m],
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
      toast.success(b.saved(res.initialized, res.restartedScheduler));
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
        crumbs={[{ label: b.title, href: '#/backups' }, { label: b.destCrumb }]}
        title={b.destTitle}
        description={b.destDescription}
        loading={!ready && !loadError}
        error={loadError}
        onRetry={load}
      >
        {ready && (
          <div className="destination-page">
            <Card title={b.place} description={b.placeDescription}>
              <div className="choice-grid" role="radiogroup" aria-label={b.placeAria}>
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
                    <strong>{b.providerChoices[p.id].label}</strong>
                    <span>{b.providerChoices[p.id].note}</span>
                  </button>
                ))}
              </div>
              {destination.provider === 'local' && (
                <Notice tone="warning">{b.localWarning}</Notice>
              )}
              {changedDestination && snapshotCount > 0 && (
                <Notice tone="info">{b.oldCopies(snapshotCount)}</Notice>
              )}
            </Card>

            {destination.provider !== 'local' && (
              <Card
                title={b.connection}
                description={credentials ? b.connectionS3 : b.connectionCustom}
                actions={
                  <Button size="sm" onClick={runTest} loading={test.status === 'testing'} disabled={hasErrors || saving}>
                    <Icon name="refresh" /> {b.test}
                  </Button>
                }
              >
                <div className="form-grid">
                  {destination.provider === 'r2' &&
                    field('accountId', b.accountId, { placeholder: b.accountIdPlaceholder, hint: b.accountIdHint })}
                  {destination.provider === 's3' && field('region', b.bucketRegion, { placeholder: 'sa-east-1' })}
                  {destination.provider === 's3-compatible' &&
                    field('endpoint', b.endpoint, { placeholder: 'http://192.168.0.50:9000', hint: b.endpointHint })}
                  {credentials && (
                    <>
                      {field('bucket', b.bucket, { placeholder: 'minetune-backups' })}
                      {field('prefix', b.prefix, { placeholder: b.prefixPlaceholder })}
                      {destination.provider === 's3-compatible' && field('region', b.regionOptional, { placeholder: 'us-east-1' })}
                      {field('accessKeyId', b.accessKey)}
                      <label className="field">
                        <span className="field-label">{b.secret}</span>
                        <Input
                          type="password"
                          value={secret}
                          invalid={!!errors.secretAccessKey}
                          autoComplete="new-password"
                          placeholder={keepsSecret ? b.secretKeepPlaceholder : ''}
                          onChange={(e) => {
                            setSecret(e.target.value);
                            setTest({ status: 'idle' });
                          }}
                        />
                        {errors.secretAccessKey ? (
                          <span className="field-error">{errors.secretAccessKey}</span>
                        ) : (
                          <span className="field-help">
                            {keepsSecret ? b.secretKeepHint : b.secretStoredHint}
                          </span>
                        )}
                      </label>
                    </>
                  )}
                  {destination.provider === 'custom' &&
                    field('repository', b.repository, { placeholder: b.repositoryPlaceholder, hint: b.repositoryHint })}
                </div>

                {test.status === 'idle' && <p className="muted small">{b.testHint}</p>}
                {test.status === 'done' && (
                  <Notice tone="success">
                    {test.result.status === 'ok' ? b.testOk : b.testEmpty}
                  </Notice>
                )}
                {test.status === 'error' && (
                  <Notice tone="danger" title={b.testFailedTitle}>
                    {test.message}
                  </Notice>
                )}
              </Card>
            )}

            <Card title={b.schedule} description={b.scheduleDescription}>
              <div className="form-grid">
                {/* div, não label: um <label> repassa o clique ao campo interno e o select do Tucano fecha logo após abrir. */}
                <div className="field">
                  <span className="field-label">{b.doBackup}</span>
                  <TucSelect
                    value={schedule!.interval}
                    options={
                      intervalOptions(m).some((o) => o.value === schedule!.interval)
                        ? intervalOptions(m)
                        : [...intervalOptions(m), { value: schedule!.interval, label: b.everyRaw(schedule!.interval) }]
                    }
                    placeholder={b.frequency}
                    onChange={(interval) => interval && updateSchedule({ interval })}
                  />
                </div>
                <label className="field">
                  <span className="field-label">{b.uploadLimit}</span>
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
                    <span className="field-help">{b.uploadHint}</span>
                  )}
                </label>
              </div>

              <div className="retention-grid">
                {(['keepLast', 'keepDaily', 'keepWeekly', 'keepMonthly'] as const).map((key) => (
                  <label key={key} className="field">
                    <span className="field-label">{b.retention[key].label}</span>
                    <Input
                      type="number"
                      min={0}
                      max={1000}
                      value={String(schedule![key])}
                      invalid={!!errors[key]}
                      onChange={(e) => updateSchedule({ [key]: Number(e.target.value) })}
                    />
                    <span className="field-help">{b.retention[key].hint}</span>
                  </label>
                ))}
              </div>
              {(errors.keepLast || errors.keepDaily || errors.keepWeekly || errors.keepMonthly) && (
                <span className="field-error">{errors.keepLast ?? errors.keepDaily ?? errors.keepWeekly ?? errors.keepMonthly}</span>
              )}

              <CheckLabel checked={schedule!.pauseIfNoPlayers} onChange={(pauseIfNoPlayers) => updateSchedule({ pauseIfNoPlayers })}>
                {b.pauseIfNoPlayers}
              </CheckLabel>
            </Card>
          </div>
        )}
      </Page>

      {dirty && (
        <div className="savebar">
          <span>{hasErrors ? b.savebarErrors : needsTest ? b.savebarNeedsTest : b.savebarDirty}</span>
          <div className="row">
            <Button variant="ghost" onClick={load} disabled={saving}>
              <Icon name="undo" /> {b.discard}
            </Button>
            <Button variant="primary" onClick={save} loading={saving} disabled={hasErrors || needsTest || test.status === 'testing'}>
              <Icon name="save" /> {m.common.save}
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
