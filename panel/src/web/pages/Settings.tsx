import { useMemo, useState } from 'react';
import type { SaveSettingsResponse, SettingsResponse } from '../../shared/api.ts';
import {
  SETTING_GROUPS,
  SETTINGS,
  SETTINGS_BY_KEY,
  validateSetting,
  type SettingField,
  type SettingGroupId,
} from '../../shared/settings.ts';
import { Icon } from '../components/icons.tsx';
import { VersionPicker } from '../components/VersionPicker.tsx';
import { Alert, Button, Card, Input, JobPanel, Modal, PageHeader, Spinner, Toggle, TucSelect, useToast } from '../components/ui.tsx';
import { ApiError, api } from '../lib/api.ts';
import { formatBytes } from '../lib/format.ts';
import { useApi } from '../lib/hooks.ts';

type Apply = 'none' | 'restart' | 'backup-and-restart';

export function SettingsPage() {
  const { data, error, reload } = useApi<SettingsResponse>('/settings');
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [group, setGroup] = useState<SettingGroupId>('server');
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState<Apply>();
  const [jobId, setJobId] = useState<string | null>(null);
  const toast = useToast();

  const values = useMemo(() => ({ ...data?.values, ...draft }), [data, draft]);
  const dirty = useMemo(() => Object.keys(draft).filter((key) => (data?.values[key] ?? '') !== draft[key]), [data, draft]);
  const localErrors = useMemo(() => {
    const errors: Record<string, string> = {};
    for (const key of dirty) {
      const message = validateSetting(SETTINGS_BY_KEY.get(key)!, draft[key]!);
      if (message) errors[key] = message;
    }
    return errors;
  }, [dirty, draft]);
  const risky = dirty.map((key) => SETTINGS_BY_KEY.get(key)!).filter((field) => field.danger);

  if (error) return <Alert tone="danger" title="Erro ao carregar configurações">{error.message}</Alert>;
  if (!data) return <Spinner />;

  const isVisible = (field: SettingField) =>
    !field.visibleWhen || field.visibleWhen.values.includes((values[field.visibleWhen.key] ?? '').toUpperCase());

  const set = (key: string, value: string) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setServerErrors(({ [key]: _removed, ...rest }) => rest);
  };

  const save = async (apply: Apply) => {
    setSaving(apply);
    try {
      const changes = Object.fromEntries(dirty.map((key) => [key, draft[key]!]));
      const result = await api.put<SaveSettingsResponse>('/settings', { values: changes, apply });
      setDraft({});
      setConfirmOpen(false);
      await reload();
      if (result.jobId) setJobId(result.jobId);
      else toast.success(`${result.changed.length} configuração(ões) salva(s). Reinicie o servidor para aplicar.`);
    } catch (err) {
      if (err instanceof ApiError && err.fields) setServerErrors(err.fields);
      toast.error(err);
    } finally {
      setSaving(undefined);
    }
  };

  const requestSave = (apply: Apply) => {
    if (risky.length > 0) setConfirmOpen(true);
    else void save(apply);
  };

  const currentGroup = SETTING_GROUPS.find((g) => g.id === group)!;
  const fields = SETTINGS.filter((f) => f.group === group && isVisible(f));
  const changesByGroup = new Map<SettingGroupId, number>();
  for (const key of dirty) {
    const g = SETTINGS_BY_KEY.get(key)!.group;
    changesByGroup.set(g, (changesByGroup.get(g) ?? 0) + 1);
  }
  const hasErrors = Object.keys(localErrors).length > 0;

  return (
    <>
      <PageHeader title="Configurações" description="Salvas em config/server.env. Aplicadas quando o servidor reinicia." />

      {jobId && (
        <JobPanel
          jobId={jobId}
          onFinish={(job) => (job.status === 'succeeded' ? toast.success('Configurações aplicadas') : toast.error(job.error))}
        />
      )}

      {data.unmanaged.length > 0 && (
        <Alert tone="info">
          Variáveis extras no server.env, preservadas e editáveis só no arquivo: <code>{data.unmanaged.join(', ')}</code>
        </Alert>
      )}

      <div className="settings">
        <nav className="tuc-menu" aria-label="Grupos de configuração">
          <div className="tuc-menu__section">Grupos</div>
          {SETTING_GROUPS.map((g) => (
            <button key={g.id} type="button" className={`tuc-menu__item ${g.id === group ? 'is-active' : ''}`} onClick={() => setGroup(g.id)}>
              {g.label}
              {changesByGroup.has(g.id) && <span className="tuc-menu__count">{changesByGroup.get(g.id)}</span>}
            </button>
          ))}
        </nav>

        <Card title={currentGroup.label} description={currentGroup.description}>
          <div className="setting-rows">
            {fields.length === 0 && <p className="muted" style={{ padding: '1rem 1.25rem' }}>Nenhuma opção disponível para o software atual.</p>}
            {fields.map((field) => (
              <SettingInput
                key={field.key}
                field={field}
                value={values[field.key] ?? ''}
                dirty={dirty.includes(field.key)}
                error={localErrors[field.key] ?? serverErrors[field.key]}
                memoryLimit={field.key === 'MEMORY' ? data.memoryLimitBytes : undefined}
                serverType={values.TYPE ?? ''}
                savedValue={data.values[field.key] ?? ''}
                onChange={(value) => set(field.key, value)}
              />
            ))}
          </div>
        </Card>
      </div>

      {dirty.length > 0 && (
        <div className="savebar">
          <span>
            <strong>{dirty.length}</strong> alteração(ões) não salva(s)
          </span>
          <div className="row">
            <Button variant="ghost" onClick={() => setDraft({})} disabled={!!saving}>
              <Icon name="undo" /> Descartar
            </Button>
            <Button onClick={() => requestSave('none')} loading={saving === 'none'} disabled={hasErrors || !!saving}>
              <Icon name="save" /> Só salvar
            </Button>
            <Button variant="primary" onClick={() => requestSave('restart')} loading={saving === 'restart'} disabled={hasErrors || !!saving}>
              <Icon name="restart" /> Salvar e reiniciar
            </Button>
          </div>
        </div>
      )}

      <Modal
        open={confirmOpen}
        title="Confirmar alterações sensíveis"
        text="Recomendado: fazer um backup antes de reiniciar com essas mudanças."
        tone="warning"
        onClose={() => setConfirmOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
              <Icon name="x" /> Cancelar
            </Button>
            <Button onClick={() => save('none')} loading={saving === 'none'}>
              <Icon name="save" /> Só salvar
            </Button>
            <Button variant="primary" onClick={() => save('backup-and-restart')} loading={saving === 'backup-and-restart'}>
              <Icon name="upload" /> Backup, salvar e reiniciar
            </Button>
          </>
        }
      >
        <ul className="risk-list">
          {risky.map((field) => (
            <li key={field.key}>
              <strong>{field.label}</strong>: {data.values[field.key] || 'padrão'} → {draft[field.key] || 'padrão'}
              <p className="muted small">{field.danger}</p>
            </li>
          ))}
        </ul>
      </Modal>
    </>
  );
}

