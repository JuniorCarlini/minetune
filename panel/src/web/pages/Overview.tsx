import { useEffect, useRef, useState } from 'react';
import type { AttentionItem, ContainerInfo, StatusResponse, WorldOverviewResponse } from '../../shared/api.ts';
import { PT, type Messages } from '../../shared/i18n/index.ts';
import { joinAddress } from '../../shared/join-address.ts';
import { Icon } from '../components/icons.tsx';
import { Notice, Page, StatTile } from '../components/page.tsx';
import { ServerCard, serverTypeLabel } from '../components/ServerCard.tsx';
import { Button, Card, useToast, type Tone } from '../components/ui.tsx';
import { levelTypes, SeedLine } from '../components/WorldControls.tsx';
import { api } from '../lib/api.ts';
import { formatBytes, formatDateTime, timeAgo } from '../lib/format.ts';
import { useApi } from '../lib/hooks.ts';
import { intlLocale, useMessages } from '../lib/i18n.tsx';
import { useWorld } from '../lib/world.tsx';
import './Overview.css';

export function serverStateBadge(info: ContainerInfo, m: Messages = PT): { tone: Tone; label: string } {
  if (info.state === 'running') {
    if (info.health === 'starting') return { tone: 'warning', label: m.home.badgeStarting };
    if (info.health === 'unhealthy') return { tone: 'danger', label: m.home.badgeUnhealthy };
    return { tone: 'success', label: m.home.badgeOnline };
  }
  if (info.state === 'restarting') return { tone: 'warning', label: m.home.badgeRestarting };
  if (info.state === 'missing') return { tone: 'danger', label: m.home.badgeMissing };
  return { tone: 'neutral', label: m.home.badgeStopped };
}

/**
 * Início do mundo escolhido no seletor. O estado do servidor (ligado, desligar, reiniciar)
 * fica no card do topo; aqui só aparece o que é do mundo.
 */
export function OverviewPage() {
  const world = useWorld();
  const m = useMessages();
  if (!world.ready) return <Page title={m.home.title} loading />;
  return world.isActive ? <RunningWorldHome /> : <StoredWorldHome />;
}

