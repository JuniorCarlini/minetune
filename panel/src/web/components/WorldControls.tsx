import { useState } from 'react';
import type { JobInfo } from '../../shared/api.ts';
import type { Messages } from '../../shared/i18n/index.ts';
import { settingOptions } from '../../shared/settings.ts';
import { worldBlockReason, type WorldInfo } from '../../shared/worlds.ts';
import { api } from '../lib/api.ts';
import { formatBytes } from '../lib/format.ts';
import { currentLocale, useMessages } from '../lib/i18n.tsx';
import { useWorld } from '../lib/world.tsx';
import { Icon } from './icons.tsx';
import { Notice } from './page.tsx';
import { Badge, Button, JobPanel, Modal, useToast } from './ui.tsx';
import './world-controls.css';

/** Tipos de mapa com o nome na língua escolhida (Normal, Large Biomes, Amplificado…). */
export const levelTypes = (m: Messages) => settingOptions('LEVEL_TYPE', m);
const SITE = 'https://juniorcarlini.github.io/minetune/';

/**
 * Mapa de seeds do site, na mesma língua do painel (/en/ e /es/ têm a página traduzida).
 * As 26.x usam a geração da versão principal (26.1.2 → 26.1).
 */
export function seedMapUrl(seed?: string, version?: string): string {
  const locale = currentLocale();
  const SEED_MAP = `${SITE}${locale === 'pt-BR' ? '' : `${locale}/`}mapa.html`;
  if (!seed) return SEED_MAP;
  const major = version?.match(/^26\.\d+/)?.[0];
  return `${SEED_MAP}#seed=${encodeURIComponent(seed)}${major ? `&v=${major}` : ''}`;
}

const titleCase = (text: string) => text.charAt(0) + text.slice(1).toLowerCase();

function describeWorld(world: WorldInfo, m: Messages): string {
  const server = world.serverVersion ? `${world.serverType ? `${titleCase(world.serverType)} ` : ''}${world.serverVersion}` : undefined;
  return [server, world.generated ? formatBytes(world.sizeBytes) : m.worlds.mapNotGenerated].filter(Boolean).join(' · ');
}

/**
 * Mundo na barra lateral: um botão com o mundo que as telas mostram, que abre a lista para
 * escolher outro. Escolher não liga nada; ligar é pela faixa "Ligar este mundo".
 */
export function WorldSwitcher() {
  const m = useMessages();
  const world = useWorld();
  const [open, setOpen] = useState(false);
  if (!world.ready || world.worlds.length === 0) return null;

  const choose = (folder: string) => {
    world.select(folder);
    setOpen(false);
  };

  const current = world.selectedWorld;

  return (
    <>
      {/* Mesma classe das seções do menu (Principal, Servidor): mesmo visual e some junto no celular. */}
      <span className="tuc-menu__section world-switcher-heading">{m.worlds.heading}</span>
      <button
        type="button"
        className="world-switcher"
        aria-haspopup="dialog"
        aria-label={m.worlds.switcherAria(current?.name ?? world.selected)}
        onClick={() => setOpen(true)}
      >
        <span className="world-switcher-icon">
          <Icon name="globe" />
        </span>
        <span className="world-switcher-text">
          <span className="world-switcher-name">{current?.name ?? world.selected}</span>
          <span className="world-switcher-state">
            <span className={`status-dot status-${world.isActive ? 'success' : 'warning'}`} />
            {/* Versão e tipo ficam no modal: na largura da barra lateral a linha cortava. */}
            <span className="world-switcher-state-text">{world.isActive ? m.worlds.stateOn : m.worlds.stateStored}</span>
          </span>
        </span>
        <span className="world-switcher-chevron">
          <Icon name="chevron" size={16} />
        </span>
      </button>

      <Modal
        open={open}
        title={m.worlds.chooseTitle}
        text={m.worlds.chooseText}
        onClose={() => setOpen(false)}
        footer={
          <>
            <a className="tuc-btn is-outline" href="#/worlds" onClick={() => setOpen(false)}>
              <Icon name="settings" /> {m.worlds.manage}
            </a>
            <Button
              variant="primary"
              onClick={() => {
                setOpen(false);
                window.location.hash = '#/worlds/novo';
              }}
            >
              <Icon name="plus" /> {m.worlds.createWorld}
            </Button>
          </>
        }
      >
        <div className="world-options" role="listbox" aria-label={m.worlds.title}>
          {world.worlds.map((item) => {
            const selected = item.folder === world.selected;
            return (
              <button
                key={item.folder}
                type="button"
                role="option"
                aria-selected={selected}
                className={`world-option ${selected ? 'is-selected' : ''}`}
                onClick={() => choose(item.folder)}
              >
                <span className="world-option-icon">
                  <Icon name="globe" size={28} />
                </span>
                <span className="world-option-text">
                  <strong>{item.name}</strong>
                  <span>{describeWorld(item, m)}</span>
                  {(item.active || !item.generated || item.mixedVersions) && (
                    <span className="world-option-badges">
                      {item.active && <Badge tone="success">{m.worlds.stateOn}</Badge>}
                      {!item.generated && <Badge>{m.worlds.newBadge}</Badge>}
                      {item.mixedVersions && <Badge tone="danger">{m.worlds.mixedShort}</Badge>}
                    </span>
                  )}
                </span>
                <span className="world-option-check" aria-hidden>
                  {selected && <Icon name="check" />}
                </span>
              </button>
            );
          })}
        </div>
      </Modal>
    </>
  );
}

