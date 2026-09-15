import { useEffect, useState } from 'react';
import type { JobInfo } from '../../shared/api.ts';
import type { UploadAcceptedResponse } from '../../shared/archive.ts';
import type { Messages } from '../../shared/i18n/index.ts';
import { worldBlockReason, worldFolderFrom, worldNameError, worldNameInputError, type WorldInfo } from '../../shared/worlds.ts';
import { Icon } from '../components/icons.tsx';
import { ActionMenu, EmptyState, ListItem, ListView, Notice, Page } from '../components/page.tsx';
import { Badge, Button, Card, Input, JobPanel, Modal, useToast } from '../components/ui.tsx';
import { ActivateWorldModal, levelTypes, SeedLine } from '../components/WorldControls.tsx';
import { api, ApiError, uploadFile } from '../lib/api.ts';
import { formatBytes, timeAgo } from '../lib/format.ts';
import { useMessages } from '../lib/i18n.tsx';
import { useWorld } from '../lib/world.tsx';

/** Aviso ao terminar cada tarefa; recebe os textos para seguir a língua escolhida. */
const jobDone = (m: Messages): Partial<Record<JobInfo['kind'], string>> => ({
  'world-delete': m.worlds.deleted,
  'world-upload': m.archive.ui.uploaded,
});

const titleCase = (text: string) => text.charAt(0) + text.slice(1).toLowerCase();

function worldDetail(world: WorldInfo, m: Messages): string {
  const server = world.serverVersion ? `${world.serverType ? `${titleCase(world.serverType)} ` : ''}${world.serverVersion}` : undefined;
  const type = levelTypes(m).find((o) => o.value === world.levelType)?.label;
  return [server, type, world.generated ? formatBytes(world.sizeBytes) : m.worlds.mapNotGenerated, world.lastPlayed && m.worlds.played(timeAgo(world.lastPlayed))]
    .filter(Boolean)
    .join(' · ');
}

