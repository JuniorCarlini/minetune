import { useState } from 'react';
import type { BackupsResponse, SnapshotInfo } from '../../shared/api.ts';
import { PROVIDER_LABELS, describeInterval, describeRetention } from '../../shared/backup-destination.ts';
import { Icon } from '../components/icons.tsx';
import { Alert, Badge, Button, Card, CheckLabel, Empty, Input, JobPanel, Modal, PageHeader, Spinner, useToast } from '../components/ui.tsx';
import { api } from '../lib/api.ts';
import { formatBytes, formatDateTime, timeAgo } from '../lib/format.ts';
import { useApi } from '../lib/hooks.ts';

const TAG_LABELS: Record<string, string> = {
  manual: 'manual',
  'pre-restore': 'antes de restaurar',
  'pre-update': 'antes de atualizar',
  'pre-config-change': 'antes de mudar config',
};

export function BackupsPage() {
  const { data, error, loading, reload } = useApi<BackupsResponse>('/backups');
  const [jobId, setJobId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<SnapshotInfo>();
  const [confirmText, setConfirmText] = useState('');
  const [safetyBackup, setSafetyBackup] = useState(true);
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

  return (
    <>
      <PageHeader
        title="Backups"
        description="Snapshots incrementais e criptografados com restic. Agendados automaticamente e sob demanda."
        actions={
          <>
            <Button onClick={reload} loading={loading}>
              <Icon name="refresh" /> Atualizar
            </Button>
            <Button variant="primary" onClick={backupNow} loading={starting && !restoreTarget}>
              <Icon name="upload" /> Fazer backup agora
            </Button>
          </>
        }
      />

      {jobId && (
        <JobPanel
          jobId={jobId}
          onFinish={(job) => {
            if (job.status === 'succeeded') toast.success(job.kind === 'restore' ? 'Restauração concluída' : 'Backup concluído');
            void reload();
          }}
        />
      )}

      {error && <Alert tone="danger" title="Erro ao acessar o repositório">{error.message}</Alert>}
      {!data && !error && <Spinner />}

      {data && (
        <>
          <Card
            title="Destino"
            actions={
              <a className="tuc-btn is-outline is-sm" href="#/backups/destino">
                <Icon name="settings" /> Configurar
              </a>
            }
          >
            <dl className="details">
              <dt>Onde</dt>
              <dd>
                <Badge tone={data.provider === 'local' ? 'warning' : 'success'}>{PROVIDER_LABELS[data.provider]}</Badge>
              </dd>
              <dt>Repositório</dt>
              <dd>
                <code>{data.repository}</code>
              </dd>
              <dt>Frequência</dt>
              <dd>
                {describeInterval(data.schedule.interval)}
                {data.schedule.pauseIfNoPlayers && <span className="muted small"> · pula quando ninguém joga</span>}
              </dd>
              <dt>Retenção</dt>
              <dd>{describeRetention(data.schedule)}</dd>
              {data.schedule.uploadLimitMb > 0 && (
                <>
                  <dt>Upload</dt>
                  <dd>até {data.schedule.uploadLimitMb} MB/s</dd>
                </>
              )}
            </dl>
            {data.provider === 'local' && (
              <Alert tone="warning">
                <span className="row alert-row">
                  <span>Backups só neste disco: protegem contra erros e grief, mas não contra perda da máquina.</span>
                  <a className="tuc-btn is-primary is-sm" href="#/backups/destino">
                    <Icon name="upload" /> Guardar na nuvem
                  </a>
                </span>
              </Alert>
            )}
          </Card>

          <Card title={`Snapshots (${data.snapshots.length})`}>
            {data.snapshots.length === 0 ? (
              <Empty>Nenhum backup ainda.</Empty>
            ) : (
              <div className="tuc-table-wrap">
                <table className="tuc-table">
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Origem</th>
                      <th className="is-number">Tamanho</th>
                      <th>ID</th>
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
                            <Badge>agendado</Badge>
                          ) : (
                            s.tags.map((t) => (
                              <Badge key={t} tone="info">
                                {TAG_LABELS[t] ?? t}
                              </Badge>
                            ))
                          )}
                        </td>
                        <td className="is-number">{formatBytes(s.sizeBytes)}</td>
                        <td>
                          <code>{s.shortId}</code>
                        </td>
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

      <Modal
        open={!!restoreTarget}
        title="Restaurar backup"
        text={restoreTarget ? `Snapshot ${restoreTarget.shortId} de ${formatDateTime(restoreTarget.time)}` : undefined}
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
        <p>
          O servidor será <strong>parado</strong>, o mundo atual substituído pelo snapshot e o servidor iniciado novamente.
        </p>
        <CheckLabel checked={safetyBackup} onChange={setSafetyBackup}>
          Fazer backup do estado atual antes (recomendado)
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