/** Seed do mundo com copiar e abrir no mapa de seeds do site. */
export function SeedLine({ seed, version }: { seed: string; version?: string }) {
  const m = useMessages();
  const toast = useToast();
  const copy = () =>
    navigator.clipboard.writeText(seed).then(
      () => toast.success(m.worlds.seedCopied),
      () => toast.error(m.worlds.copyFailed),
    );
  return (
    <div className="world-seed">
      <span className="field-help">{m.worlds.seed}</span>
      <code>{seed}</code>
      <Button size="sm" onClick={copy}>
        <Icon name="copy" /> {m.common.copy}
      </Button>
      <a className="tuc-btn is-outline is-sm" href={seedMapUrl(seed, version)} target="_blank" rel="noreferrer">
        <Icon name="globe" /> {m.worlds.seedMapLink}
      </a>
    </div>
  );
}

/** Confirma e acompanha a troca do mundo ligado, com o motivo quando ele não pode ligar. */
export function ActivateWorldModal({ target, open, onClose }: { target?: WorldInfo; open: boolean; onClose: () => void }) {
  const m = useMessages();
  const world = useWorld();
  const [jobId, setJobId] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  const [starting, setStarting] = useState(false);
  const toast = useToast();

  const reason = target ? worldBlockReason(target, target.serverVersion ?? world.data?.serverVersion ?? 'LATEST', target.serverType, m) : null;
  const running = !!jobId && !finished;

  const close = () => {
    if (running) return;
    setJobId(null);
    setFinished(false);
    onClose();
  };

  const start = async () => {
    if (!target) return;
    setStarting(true);
    try {
      const { jobId } = await api.post<{ jobId: string }>('/worlds/activate', { folder: target.folder });
      setJobId(jobId);
    } catch (err) {
      toast.error(err);
    } finally {
      setStarting(false);
    }
  };

  const finish = (job: JobInfo) => {
    setFinished(true);
    if (job.status === 'succeeded' && target) {
      toast.success(m.worlds.isOn(target.name));
      // Um mundo que estava em mundos-guardados/ passa para a raiz com o mesmo nome.
      world.select(target.name);
    }
    void world.reload();
  };

  const openSettings = () => {
    if (target) world.select(target.folder);
    close();
    window.location.hash = '#/settings';
  };

  return (
    <Modal
      open={open && !!target}
      title={m.worlds.activateTitle}
      text={target ? [target.name, target.serverVersion && `${titleCase(target.serverType ?? '')} ${target.serverVersion}`.trim()].filter(Boolean).join(' · ') : undefined}
      tone={reason && !jobId ? 'danger' : 'default'}
      onClose={close}
      footer={
        jobId ? (
          <Button onClick={close} disabled={running}>
            {running ? m.common.wait : m.common.close}
          </Button>
        ) : reason ? (
          // Sem como ligar: em vez de um botão desativado, o caminho que resolve.
          <>
            <Button onClick={close}>
              <Icon name="x" /> {m.common.close}
            </Button>
            <Button variant="primary" onClick={openSettings}>
              <Icon name="settings" /> {m.worlds.openSettings}
            </Button>
          </>
        ) : (
          <>
            <Button onClick={close}>
              <Icon name="x" /> {m.common.cancel}
            </Button>
            <Button variant="primary" loading={starting} onClick={start}>
              <Icon name="play" /> {m.worlds.activateTitle}
            </Button>
          </>
        )
      }
    >
      <div className="world-activate">
        {jobId ? (
          <JobPanel jobId={jobId} onFinish={finish} />
        ) : reason ? (
          <Notice tone="danger" title={m.worlds.blockedTitle}>
            {reason}
          </Notice>
        ) : (
          <p>{m.worlds.activateText}</p>
        )}
      </div>
    </Modal>
  );
}