function SettingInput({
  field,
  value,
  dirty,
  error,
  memoryLimit,
  serverType,
  savedValue,
  onChange,
}: {
  field: SettingField;
  value: string;
  dirty: boolean;
  error?: string;
  memoryLimit?: number;
  serverType: string;
  savedValue: string;
  onChange: (value: string) => void;
}) {
  const id = `setting-${field.key}`;
  let control: React.ReactNode;

  switch (field.type) {
    case 'boolean':
      control = (
        <span className="row">
          {value === '' && <span className="muted small">padrão do servidor</span>}
          <Toggle label={field.label} checked={value === 'true'} onChange={(checked) => onChange(String(checked))} />
        </span>
      );
      break;
    case 'select':
      control = <TucSelect id={id} value={value} options={field.options!} placeholder="Padrão do servidor" onChange={onChange} />;
      break;
    case 'version':
      control = (
        <VersionPicker id={id} serverType={serverType} value={value} savedValue={savedValue} invalid={!!error} onChange={onChange} />
      );
      break;
    default:
      control = (
        <Input
          id={id}
          type={field.type === 'number' ? 'number' : 'text'}
          inputMode={field.type === 'number' ? 'numeric' : undefined}
          min={field.min}
          max={field.max}
          placeholder={field.placeholder ?? 'padrão do servidor'}
          value={value}
          invalid={!!error}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }

  return (
    <div className={`setting-row ${dirty ? 'dirty' : ''} ${error ? 'invalid' : ''}`}>
      <div className="setting-info">
        <div className="setting-title">
          <label htmlFor={id}>{field.label}</label>
          {field.danger && <span className="tuc-badge is-warning is-plain">sensível</span>}
          {dirty && <span className="tuc-badge is-info is-plain">alterado</span>}
        </div>
        {error ? (
          <span className="field-error">{error}</span>
        ) : (
          (field.help || memoryLimit) && (
            <span className="field-help">
              {field.help}
              {memoryLimit ? ` Limite atual do container: ${formatBytes(memoryLimit)}.` : ''}
            </span>
          )
        )}
        <code className="field-key">{field.key}</code>
      </div>
      <div className={`setting-control setting-control-${field.type}`}>{control}</div>
    </div>
  );
}