export function WorldsPage() {
  const m = useMessages();
  const world = useWorld();
  const { data } = world;
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobRunning, setJobRunning] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [activating, setActivating] = useState<WorldInfo>();
  const [renaming, setRenaming] = useState<WorldInfo>();
  const [deleting, setDeleting] = useState<WorldInfo>();
  const [uploading, setUploading] = useState(false);
  const toast = useToast();

  // O navegador baixa pelo próprio link (sessão no cookie); a página continua aberta.
  const download = (target: WorldInfo) => {
    toast.success(target.active ? `${m.archive.ui.downloadStarted} ${m.archive.ui.downloadActiveNote}` : m.archive.ui.downloadStarted);
    window.location.href = `/api/worlds/download?folder=${encodeURIComponent(target.folder)}`;
  };

  const active = data?.worlds.find((w) => w.active);
  const others = data?.worlds.filter((w) => !w.active) ?? [];
  const blocked = data ? others.flatMap((w) => worldBlockReason(w, w.serverVersion ?? data.serverVersion, w.serverType, m) ?? []) : [];

  // Mundo ligado ainda sem mapa (acabou de ser criado): confere de tempos em tempos até o servidor gerar.
  const generating = !!data?.serverRunning && !!active && !active.generated;
  useEffect(() => {
    if (!generating) return;
    const timer = setInterval(() => void world.reload(), 8_000);
    return () => clearInterval(timer);
  }, [generating, world]);

  const refresh = async () => {
    setRefreshing(true);
    await world.reload();
    setRefreshing(false);
  };

  const startJob = (id: string) => {
    setJobId(id);
    setJobRunning(true);
  };

  const configure = (target: WorldInfo) => {
    world.select(target.folder);
    window.location.hash = '#/settings';
  };

  const createButton = (
    <Button variant="primary" onClick={() => (window.location.hash = '#/worlds/novo')} disabled={jobRunning}>
      <Icon name="plus" /> {m.worlds.createWorld}
    </Button>
  );

  return (
    <>
      <Page
        title={m.worlds.title}
        description={m.worlds.description}
        actions={
          <>
            <Button onClick={refresh} loading={refreshing}>
              <Icon name="refresh" /> {m.common.refresh}
            </Button>
            <Button onClick={() => setUploading(true)} disabled={jobRunning}>
              <Icon name="upload" /> {m.archive.ui.upload}
            </Button>
            {createButton}
          </>
        }
        loading={!data}
      >
        {data && (
          <>
            {jobId && (
              <JobPanel
                jobId={jobId}
                onFinish={(job) => {
                  setJobRunning(false);
                  if (job.status === 'succeeded') {
                    toast.success(jobDone(m)[job.kind] ?? m.common.done);
                  }
                  void world.reload();
                }}
              />
            )}

            <Card title={m.worlds.activeNow}>
              {active ? (
                <>
                  <ListView label={m.worlds.activeListLabel}>
                    <ListItem
                      leading={<Icon name="globe" />}
                      title={active.name}
                      detail={worldDetail(active, m)}
                      badges={<Badge tone={data.serverRunning ? 'success' : 'neutral'}>{data.serverRunning ? m.worlds.running : m.worlds.serverOff}</Badge>}
                      actions={
                        <>
                          <Button size="sm" onClick={() => download(active)} disabled={!active.generated}>
                            <Icon name="download" /> {m.archive.ui.download}
                          </Button>
                          <Button size="sm" onClick={() => configure(active)}>
                            <Icon name="settings" /> {m.worlds.configure}
                          </Button>
                        </>
                      }
                    />
                  </ListView>
                  {active.seed && <SeedLine seed={active.seed} version={active.version} />}
                </>
              ) : (
                <EmptyState icon="globe" title={m.worlds.noMapYet(data.active)} text={generating ? m.worlds.generatingMap : m.worlds.generatedOnStart} />
              )}
            </Card>

            <Card title={m.worlds.stored} description={others.length > 0 ? m.worlds.storedCount(others.length) : undefined}>
              {blocked.length > 0 && (
                <Notice tone="warning" title={blocked.length === 1 ? m.worlds.oneBlocked : m.worlds.someBlocked}>
                  {blocked.join(' ')}
                </Notice>
              )}
              {others.length === 0 ? (
                <EmptyState icon="globe" title={m.worlds.noOtherTitle} text={m.worlds.noOtherText} action={createButton} />
              ) : (
                <ListView label={m.worlds.storedListLabel}>
                  {others.map((item) => {
                    const reason = worldBlockReason(item, item.serverVersion ?? data.serverVersion, item.serverType, m);
                    return (
                      <ListItem
                        key={item.folder}
                        leading={<Icon name="globe" />}
                        title={item.name}
                        detail={worldDetail(item, m)}
                        badges={
                          <>
                            {item.folder === world.selected && <Badge tone="info">{m.worlds.onScreen}</Badge>}
                            {!item.generated && <Badge>{m.worlds.newBadge}</Badge>}
                            {reason && (
                              <Badge tone={item.mixedVersions ? 'danger' : 'warning'}>
                                {item.mixedVersions ? m.worlds.mixedBadge : m.worlds.needsVersion(item.version ?? '')}
                              </Badge>
                            )}
                          </>
                        }
                        actions={
                          <>
                            <Button size="sm" onClick={() => configure(item)}>
                              <Icon name="settings" /> {m.worlds.configure}
                            </Button>
                            <Button size="sm" variant="primary" disabled={!!reason || jobRunning} onClick={() => setActivating(item)}>
                              <Icon name="play" /> {m.worlds.activate}
                            </Button>
                            <ActionMenu
                              items={[
                                { label: m.archive.ui.download, icon: 'download', onSelect: () => download(item), disabled: !item.generated },
                                { label: m.common.rename, icon: 'save', onSelect: () => setRenaming(item), disabled: jobRunning },
                                { label: m.common.delete, icon: 'trash', tone: 'danger', onSelect: () => setDeleting(item), disabled: jobRunning },
                              ]}
                            />
                          </>
                        }
                      />
                    );
                  })}
                </ListView>
              )}
            </Card>
          </>
        )}
      </Page>

      <ActivateWorldModal target={activating} open={!!activating} onClose={() => setActivating(undefined)} />
      <RenameWorldModal target={renaming} onClose={() => setRenaming(undefined)} />
      <DeleteWorldModal target={deleting} onClose={() => setDeleting(undefined)} onStarted={startJob} />
      <UploadWorldModal open={uploading} maxBytes={data?.uploadMaxBytes} onClose={() => setUploading(false)} onStarted={startJob} />
    </>
  );
}

