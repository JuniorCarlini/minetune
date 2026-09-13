import { useState } from 'react';
import type { BackupsResponse, SnapshotInfo } from '../../shared/api.ts';
import { PROVIDER_LABELS, describeInterval, describeRetention } from '../../shared/backup-destination.ts';
import { Icon } from '../components/icons.tsx';
import { EmptyState, Notice, Page, useAdvancedMode } from '../components/page.tsx';
import { Badge, Button, Card, CheckLabel, Input, JobPanel, Modal, useToast } from '../components/ui.tsx';
import { api } from '../lib/api.ts';
import { formatBytes, formatDateTime, timeAgo } from '../lib/format.ts';
import { useApi } from '../lib/hooks.ts';

/** Tags do restic em palavras de quem usa: de onde veio cada cópia. */
const TAG_LABELS: Record<string, string> = {
  manual: 'manual',
  'pre-restore': 'antes de restaurar',
  'pre-update': 'antes de atualizar',
  'pre-config-change': 'antes de mudar configuração',
};

export function BackupsPage() {
  const { data, error, loading, reload } = useApi<BackupsResponse>('/backups');
  const [jobId, setJobId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<SnapshotInfo>();
  const [confirmText, setConfirmText] = useState('');
  const [safetyBackup, setSafetyBackup] = useState(true);
  const [advanced] = useAdvancedMode();
  const toast = useToast();

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
      <Icon name="upload" /> Fazer backup agora
    </Button>
  );

  return (
    <>
      <Page
        title="Backups"
        description="Cópias do mundo para voltar no tempo se algo der errado."
        actions={
          <>
            <Button onClick={reload} loading={loading && !!data}>
              <Icon name="refresh" /> Atualizar
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
                title="Backups só neste computador"
                action={
                  <a className="tuc-btn is-primary is-sm" href="#/backups/destino">
                    <Icon name="upload" /> Guardar na nuvem
                  </a>
                }
              >
                Se o disco falhar, o mundo e os backups se perdem juntos.
              </Notice>
            ) : (
              <Notice
                tone="success"
                title="Protegido fora deste computador"
                action={
                  <a className="tuc-btn is-outline is-sm" href="#/backups/destino">
                    <Icon name="settings" /> Onde guardar
                  </a>
                }
              >
                {`${PROVIDER_LABELS[data.provider]} · ${describeInterval(data.schedule.interval)} · guarda ${describeRetention(data.schedule)}`}
              </Notice>
            )}

            {jobId && (
              <JobPanel
                jobId={jobId}
                onFinish={(job) => {
                  if (job.status === 'succeeded') toast.success(job.kind === 'restore' ? 'Restauração concluída' : 'Backup concluído');
                  void reload();
                }}
              />
            )}

            <Card title="Cópias de segurança" description={`${data.snapshots.length} ${data.snapshots.length === 1 ? 'cópia' : 'cópias'}`}>
              {data.snapshots.length === 0 ? (
                <EmptyState icon="backups" title="Nenhuma cópia ainda" text="A primeira cópia automática sai alguns minutos depois que o servidor liga." action={backupButton} />
              ) : (
                <div className="tuc-table-wrap">
                  <table className="tuc-table">
                    <thead>
                      <tr>
                        <th>Data</th>
                        <th>Tipo</th>
                        <th className="is-number">Tamanho</th>
                        {advanced && <th>ID</th>}
                        <th className="tuc-table__actions">Ações</th>
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
                              <Badge>automático</Badge>
                            ) : (
                              s.tags.map((t) => (
                                <Badge key={t} tone="info">
                                  {TAG_LABELS[t] ?? t}
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
                            <Button size="sm" onClick={() => setRestoreTarget(s)}>
                              <Icon name="download" /> Restaurar
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

      <Modal
        open={!!restoreTarget}
        title="Restaurar esta cópia"
        text={restoreTarget ? `Cópia de ${formatDateTime(restoreTarget.time)}` : undefined}
        tone="danger"
        onClose={closeRestore}
        footer={
          <>
            <Button onClick={closeRestore}>
              <Icon name="x" /> Cancelar
            </Button>
            <Button variant="danger" disabled={confirmText !== 'RESTAURAR'} loading={starting} onClick={restore}>
              <Icon name="download" /> Restaurar
            </Button>
          </>
        }
      >
        <p>O servidor desliga, o mundo atual é trocado por esta cópia e o servidor liga de novo.</p>
        <CheckLabel checked={safetyBackup} onChange={setSafetyBackup}>
          Fazer uma cópia do mundo atual antes (recomendado)
        </CheckLabel>
        <label className="field">
          <span className="field-label">
            Digite <code>RESTAURAR</code> para confirmar
          </span>
          <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoComplete="off" />
        </label>
      </Modal>
    </>
  );
}
