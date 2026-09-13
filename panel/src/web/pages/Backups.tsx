import { useState } from 'react';
import type { BackupsResponse, SnapshotInfo } from '../../shared/api.ts';
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
          <Card title="Destino">
            <dl className="details">
              <dt>Repositório</dt>
              <dd>
                <code>{data.repository}</code>
              </dd>
              <dt>Frequência</dt>
              <dd>{data.schedule.interval ? `a cada ${data.schedule.interval}` : '—'}</dd>
              <dt>Retenção</dt>
              <dd>
                <code>{data.schedule.retention || '—'}</code>
              </dd>
            </dl>
            {data.repository.startsWith('/') && (
              <Alert tone="warning">
                Repositório local: protege contra erros e corrupção, mas não contra perda do disco. Configure um destino S3/R2 no .env.
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