/**
 * Enviar um mundo em .zip. A tela já barra o que dá para saber antes (extensão, tamanho, nome);
 * o servidor confere o conteúdo e, se recusar, a lista do que está errado aparece aqui.
 */
function UploadWorldModal({
  open,
  maxBytes,
  onClose,
  onStarted,
}: {
  open: boolean;
  maxBytes?: number;
  onClose: () => void;
  onStarted: (jobId: string) => void;
}) {
  const m = useMessages();
  const t = m.archive.ui;
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [progress, setProgress] = useState<number | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [serverNameError, setServerNameError] = useState<string>();
  const toast = useToast();

  const fileError = !file ? undefined : !/\.zip$/i.test(file.name) ? t.onlyZip : maxBytes && file.size > maxBytes ? t.fileTooLarge(maxBytes) : undefined;
  const nameError = (name.trim() ? (worldNameInputError(name, m) ?? worldNameError(worldFolderFrom(name), m)) : null) ?? serverNameError;
  const sending = progress !== null;

  const reset = () => {
    setFile(null);
    setName('');
    setProblems([]);
    setServerNameError(undefined);
  };

  const close = () => {
    if (sending) return;
    reset();
    onClose();
  };

  const submit = async () => {
    if (!file) return;
    setProblems([]);
    setServerNameError(undefined);
    setProgress(0);
    try {
      const query = name.trim() ? `?name=${encodeURIComponent(name.trim())}` : '';
      const result = await uploadFile<UploadAcceptedResponse>(`/worlds/upload${query}`, file, setProgress);
      reset();
      onClose();
      onStarted(result.jobId);
    } catch (err) {
      if (err instanceof ApiError && err.details?.length) setProblems(err.details);
      else if (err instanceof ApiError && err.fields?.name) setServerNameError(err.fields.name);
      else toast.error(err);
    } finally {
      setProgress(null);
    }
  };

  return (
    <Modal
      open={open}
      title={t.uploadTitle}
      text={t.uploadText}
      onClose={close}
      footer={
        <>
          <Button onClick={close} disabled={sending}>
            <Icon name="x" /> {m.common.cancel}
          </Button>
          <Button variant="primary" disabled={!file || !!fileError || !!nameError || sending} loading={sending} onClick={submit}>
            <Icon name="upload" /> {sending ? t.sending(Math.round((progress ?? 0) * 100)) : t.submit}
          </Button>
        </>
      }
    >
      <div className="world-upload">
        <ul className="world-upload-rules">
          {t.rules.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>

        <label className="field">
          <span className="field-label">{t.fileLabel}</span>
          <input
            className="tuc-input world-upload-file"
            type="file"
            accept=".zip,application/zip"
            disabled={sending}
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setProblems([]);
            }}
          />
          {fileError ? <span className="field-error">{fileError}</span> : maxBytes ? <span className="field-help">{t.maxSize(maxBytes)}</span> : null}
        </label>

        <label className="field">
          <span className="field-label">{t.nameLabel}</span>
          <Input
            value={name}
            invalid={!!nameError}
            disabled={sending}
            placeholder={file ? worldFolderFrom(file.name.replace(/\.zip$/i, '')) : ''}
            autoComplete="off"
            onChange={(e) => {
              setName(e.target.value);
              setServerNameError(undefined);
            }}
          />
          {nameError ? <span className="field-error">{nameError}</span> : <span className="field-help">{t.nameHelp}</span>}
        </label>

        {sending && <progress className="world-upload-progress" max={1} value={progress ?? 0} />}

        {problems.length > 0 && (
          <Notice tone="danger" title={t.rejectedTitle}>
            <ul className="world-upload-problems">
              {problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          </Notice>
        )}
      </div>
    </Modal>
  );
}

