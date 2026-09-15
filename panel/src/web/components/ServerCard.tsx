import { useState } from 'react';
import type { StatusResponse } from '../../shared/api.ts';
import { PT, type Messages } from '../../shared/i18n/index.ts';
import { settingOptions } from '../../shared/settings.ts';
import { api } from '../lib/api.ts';
import { timeAgo } from '../lib/format.ts';
import { useApi } from '../lib/hooks.ts';
import { useMessages } from '../lib/i18n.tsx';
import { useWorld } from '../lib/world.tsx';
import { Icon } from './icons.tsx';
import { Button, Modal, useToast } from './ui.tsx';
import { ActivateWorldModal } from './WorldControls.tsx';
import './server-card.css';

/** Só o nome do software ("Paper"), sem a explicação que vem depois do travessão na opção. */
export const serverTypeLabel = (type?: string, m: Messages = PT) =>
  settingOptions('TYPE', m)
    .find((o) => o.value === type)
    ?.label.split(' —')[0] ?? type ?? '';

/**
 * Card fixo no topo de todas as telas: o que o servidor (a máquina) está fazendo agora.
 * Fica separado do mundo da tela: é o único lugar que liga, desliga e reinicia o servidor,
 * e diz com clareza quando ele está rodando outro mundo.
 */
export function ServerCard({ variant = 'compact' }: { variant?: 'compact' | 'hero' }) {
  const world = useWorld();
  const m = useMessages();
  const t = m.home;
  const { data, reload } = useApi<StatusResponse>('/status', 5000);
  const [busy, setBusy] = useState<string>();
  const [confirmStop, setConfirmStop] = useState(false);
  const [activating, setActivating] = useState(false);
  const toast = useToast();

  if (!data || !world.ready) return null;

  const { server } = data;
  const running = server.state === 'running';
  const here = world.isActive;
  const runningName = world.worlds.find((w) => w.active)?.name ?? data.world ?? world.active;
  const online = data.players?.online ?? 0;

  const act = async (action: 'start' | 'stop' | 'restart') => {
    setBusy(action);
    try {
      await api.post(`/server/${action}`);
      toast.success(action === 'start' ? t.toastStarting : action === 'stop' ? t.toastStopped : t.toastRestarting);
      setConfirmStop(false);
      await reload();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(undefined);
    }
  };

  // "restarting" é o servidor caindo ao ligar e tentando de novo: é problema, não "reiniciando".
  const crashing = server.state === 'restarting';
  const problem = server.state === 'missing' || crashing || (running && server.health === 'unhealthy');
  const dotTone = problem ? 'danger' : !running ? 'neutral' : server.health === 'starting' ? 'warning' : 'success';
  const cardTone = problem ? 'problem' : !here ? 'other' : running ? 'here' : 'stopped';

  let title: string;
  if (server.state === 'missing') title = t.titleMissing;
  else if (!running) title = crashing ? t.titleCrashing : t.titleStopped;
  else if (!here) title = t.titleOtherWorld(runningName);
  else if (server.health === 'starting') title = t.titleStarting;
  else if (server.health === 'unhealthy') title = t.titleUnhealthy;
  else title = t.titleRunning;

  const details = [
    !running && runningName ? t.lastWorld(runningName) : null,
    running && data.players ? t.playingOf(online, data.players.max) : null,
    running && server.startedAt ? t.startedAgo(timeAgo(server.startedAt)) : null,
    `${serverTypeLabel(data.game.type, m)} ${data.game.version}`,
  ]
    .filter(Boolean)
    .join(' · ');

  const selectedName = world.selectedWorld?.name ?? world.selected;
  const modals = (
    <>
      <Modal
        open={confirmStop}
        title={t.stopTitle}
        text={t.stopText}
        tone="danger"
        size="sm"
        onClose={() => setConfirmStop(false)}
        footer={
          <>
            <Button onClick={() => setConfirmStop(false)}>
              <Icon name="x" /> {m.common.cancel}
            </Button>
            <Button variant="danger" onClick={() => act('stop')} loading={busy === 'stop'}>
              <Icon name="stop" /> {t.stop}
            </Button>
          </>
        }
      />
      <ActivateWorldModal target={world.selectedWorld} open={activating} onClose={() => setActivating(false)} />
    </>
  );

  // Bloco grande do Início, como era antes: frase de estado e botões grandes, agora dita para o mundo da tela.
  if (variant === 'hero') {
    const heroTone = problem ? 'danger' : !here ? 'warning' : !running ? 'neutral' : server.health === 'starting' ? 'warning' : 'success';
    let heroTitle: string;
    if (!here) heroTitle = t.heroStored;
    else if (server.state === 'missing') heroTitle = t.titleMissing;
    else if (!running) heroTitle = crashing ? t.titleCrashing : t.titleStopped;
    else if (server.health === 'starting') heroTitle = t.heroStarting;
    else if (server.health === 'unhealthy') heroTitle = t.heroUnhealthy;
    else heroTitle = t.heroOn;

    const heroLine = here
      ? [
          selectedName,
          running && data.players ? t.peoplePlaying(online) : null,
          running && server.startedAt ? t.startedAgo(timeAgo(server.startedAt)) : null,
          `${serverTypeLabel(data.game.type, m)} ${data.game.version}`,
        ]
      : [
          selectedName,
          running ? t.otherRunning(runningName) : t.otherStopped(runningName),
          running && data.players ? t.playingThere(online, data.players.max) : null,
        ];

    return (
      <>
        <section className={`hero hero-${heroTone}`}>
          <div className="hero-main">
            <div className="hero-status">
              <span className={`status-dot status-${here ? dotTone : 'warning'}`} />
              <span className="home-hero-line">{heroLine.filter(Boolean).join(' · ')}</span>
            </div>
            <h1 className="hero-title">{heroTitle}</h1>
          </div>

          <div className="hero-actions">
            {!here ? (
              <>
                <Button size="lg" onClick={() => world.select(world.active)}>
                  <Icon name="arrowRight" /> {t.goTo(runningName)}
                </Button>
                <Button size="lg" variant="primary" onClick={() => setActivating(true)}>
                  <Icon name="play" /> {t.activateWorld}
                </Button>
              </>
            ) : running ? (
              <>
                <Button variant="danger" onClick={() => setConfirmStop(true)} disabled={!!busy}>
                  <Icon name="stop" /> {t.stop}
                </Button>
                <Button variant="primary" onClick={() => act('restart')} loading={busy === 'restart'} disabled={!!busy}>
                  <Icon name="restart" /> {t.restart}
                </Button>
              </>
            ) : crashing ? (
              // Em vez de "Ligar" desativado: ver o erro e parar as tentativas.
              <>
                <Button variant="danger" onClick={() => setConfirmStop(true)} disabled={!!busy}>
                  <Icon name="stop" /> {t.stop}
                </Button>
                <Button size="lg" variant="primary" onClick={() => (window.location.hash = '#/console')}>
                  <Icon name="console" /> {t.openConsole}
                </Button>
              </>
            ) : (
              <Button variant="primary" size="lg" onClick={() => act('start')} loading={busy === 'start'} disabled={!!busy || server.state === 'missing'}>
                <Icon name="play" /> {t.startServer}
              </Button>
            )}
          </div>
        </section>
        {modals}
      </>
    );
  }

  return (
    <>
      <section className={`server-card is-${cardTone}`} aria-label={t.serverAria}>
        <span className={`status-dot status-${dotTone}`} />
        <div className="server-card-text">
          <strong>{title}</strong>
          <span>{details}</span>
        </div>
        <div className="server-card-actions">
          {here ? (
            running ? (
              <>
                <Button size="sm" variant="danger" onClick={() => setConfirmStop(true)} disabled={!!busy}>
                  <Icon name="stop" /> {t.stop}
                </Button>
                <Button size="sm" variant="primary" onClick={() => act('restart')} loading={busy === 'restart'} disabled={!!busy}>
                  <Icon name="restart" /> {t.restart}
                </Button>
              </>
            ) : crashing ? (
              <>
                <Button size="sm" variant="danger" onClick={() => setConfirmStop(true)} disabled={!!busy}>
                  <Icon name="stop" /> {t.stop}
                </Button>
                <Button size="sm" variant="primary" onClick={() => (window.location.hash = '#/console')}>
                  <Icon name="console" /> {t.openConsole}
                </Button>
              </>
            ) : (
              <Button size="sm" variant="primary" onClick={() => act('start')} loading={busy === 'start'} disabled={!!busy || server.state === 'missing'}>
                <Icon name="play" /> {t.startServer}
              </Button>
            )
          ) : (
            <>
              <Button size="sm" variant="ghost" onClick={() => world.select(world.active)}>
                {t.goTo(runningName)}
              </Button>
              <Button size="sm" variant="primary" onClick={() => setActivating(true)}>
                <Icon name="play" /> {t.activateWorld}
              </Button>
            </>
          )}
        </div>
      </section>
      {modals}
    </>
  );
}
