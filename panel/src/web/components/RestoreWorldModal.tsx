import { useEffect, useState } from 'react';
import type { SnapshotInfo } from '../../shared/api.ts';
import type { BackupWorldsResponse } from '../../shared/archive.ts';
import { api } from '../lib/api.ts';
import { formatDateTime } from '../lib/format.ts';
import { useApi } from '../lib/hooks.ts';
import { useMessages } from '../lib/i18n.tsx';
import { Icon } from './icons.tsx';
import { EmptyState } from './page.tsx';
import { Button, Modal, Spinner, useToast } from './ui.tsx';

/**
 * Recuperar um mundo de uma cópia de segurança: lista os mundos que existiam nela e traz
 * só o escolhido, como mundo guardado com outro nome. Nada atual é apagado ou substituído.
 */
export function RestoreWorldModal({ snapshot, onClose, onStarted }: { snapshot?: SnapshotInfo; onClose: () => void; onStarted: (jobId: string) => void }) {
  const m = useMessages();
  const t = m.archive.ui;
  const { data, error, loading } = useApi<BackupWorldsResponse>(snapshot ? `/backups/${snapshot.id}/worlds` : null);
  const [selected, setSelected] = useState<string>();
  const [starting, setStarting] = useState(false);
  const toast = useToast();

  useEffect(() => setSelected(undefined), [snapshot]);

  const submit = async () => {
    if (!snapshot || !selected) return;
    setStarting(true);
    try {
      const { jobId } = await api.post<{ jobId: string }>(`/backups/${snapshot.id}/restore-world`, { folder: selected });
      onClose();
      onStarted(jobId);
    } catch (err) {
      toast.error(err);
    } finally {
      setStarting(false);
    }
  };

  const worlds = data?.snapshotId === snapshot?.id ? data?.worlds : undefined;

  return (
    <Modal
      open={!!snapshot}
      title={t.restoreWorldTitle}
      text={snapshot ? t.restoreWorldText(formatDateTime(snapshot.time)) : undefined}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>
            <Icon name="x" /> {m.common.cancel}
          </Button>
          <Button variant="primary" disabled={!selected} loading={starting} onClick={submit}>
            <Icon name="download" /> {t.restoreWorldSubmit}
          </Button>
        </>
      }
    >
      <div className="world-restore">
      {!worlds && loading ? (
        // Listar uma cópia leva alguns segundos: um só aviso de carregamento, com o que está acontecendo.
        <Spinner label={t.loadingWorlds} />
      ) : error ? (
        <EmptyState icon="backups" title={error.message} />
      ) : !worlds || worlds.length === 0 ? (
        <EmptyState icon="globe" title={t.noWorldsInBackup} />
      ) : (
        <div className="world-options" role="listbox" aria-label={t.restoreWorld}>
          {worlds.map((world) => {
            const isSelected = world.folder === selected;
            return (
              <button
                key={world.folder}
                type="button"
                role="option"
                aria-selected={isSelected}
                className={`world-option ${isSelected ? 'is-selected' : ''}`}
                onClick={() => setSelected(world.folder)}
              >
                <span className="world-option-icon">
                  <Icon name="globe" size={28} />
                </span>
                <span className="world-option-text">
                  <strong>{world.name}</strong>
                  {world.folder !== world.name && <span>{world.folder}</span>}
                </span>
                <span className="world-option-check" aria-hidden>
                  {isSelected && <Icon name="check" />}
                </span>
              </button>
            );
          })}
        </div>
      )}
      </div>
    </Modal>
  );
}