function fieldError(err: unknown): string | undefined {
  return err instanceof ApiError ? err.fields?.name : undefined;
}

function RenameWorldModal({ target, onClose }: { target?: WorldInfo; onClose: () => void }) {
  const m = useMessages();
  const world = useWorld();
  const [name, setName] = useState('');
  const [serverError, setServerError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  useEffect(() => {
    setName(target?.name ?? '');
    setServerError(undefined);
  }, [target]);

  const folder = worldFolderFrom(name);
  const shownError = (name.trim() ? (worldNameInputError(name, m) ?? worldNameError(folder, m)) : null) ?? serverError;

  const submit = async () => {
    if (!target) return;
    setSaving(true);
    try {
      const result = await api.post<{ folder: string }>('/worlds/rename', { folder: target.folder, name: folder });
      if (world.selected === target.folder) world.select(result.folder);
      toast.success(m.worlds.renamed);
      onClose();
      void world.reload();
    } catch (err) {
      const message = fieldError(err);
      if (message) setServerError(message);
      else toast.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={!!target}
      title={m.worlds.renameTitle}
      size="sm"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>
            <Icon name="x" /> {m.common.cancel}
          </Button>
          <Button variant="primary" disabled={!folder || !!shownError || folder === target?.name} loading={saving} onClick={submit}>
            <Icon name="save" /> {m.common.rename}
          </Button>
        </>
      }
    >
      <label className="field">
        <span className="field-label">{m.worlds.newName}</span>
        <Input value={name} invalid={!!shownError} onChange={(e) => setName(e.target.value)} autoComplete="off" />
        {shownError ? (
          <span className="field-error">{shownError}</span>
        ) : (
          folder &&
          folder !== name.trim() && (
            <span className="field-help">
              {m.worlds.willBe} <code>{folder}</code>
            </span>
          )
        )}
      </label>
    </Modal>
  );
}

function DeleteWorldModal({ target, onClose, onStarted }: { target?: WorldInfo; onClose: () => void; onStarted: (jobId: string) => void }) {
  const m = useMessages();
  const [confirmText, setConfirmText] = useState('');
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const close = () => {
    setConfirmText('');
    onClose();
  };

  const submit = async () => {
    if (!target) return;
    setSaving(true);
    try {
      const { jobId } = await api.post<{ jobId: string }>('/worlds/delete', { folder: target.folder, confirm: confirmText });
      close();
      onStarted(jobId);
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={!!target}
      title={target ? m.worlds.deleteTitle(target.name) : m.worlds.deleteTitleGeneric}
      text={m.worlds.deleteText}
      tone="danger"
      onClose={close}
      footer={
        <>
          <Button onClick={close}>
            <Icon name="x" /> {m.common.cancel}
          </Button>
          <Button variant="danger" disabled={!target || confirmText.trim() !== target.name} loading={saving} onClick={submit}>
            <Icon name="trash" /> {m.common.delete}
          </Button>
        </>
      }
    >
      <label className="field">
        <span className="field-label">
          {m.worlds.confirmBefore} <code>{target?.name}</code> {m.worlds.confirmAfter}
        </span>
        <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoComplete="off" />
      </label>
    </Modal>
  );
}
