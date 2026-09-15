import { useState } from 'react';
import type { JobInfo, SettingsResponse } from '../../shared/api.ts';
import { SETTINGS_BY_KEY, WORLD_BASE_KEYS, validateSetting } from '../../shared/settings.ts';
import { worldFolderFrom, worldNameError, worldNameInputError } from '../../shared/worlds.ts';
import { Icon } from '../components/icons.tsx';
import { Notice, Page } from '../components/page.tsx';
import { SettingBlock, SettingInput } from '../components/SettingInput.tsx';
import { Button, Card, CheckLabel, Input, JobPanel, TucSelect, useToast } from '../components/ui.tsx';
import { levelTypes, seedMapUrl } from '../components/WorldControls.tsx';
import { ApiError, api } from '../lib/api.ts';
import { useApi } from '../lib/hooks.ts';
import { useMessages } from '../lib/i18n.tsx';
import { useWorld } from '../lib/world.tsx';
import './CreateWorld.css';

const field = (key: (typeof WORLD_BASE_KEYS)[number]) => SETTINGS_BY_KEY.get(key)!;

/**
 * Criar mundo em tela própria: além de nome e seed, escolhe o que é difícil mudar depois
 * (versão, tipo de servidor, dificuldade, hardcore). O resto vem do mundo escolhido como base.
 */