/** Mundo que está rodando: quem joga, como entrar, desempenho e avisos. */
function RunningWorldHome() {
  const world = useWorld();
  const m = useMessages();
  const { data, error, reload } = useApi<StatusResponse>('/status', 5000);
  const [starting, setStarting] = useState(false);
  const toast = useToast();
  const name = world.selectedWorld?.name ?? world.active;

  const start = async (target: 'server' | 'gate' = 'server') => {
    setStarting(true);
    try {
      await api.post(target === 'gate' ? '/gate/start' : '/server/start');
      // O portão sobe em um segundo: o aviso some na recarga, sem precisar de mensagem.
      if (target === 'server') toast.success(m.home.toastStarting);
      await reload();
    } catch (err) {
      toast.error(err);
    } finally {
      setStarting(false);
    }
  };

  if (!data) {
    return <Page title={name} loading={!error} error={error?.message} onRetry={reload} />;
  }

  const running = data.server.state === 'running';
  const online = data.players?.online ?? 0;
  const memPct = data.resources?.memoryLimit ? data.resources.memoryUsed / data.resources.memoryLimit : undefined;
  const join = joinAddress(data.join, window.location.hostname);
  // O Docker mede CPU em "núcleos" (100% = um núcleo, 350% = três e meio). Dividido pelos
  // núcleos disponíveis vira 0–100% da máquina, que é o que uma pessoa entende.
  const cpuShare =
    running && data.resources?.cpuPercent != null && data.resources.cpuCores > 0
      ? Math.min(1, data.resources.cpuPercent / 100 / data.resources.cpuCores)
      : undefined;
  const tps = data.tps?.[0];

  return (
    <>
      <ServerCard variant="hero" />
      {/* Números primeiro: o estado do servidor em um olhar, antes de como entrar e dos avisos. */}
      <div className="home-stats">
        <StatTile
          icon="players"
          label={m.home.players}
          value={running && data.players ? m.home.ofMax(online, data.players.max) : '—'}
          detail={!running ? m.home.serverOff : data.players?.names.length ? data.players.names.join(', ') : m.home.nobodyPlaying}
        />
        <StatTile
          icon="memory"
          label={m.home.memory}
          value={memPct !== undefined ? m.home.memoryUsed(Math.round(memPct * 100)) : '—'}
          bar={memPct}
          tone={memPct === undefined ? undefined : memPct > 0.9 ? 'danger' : memPct > 0.75 ? 'warning' : undefined}
          detail={data.resources ? m.home.memoryDetail(formatBytes(data.resources.memoryUsed), formatBytes(data.resources.memoryLimit)) : m.home.serverOff}
        />
        <StatTile
          icon="cpu"
          label={m.home.cpu}
          // Abaixo de 10% mostra uma casa: servidor ocioso em máquina com muitos núcleos daria "0%", que parece medição quebrada.
          value={cpuShare !== undefined ? m.home.cpuUsed((cpuShare * 100).toLocaleString(intlLocale(), { maximumFractionDigits: cpuShare < 0.1 ? 1 : 0 })) : '—'}
          bar={cpuShare}
          tone={cpuShare === undefined ? undefined : cpuShare > 0.9 ? 'danger' : cpuShare > 0.7 ? 'warning' : undefined}
          detail={!running ? m.home.serverOff : cpuShare === undefined ? m.home.measuring : m.home.cpuDetail(data.resources!.cpuCores)}
        />
        <StatTile
          icon="gauge"
          label={m.home.performance}
          value={!running || tps === undefined ? '—' : tps >= 19 ? m.home.perfGreat : tps >= 15 ? m.home.perfSlow : m.home.perfLagging}
          tone={!running || tps === undefined ? undefined : tps >= 19 ? 'success' : tps >= 15 ? 'warning' : 'danger'}
          detail={!running ? m.home.serverOff : tps === undefined ? m.home.perfPaperOnly : tps >= 19 ? m.home.perfNoLag : m.home.perfStruggling}
        />
      </div>

      <div className="grid two">
        <Card title={m.home.joinTitle} description={join.scope === 'public' ? m.home.joinShare : undefined}>
          <CopyAddress address={join.address} />
          {join.scope !== 'public' && (
            <Notice tone="warning" title={join.scope === 'lan' ? m.home.joinLan : m.home.joinLocal}>
              {m.home.joinHint}
            </Notice>
          )}
          <ol className="home-steps">
            <li>{m.home.joinStep1}</li>
            <li>{m.home.joinStep2}</li>
          </ol>
        </Card>

        <Card title={m.home.attention} description={data.attention.length === 0 ? undefined : m.home.attentionCount(data.attention.length)}>
          <div className="home-attention">
            {data.attention.length === 0 ? (
              <Notice tone="success" title={m.home.allGoodTitle}>
                {m.home.allGoodText}
              </Notice>
            ) : (
              data.attention.map((item) => (
                <Notice key={item.id} tone={item.tone} title={item.title} action={<AttentionAction item={item} busy={starting} onStart={(target) => void start(target)} />}>
                  {item.text}
                </Notice>
              ))
            )}
          </div>
        </Card>
      </div>

      <LastBackupCard lastBackup={data.lastBackup} />
    </>
  );
}

