import { useState } from 'react';
import type { BackupsResponse, SnapshotInfo } from '../../shared/api.ts';
import { describeInterval, describeRetention, providerLabel } from '../../shared/backup-destination.ts';
import { Icon } from '../components/icons.tsx';
import { EmptyState, Notice, Page, useAdvancedMode } from '../components/page.tsx';
import { RestoreWorldModal } from '../components/RestoreWorldModal.tsx';
import { Badge, Button, Card, CheckLabel, Input, JobPanel, Modal, useToast } from '../components/ui.tsx';
import { api } from '../lib/api.ts';
import { formatBytes, formatDateTime, timeAgo } from '../lib/format.ts';
import { useApi } from '../lib/hooks.ts';
import { useMessages } from '../lib/i18n.tsx';

export function BackupsPage() {
  const m = useMessages();
  const { data, error, loading, reload } = useApi<BackupsResponse>('/backups');
  const [jobId, setJobId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<SnapshotInfo>();
  const [worldTarget, setWorldTarget] = useState<SnapshotInfo>();
  const [confirmText, setConfirmText] = useState('');
  const [safetyBackup, setSafetyBackup] = useState(true);
  const [advanced] = useAdvancedMode();
  const toast = useToast();
  // A palavra de confirmação acompanha a língua; o servidor aceita a de qualquer uma.
  const confirmWord = m.backups.confirmWord;

  const backupNow = async () => {
    setStarting(true);
    try {
      const { jobId } = await api.post<{ jobId: string }>('/backups');
      setJobId(jobId);
    } catch (err) {
      toast.error(err);
    } finally {
      setStarting(false);
    }
  };

  const closeRestore = () => {
    setRestoreTarget(undefined);
    setConfirmText('');
  };

  const restore = async () => {
    if (!restoreTarget) return;
    setStarting(true);
    try {
      const { jobId } = await api.post<{ jobId: string }>(`/backups/${restoreTarget.id}/restore`, { confirm: confirmText, safetyBackup });
      closeRestore();
      setJobId(jobId);
    } catch (err) {
      toast.error(err);
    } finally {
      setStarting(false);
    }
  };

  const backupButton = (
    <Button variant="primary" onClick={backupNow} loading={starting && !restoreTarget}>
      <Icon name="upload" /> {m.backups.backupNow}
    </Button>
  );

  return (
    <>
      <Page
        title={m.backups.title}
        description={m.backups.description}
        actions={
          <>
            <Button onClick={reload} loading={loading && !!data}>
              <Icon name="refresh" /> {m.common.refresh}
            </Button>
            {backupButton}
          </>
        }
        loading={!data && !error}
        error={!data ? error?.message : undefined}
        onRetry={reload}
      >
        {data && (
          <>
            {data.provider === 'local' ? (
              <Notice
                tone="warning"
                title={m.backups.localTitle}
                action={
                  <a className="tuc-btn is-primary is-sm" href="#/backups/destino">
                    <Icon name="upload" /> {m.backups.toCloud}
                  </a>
                }
              >
                {m.backups.localText}
              </Notice>
            ) : (
              <Notice
                tone="success"
                title={m.backups.protectedTitle}
                action={
                  <a className="tuc-btn is-outline is-sm" href="#/backups/destino">
                    <Icon name="settings" /> {m.backups.whereToStore}
                  </a>
                }
              >
                {m.backups.summary(providerLabel(data.provider, m), describeInterval(data.schedule.interval, m), describeRetention(data.schedule, m))}
              </Notice>
            )}

            {jobId && (
              <JobPanel
                jobId={jobId}
                onFinish={(job) => {
                  if (job.status === 'succeeded') {
                    toast.success(job.kind === 'restore' ? m.backups.restoreDone : job.kind === 'world-restore' ? m.archive.ui.restoreWorldDone : m.backups.backupDone);
                  }
                  void reload();
                }}
              />
            )}

            <Card title={m.backups.copiesTitle} description={m.backups.copiesCount(data.snapshots.length)}>
              {data.snapshots.length === 0 ? (
                <EmptyState icon="backups" title={m.backups.emptyTitle} text={m.backups.emptyText} action={backupButton} />
              ) : (
                <div className="tuc-table-wrap">
                  <table className="tuc-table">
                    <thead>
                      <tr>
                        <th>{m.backups.colDate}</th>
                        <th>{m.backups.colType}</th>
                        <th className="is-number">{m.backups.colSize}</th>
                        {advanced && <th>{m.backups.colId}</th>}
                        <th className="tuc-table__actions">{m.backups.colActions}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.snapshots.map((s) => (
                        <tr key={s.id}>
                          <td>
                            <span className="tuc-table__user">
                              <span>
                                {formatDateTime(s.time)}
                                <span className="tuc-table__sub">{timeAgo(s.time)}</span>
                              </span>
                            </span>
                          </td>
                          <td>
                            {s.tags.length === 0 ? (
                              <Badge>{m.backups.automatic}</Badge>
                            ) : (
                              s.tags.map((t) => (
                                <Badge key={t} tone="info">
                                  {m.backups.tags[t] ?? t}
                                </Badge>
                              ))
                            )}
                          </td>
                          <td className="is-number">{formatBytes(s.sizeBytes)}</td>
                          {advanced && (
                            <td>
                              <code>{s.shortId}</code>
                            </td>
                          )}
                          <td className="tuc-table__actions">
                            <Button size="sm" onClick={() => setWorldTarget(s)}>
                              <Icon name="globe" /> {m.archive.ui.restoreWorld}
                            </Button>
                            <Button size="sm" onClick={() => setRestoreTarget(s)}>
                              <Icon name="download" /> {m.backups.restore}
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </>
        )}
      </Page>

      <RestoreWorldModal snapshot={worldTarget} onClose={() => setWorldTarget(undefined)} onStarted={setJobId} />

      <Modal
        open={!!restoreTarget}
        title={m.backups.restoreTitle}
        text={restoreTarget ? m.backups.restoreFrom(formatDateTime(restoreTarget.time)) : undefined}
        tone="danger"
        onClose={closeRestore}
        footer={
          <>
            <Button onClick={closeRestore}>
              <Icon name="x" /> {m.common.cancel}
            </Button>
            <Button variant="danger" disabled={confirmText !== confirmWord} loading={starting} onClick={restore}>
              <Icon name="download" /> {m.backups.restore}
            </Button>
          </>
        }
      >
        <p>{m.backups.restoreText}</p>
        <CheckLabel checked={safetyBackup} onChange={setSafetyBackup}>
          {m.backups.safetyBackup}
        </CheckLabel>
        <label className="field">
          <span className="field-label">
            {m.backups.typeBefore} <code>{confirmWord}</code> {m.backups.typeAfter}
          </span>
          <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoComplete="off" />
        </label>
      </Modal>
    </>
  );
}