export function CreateWorldPage() {
  const m = useMessages();
  const world = useWorld();
  const toast = useToast();
  // Plugins, convidados e o resto da configuração vêm do mundo na tela.
  const baseFolder = world.selected;
  const activeFolder = world.data?.active;
  const base = useApi<SettingsResponse>(
    world.ready ? (baseFolder === activeFolder ? '/settings' : `/settings?world=${encodeURIComponent(baseFolder)}`) : null,
  );

  const [name, setName] = useState('');
  const [seed, setSeed] = useState('');
  const [levelType, setLevelType] = useState('minecraft:normal');
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [activateNow, setActivateNow] = useState(false);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<{ folder: string; jobId?: string }>();
  const [job, setJob] = useState<JobInfo>();

  const values: Record<string, string> = {};
  for (const key of WORLD_BASE_KEYS) values[key] = draft[key] ?? base.data?.values[key] ?? '';

  const folder = worldFolderFrom(name);
  const nameError = (name.trim() ? (worldNameInputError(name, m) ?? worldNameError(folder, m)) : null) ?? serverErrors.name;
  const errors: Record<string, string | undefined> = {};
  for (const key of WORLD_BASE_KEYS) errors[key] = (draft[key] ? validateSetting(field(key), draft[key]) : null) ?? serverErrors[key];
  const hasErrors = !!nameError || WORLD_BASE_KEYS.some((key) => errors[key]);

  const set = (key: string, value: string) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setServerErrors(({ [key]: _removed, ...rest }) => rest);
  };

  const baseName = world.worlds.find((item) => item.folder === baseFolder)?.name ?? baseFolder;

  const submit = async () => {
    setSaving(true);
    setServerErrors({});
    try {
      const result = await api.post<{ jobId?: string; folder: string }>('/worlds', {
        name: folder,
        seed: seed.trim(),
        levelType,
        from: baseFolder,
        activate: activateNow,
        settings: values,
      });
      world.select(result.folder);
      void world.reload();
      if (result.jobId) {
        setCreated(result);
      } else {
        toast.success(m.worlds.created(result.folder));
        window.location.hash = '#/worlds';
      }
    } catch (err) {
      if (err instanceof ApiError && err.fields) setServerErrors(err.fields);
      toast.error(err);
    } finally {
      setSaving(false);
    }
  };

  const finish = (finished: JobInfo) => {
    setJob(finished);
    if (finished.status === 'succeeded') toast.success(m.worlds.createdAndOn);
    void world.reload();
  };

  const crumbs = [{ label: m.worlds.title, href: '#/worlds' }, { label: m.worlds.createWorld }];

  if (created?.jobId) {
    return (
      <Page title={m.worlds.creating(created.folder)} crumbs={crumbs}>
        <JobPanel jobId={created.jobId} onFinish={finish} />
        {job && (
          <div className="row">
            <a className="tuc-btn is-outline" href="#/worlds">
              <Icon name="globe" /> {m.worlds.viewWorlds}
            </a>
            {job.status === 'succeeded' && (
              <a className="tuc-btn is-primary" href="#/overview">
                <Icon name="arrowRight" /> {m.worlds.goHome}
              </a>
            )}
          </div>
        )}
      </Page>
    );
  }

  return (
    <Page
      title={m.worlds.createWorld}
      description={m.worlds.createDescription}
      crumbs={crumbs}
      loading={!base.data && !base.error}
      error={base.error?.message}
      onRetry={base.reload}
    >
      {base.data && (
        <>
          <Card title={m.worlds.cardNameMap} description={m.worlds.cardNameMapDesc}>
            <div className="settings-grid">
              <div className="settings-grid-wide">
                <SettingBlock label={m.worlds.nameLabel} htmlFor="create-name" help={m.worlds.nameHelp} error={nameError}>
                  <Input
                    id="create-name"
                    value={name}
                    invalid={!!nameError}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={m.worlds.namePlaceholder}
                    autoComplete="off"
                    autoFocus
                  />
                  {!nameError && folder && folder !== name.trim() && (
                    <span className="field-help">
                      {m.worlds.willBe} <code>{folder}</code>
                    </span>
                  )}
                </SettingBlock>
              </div>
              <SettingBlock label={m.worlds.seed} htmlFor="create-seed" help={m.worlds.seedHelp}>
                <Input id="create-seed" value={seed} onChange={(e) => setSeed(e.target.value)} placeholder={m.worlds.seedPlaceholder} autoComplete="off" />
                <span className="field-help">
                  <a href={seedMapUrl(seed.trim(), values.VERSION)} target="_blank" rel="noreferrer">
                    {m.worlds.seedMapLink}
                  </a>{' '}
                  {m.worlds.seedMapAfter}
                </span>
              </SettingBlock>
              <SettingBlock label={m.worlds.levelTypeLabel} htmlFor="create-level-type" help={m.worlds.levelTypeHelp}>
                <TucSelect
                  id="create-level-type"
                  value={levelType}
                  options={levelTypes(m)}
                  placeholder={m.worlds.levelTypePlaceholder}
                  clearable={false}
                  onChange={(v) => setLevelType(v || 'minecraft:normal')}
                />
              </SettingBlock>
              {(['GENERATE_STRUCTURES', 'ALLOW_NETHER'] as const).map((key) => (
                <SettingInput key={key} field={field(key)} value={values[key]!} error={errors[key]} serverType={values.TYPE!} onChange={(v) => set(key, v)} />
              ))}
            </div>
          </Card>

          <Card title={m.worlds.cardServer} description={m.worlds.cardServerDesc}>
            <div className="settings-grid">
              {(['TYPE', 'VERSION'] as const).map((key) => (
                <SettingInput key={key} field={field(key)} value={values[key]!} error={errors[key]} serverType={values.TYPE!} onChange={(v) => set(key, v)} />
              ))}
            </div>
          </Card>

          <Card title={m.worlds.cardGame} description={m.worlds.cardGameDesc}>
            <div className="settings-grid">
              {(['MODE', 'DIFFICULTY', 'HARDCORE', 'PVP'] as const).map((key) => (
                <SettingInput key={key} field={field(key)} value={values[key]!} error={errors[key]} serverType={values.TYPE!} onChange={(v) => set(key, v)} />
              ))}
            </div>
          </Card>

          {activateNow && world.data?.serverRunning && (
            <Notice tone="warning" title={m.worlds.restartTitle}>
              {m.worlds.restartText}
            </Notice>
          )}

          <div className="create-world-actions">
            <CheckLabel checked={activateNow} onChange={setActivateNow}>
              {m.worlds.activateOnCreate}
            </CheckLabel>
            <div className="row">
              <a className="tuc-btn is-ghost" href="#/worlds">
                <Icon name="x" /> {m.common.cancel}
              </a>
              <Button variant="primary" disabled={!folder || hasErrors} loading={saving} onClick={submit}>
                <Icon name={activateNow ? 'play' : 'plus'} /> {activateNow ? m.worlds.createAndActivate : m.worlds.createWorld}
              </Button>
            </div>
          </div>
          <p className="field-help create-world-base">{m.worlds.baseLine(baseName)}</p>
        </>
      )}
    </Page>
  );
}