/** Mundo guardado: só os dados dele. Nada do servidor que está rodando outro mundo. */
function StoredWorldHome() {
  const world = useWorld();
  const m = useMessages();
  const overview = useApi<WorldOverviewResponse>(world.path('/world-overview'));
  const status = useApi<StatusResponse>('/status', 30_000);
  const name = world.selectedWorld?.name ?? world.selected;
  const data = overview.data;

  if (!data) {
    return <Page title={name} loading={!overview.error} error={overview.error?.message} onRetry={overview.reload} />;
  }

  const { world: info, counts } = data;
  const levelType = levelTypes(m).find((o) => o.value === info.levelType)?.label ?? m.home.levelTypeNormal;

  return (
    <>
      <ServerCard variant="hero" />
      {data.blockReason && (
        <Notice
          tone="danger"
          title={m.home.blockedTitle}
          action={
            <a className="tuc-btn is-outline is-sm" href="#/settings">
              <Icon name="settings" /> {m.home.openSettings}
            </a>
          }
        >
          {data.blockReason}
        </Notice>
      )}
      {!info.hasProfile && (
        <Notice tone="info" title={m.home.inheritedTitle}>
          {m.home.inheritedText}
        </Notice>
      )}
      {!info.generated && (
        <Notice tone="info" title={m.home.notGeneratedTitle}>
          {m.home.notGeneratedText}
        </Notice>
      )}

      <div className="home-stats">
        <StatTile
          icon="cube"
          label={m.home.version}
          value={info.serverVersion ? `${serverTypeLabel(info.serverType, m)} ${info.serverVersion}` : '—'}
          detail={info.version ? m.home.mapSavedIn(info.version) : m.home.mapNotGenerated}
        />
        <StatTile icon="globe" label={m.home.map} value={info.generated ? formatBytes(info.sizeBytes) : '—'} detail={m.home.levelType(levelType)} />
        <StatTile
          icon="play"
          label={m.home.lastPlayed}
          value={info.lastPlayed ? timeAgo(info.lastPlayed) : m.home.never}
          detail={info.lastPlayed ? formatDateTime(info.lastPlayed) : m.home.neverStarted}
        />
        <StatTile
          icon="players"
          label={m.home.access}
          value={m.home.invitedCount(counts.whitelist)}
          detail={m.home.accessDetail(counts.ops, counts.banned, data.whitelistEnabled)}
        />
      </div>

      <Card title={m.home.seed} description={info.seed ? undefined : m.home.seedPending}>
        {info.seed && <SeedLine seed={info.seed} version={info.version} />}
      </Card>

      <LastBackupCard lastBackup={status.data?.lastBackup} />
    </>
  );
}

function LastBackupCard({ lastBackup }: { lastBackup?: StatusResponse['lastBackup'] }) {
  const m = useMessages();
  return (
    <Card
      title={m.home.lastBackup}
      description={lastBackup ? m.home.lastBackupDetail(timeAgo(lastBackup.time), formatDateTime(lastBackup.time)) : m.home.noBackup}
      actions={
        <a className="tuc-btn is-outline is-sm" href="#/backups">
          <Icon name="backups" /> {m.home.viewBackups}
        </a>
      }
    />
  );
}

function AttentionAction({ item, busy, onStart }: { item: AttentionItem; busy: boolean; onStart: (target: 'server' | 'gate') => void }) {
  if (!item.action) return null;
  if (item.action.server === 'start' || item.action.gate === 'start') {
    const target = item.action.gate === 'start' ? 'gate' : 'server';
    return (
      <Button size="sm" variant="primary" onClick={() => onStart(target)} loading={busy} disabled={busy}>
        <Icon name="play" /> {item.action.label}
      </Button>
    );
  }
  const external = item.action.href?.startsWith('http');
  return (
    <a className="tuc-btn is-outline is-sm" href={item.action.href} target={external ? '_blank' : undefined} rel={external ? 'noreferrer' : undefined}>
      {item.action.label} <Icon name="arrowRight" />
    </a>
  );
}

function CopyAddress({ address }: { address: string }) {
  const m = useMessages();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard indisponível (http fora de localhost): o endereço continua visível para copiar à mão
    }
  };

  return (
    <div className="home-address">
      <code>{address}</code>
      <Button onClick={copy} aria-label={m.home.copyAddress}>
        <Icon name={copied ? 'check' : 'copy'} /> {copied ? m.common.copied : m.common.copy}
      </Button>
    </div>
  );
}
