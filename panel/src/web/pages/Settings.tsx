import { useEffect, useMemo, useState } from 'react';
import type { SaveSettingsResponse, SettingsResponse } from '../../shared/api.ts';
import { SETTING_GROUPS, SETTINGS, SETTINGS_BY_KEY, fieldText, validateSetting, type SettingField, type SettingGroupId } from '../../shared/settings.ts';
import { Icon } from '../components/icons.tsx';
import { EmptyState, Notice, Page } from '../components/page.tsx';
import { SettingInput } from '../components/SettingInput.tsx';
import { worldSettingsErrors } from '../../shared/worlds.ts';
import { Button, Card, JobPanel, Modal, SearchInput, useToast } from '../components/ui.tsx';
import { ApiError, api } from '../lib/api.ts';
import { useApi } from '../lib/hooks.ts';
import { useMessages } from '../lib/i18n.tsx';
import { useWorld } from '../lib/world.tsx';
import './Settings.css';

type Apply = 'none' | 'restart' | 'backup-and-restart';

// Em cada grupo, liga/desliga primeiro e os campos de preencher por último (igual Regras do jogo).
const byKind = (a: SettingField, b: SettingField) => Number(a.type !== 'boolean') - Number(b.type !== 'boolean');

export function SettingsPage() {
  const world = useWorld();
  const m = useMessages();
  const t = m.settings.page;
  const { data, error, reload } = useApi<SettingsResponse>(world.ready ? world.path('/settings') : null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  // Trocar de mundo no seletor descarta o que não foi salvo no anterior.
  useEffect(() => setDraft({}), [world.selected]);
  const [group, setGroup] = useState<SettingGroupId | 'all'>('all');
  const [search, setSearch] = useState('');
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState<Apply>();
  const [jobId, setJobId] = useState<string | null>(null);
  const toast = useToast();

  const values = useMemo(() => ({ ...data?.values, ...draft }), [data, draft]);
  const dirty = useMemo(() => Object.keys(draft).filter((key) => (data?.values[key] ?? '') !== draft[key]), [data, draft]);
  const selectedWorld = world.selectedWorld;
  const localErrors = useMemo(() => {
    // Tipo ou versão que não abrem este mapa aparecem no campo antes de salvar (ex.: mundo do Paper → NeoForge).
    const errors: Record<string, string> = selectedWorld && data ? worldSettingsErrors(selectedWorld, values, data.values, m) : {};
    for (const key of dirty) {
      const message = validateSetting(SETTINGS_BY_KEY.get(key)!, draft[key]!, m);
      if (message) errors[key] = message;
    }
    return errors;
  }, [dirty, draft, values, data, selectedWorld, m]);
  const risky = dirty.map((key) => SETTINGS_BY_KEY.get(key)!).filter((field) => field.danger);

  const set = (key: string, value: string) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setServerErrors(({ [key]: _removed, ...rest }) => rest);
  };

  const save = async (apply: Apply) => {
    setSaving(apply);
    try {
      const changes = Object.fromEntries(dirty.map((key) => [key, draft[key]!]));
      const result = await api.put<SaveSettingsResponse>(world.path('/settings'), { values: changes, apply });
      setDraft({});
      setConfirmOpen(false);
      await reload();
      if (result.jobId) setJobId(result.jobId);
      else if (!world.isActive) toast.success(t.savedStored);
      else toast.success(t.savedActive(result.changed.length));
      if (!world.isActive) void world.reload();
    } catch (err) {
      if (err instanceof ApiError && err.fields) setServerErrors(err.fields);
      toast.error(err);
    } finally {
      setSaving(undefined);
    }
  };

  const requestSave = (apply: Apply) => {
    // Mundo guardado não reinicia nada: o aviso de risco antes de reiniciar não se aplica.
    if (risky.length > 0 && world.isActive) setConfirmOpen(true);
    else void save(apply);
  };

  // Só esconde o que não vale para o tipo de servidor escolhido (ex.: Bedrock no Vanilla).
  const isApplicable = (field: SettingField) =>
    !field.visibleWhen || field.visibleWhen.values.includes((values[field.visibleWhen.key] ?? '').toUpperCase());

  // A busca olha o nome na língua da tela e o nome técnico, que é igual em todas.
  const term = search.trim().toLowerCase();
  const matching = SETTINGS.filter(
    (f) => isApplicable(f) && (!term || fieldText(f.key, m).label.toLowerCase().includes(term) || f.key.toLowerCase().includes(term)),
  );
  const groups = SETTING_GROUPS.map((g) => ({ ...g, ...m.settings.groups[g.id], fields: matching.filter((f) => f.group === g.id).sort(byKind) })).filter(
    (g) => g.fields.length > 0,
  );
  const shown = group === 'all' ? groups : groups.filter((g) => g.id === group);
  const changesIn = (id: SettingGroupId) => dirty.filter((key) => SETTINGS_BY_KEY.get(key)!.group === id).length;
  const hasErrors = Object.keys(localErrors).length > 0;

  return (
    <Page
      title={t.title}
      description={world.isActive ? t.descriptionActive : t.descriptionStored}
      loading={!data && !error}
      error={error?.message}
      onRetry={reload}
    >
      {data && (
        <>
          {jobId && <JobPanel jobId={jobId} onFinish={(job) => (job.status === 'succeeded' ? toast.success(t.applied) : toast.error(job.error))} />}

          {data.world?.inherited && (
            <Notice tone="info" title={t.inheritedTitle}>
              {t.inheritedText}
            </Notice>
          )}

          {data.unmanaged.length > 0 && (
            <Notice tone="info" title={t.unmanagedTitle}>
              {t.unmanagedText} <code>{data.unmanaged.join(', ')}</code>
            </Notice>
          )}

          {/* Busca e grupos em cima, como Regras do jogo; cada grupo vira um cartão. */}
          <div className="settings-filter">
            <div className="settings-filter-top">
              <SearchInput placeholder={t.search} value={search} onValueChange={setSearch} />
              <span className="muted small">{t.summary(matching.length, dirty.length)}</span>
            </div>
            <div className="chips" role="group" aria-label={t.groupsAria}>
              <button type="button" className={`chip ${group === 'all' ? 'is-active' : ''}`} aria-pressed={group === 'all'} onClick={() => setGroup('all')}>
                {t.all} <span className="chip-count">{matching.length}</span>
              </button>
              {groups.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  className={`chip ${group === g.id ? 'is-active' : ''} ${changesIn(g.id) ? 'has-changes' : ''}`}
                  aria-pressed={group === g.id}
                  onClick={() => setGroup(g.id)}
                >
                  {g.label} <span className="chip-count">{g.fields.length}</span>
                </button>
              ))}
            </div>
          </div>

          {shown.length === 0 ? (
            <Card>
              <EmptyState icon="search" title={t.emptyTitle} text={term ? t.emptyText(search) : undefined} />
            </Card>
          ) : (
            shown.map((g) => {
              const changes = changesIn(g.id);
              return (
                <Card key={g.id} title={g.label} description={changes ? t.groupChanges(g.description, changes) : g.description}>
                  <div className="settings-grid">
                    {g.fields.map((field) => (
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
              );
            })
          )}

          {dirty.length > 0 && (
            <div className="savebar">
              <span>
                <strong>{dirty.length}</strong> {t.changesWord(dirty.length)} · {world.isActive ? t.needsRestart : t.appliesWhenOn}
              </span>
              <div className="row">
                <Button variant="ghost" onClick={() => setDraft({})} disabled={!!saving}>
                  <Icon name="undo" /> {t.discard}
                </Button>
                {world.isActive ? (
                  <>
                    <Button onClick={() => requestSave('none')} loading={saving === 'none'} disabled={hasErrors || !!saving}>
                      <Icon name="save" /> {t.justSave}
                    </Button>
                    <Button variant="primary" onClick={() => requestSave('restart')} loading={saving === 'restart'} disabled={hasErrors || !!saving}>
                      <Icon name="restart" /> {t.saveAndRestart}
                    </Button>
                  </>
                ) : (
                  <Button variant="primary" onClick={() => requestSave('none')} loading={saving === 'none'} disabled={hasErrors || !!saving}>
                    <Icon name="save" /> {t.saveStored}
                  </Button>
                )}
              </div>
            </div>
          )}

          <Modal
            open={confirmOpen}
            title={t.riskTitle}
            text={t.riskText}
            tone="warning"
            onClose={() => setConfirmOpen(false)}
            footer={
              <>
                <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
                  <Icon name="x" /> {m.common.cancel}
                </Button>
                <Button onClick={() => save('none')} loading={saving === 'none'}>
                  <Icon name="save" /> {t.justSave}
                </Button>
                <Button variant="primary" onClick={() => save('backup-and-restart')} loading={saving === 'backup-and-restart'}>
                  <Icon name="upload" /> {t.backupSaveRestart}
                </Button>
              </>
            }
          >
            <ul className="risk-list">
              {risky.map((field) => {
                const text = fieldText(field.key, m);
                return (
                  <li key={field.key}>
                    <strong>{text.label}</strong>: {data.values[field.key] || t.defaultValue} → {draft[field.key] || t.defaultValue}
                    <p className="muted small">{text.danger}</p>
                  </li>
                );
              })}
            </ul>
          </Modal>
        </>
      )}
    </Page>
  );
}
