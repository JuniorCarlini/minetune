import { useEffect, useRef, useState } from 'react';
import type { AttentionItem, ContainerInfo, StatusResponse } from '../../shared/api.ts';
import { SETTINGS_BY_KEY } from '../../shared/settings.ts';
import { Icon } from '../components/icons.tsx';
import { EmptyState, Notice, StatTile } from '../components/page.tsx';
import { Button, Card, Modal, Spinner, useToast, type Tone } from '../components/ui.tsx';
import { api } from '../lib/api.ts';
import { formatBytes, formatDateTime, timeAgo } from '../lib/format.ts';
import { useApi } from '../lib/hooks.ts';
import './Overview.css';

export function serverStateBadge(info: ContainerInfo): { tone: Tone; label: string } {
  if (info.state === 'running') {
    if (info.health === 'starting') return { tone: 'warning', label: 'Iniciando' };
    if (info.health === 'unhealthy') return { tone: 'danger', label: 'Com problemas' };
    return { tone: 'success', label: 'Online' };
  }
  if (info.state === 'restarting') return { tone: 'warning', label: 'Reiniciando' };
  if (info.state === 'missing') return { tone: 'danger', label: 'Container não encontrado' };
  return { tone: 'neutral', label: 'Parado' };
}

/** Frase grande do topo: o estado dito como a pessoa falaria. */
function stateSentence(info: ContainerInfo): string {
  if (info.state === 'running') {
    if (info.health === 'starting') return 'Servidor iniciando';
    if (info.health === 'unhealthy') return 'Servidor com problemas';
    return 'Servidor ligado';
  }
  if (info.state === 'restarting') return 'Servidor reiniciando';
  if (info.state === 'missing') return 'Servidor não encontrado';
  return 'Servidor desligado';
}

export function OverviewPage() {
  const { data, error, reload } = useApi<StatusResponse>('/status', 5000);
  const [busy, setBusy] = useState<string>();
  const [confirmStop, setConfirmStop] = useState(false);
  const toast = useToast();

  const act = async (action: 'start' | 'stop' | 'restart') => {
    setBusy(action);
    try {
      await api.post(`/server/${action}`);
      toast.success(action === 'start' ? 'Servidor ligando' : action === 'stop' ? 'Servidor desligado' : 'Servidor reiniciando');
      setConfirmStop(false);
      await reload();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(undefined);
    }
  };

  if (!data) {
    // O topo é o próprio bloco de estado; sem dados, o lugar dele mostra o carregamento ou o erro.
    return error ? (
      <EmptyState
        icon="refresh"
        title="Não deu para carregar o estado do servidor"
        text={error.message}
        action={
          <Button onClick={reload}>
            <Icon name="refresh" /> Tentar de novo
          </Button>
        }
      />
    ) : (
      <Spinner />
    );
  }

  const state = serverStateBadge(data.server);
  const running = data.server.state === 'running';
  const typeLabel = SETTINGS_BY_KEY.get('TYPE')?.options?.find((o) => o.value === data.game.type)?.label.split(' —')[0] ?? data.game.type;
  const online = data.players?.online ?? 0;
  const line = [
    running && data.players ? (online === 1 ? '1 pessoa jogando' : `${online} pessoas jogando`) : null,
    running && data.server.startedAt ? `ligado ${timeAgo(data.server.startedAt)}` : null,
    `${typeLabel} ${data.game.version}`,
  ]
    .filter(Boolean)
    .join(' · ');

  const memPct = data.resources?.memoryLimit ? data.resources.memoryUsed / data.resources.memoryLimit : undefined;

  // O Docker mede CPU em "núcleos" (100% = um núcleo, 350% = três e meio). Dividido pelos
  // núcleos disponíveis vira 0–100% da máquina, que é o que uma pessoa entende.
  const cpuShare =
    running && data.resources?.cpuPercent != null && data.resources.cpuCores > 0
      ? Math.min(1, data.resources.cpuPercent / 100 / data.resources.cpuCores)
      : undefined;
  const tps = data.tps?.[0];

  return (
    <>
      <section className={`hero hero-${state.tone}`}>
        <div className="hero-main">
          <div className="hero-status">
            <span className={`status-dot status-${state.tone}`} />
            <span className="home-hero-line">{line}</span>
          </div>
          <h1 className="hero-title">{stateSentence(data.server)}</h1>
        </div>

        <div className="hero-actions">
          {running ? (
            <>
              <Button variant="danger" onClick={() => setConfirmStop(true)} disabled={!!busy}>
                <Icon name="stop" /> Desligar
              </Button>
              <Button variant="primary" onClick={() => act('restart')} loading={busy === 'restart'} disabled={!!busy}>
                <Icon name="restart" /> Reiniciar
              </Button>
            </>
          ) : (
            <Button
              variant="primary"
              size="lg"
              onClick={() => act('start')}
              loading={busy === 'start'}
              disabled={!!busy || data.server.state === 'missing' || data.server.state === 'restarting'}
            >
              <Icon name="play" /> Ligar servidor
            </Button>
          )}
        </div>
      </section>

      <div className="grid two">
        <Card title="Como entrar no servidor" description="Mande isto para seus amigos">
          <CopyAddress address={`${window.location.hostname}:25565`} />
          <ol className="home-steps">
            <li>Abra o Minecraft Java → Multijogador</li>
            <li>Adicionar servidor e colar o endereço</li>
          </ol>
        </Card>

        <Card title="Precisa de atenção" description={data.attention.length === 0 ? undefined : `${data.attention.length} ${data.attention.length === 1 ? 'item' : 'itens'}`}>
          <div className="home-attention">
            {data.attention.length === 0 ? (
              <Notice tone="success" title="Tudo certo por aqui">
                Servidor e backups sem nenhum problema agora.
              </Notice>
            ) : (
              data.attention.map((item) => (
                <Notice key={item.id} tone={item.tone} title={item.title} action={<AttentionAction item={item} busy={busy} onStart={() => act('start')} />}>
                  {item.text}
                </Notice>
              ))
            )}
          </div>
        </Card>
      </div>

      <div className="home-stats">
        <StatTile
          icon="players"
          label="Jogadores"
          value={running && data.players ? `${online} de ${data.players.max}` : '—'}
          detail={!running ? 'servidor desligado' : data.players?.names.length ? data.players.names.join(', ') : 'ninguém jogando'}
        />
        <StatTile
          icon="memory"
          label="Memória"
          value={memPct !== undefined ? `${Math.round(memPct * 100)}% usada` : '—'}
          bar={memPct}
          tone={memPct === undefined ? undefined : memPct > 0.9 ? 'danger' : memPct > 0.75 ? 'warning' : undefined}
          detail={data.resources ? `${formatBytes(data.resources.memoryUsed)} de ${formatBytes(data.resources.memoryLimit)}` : 'servidor desligado'}
        />
        <StatTile
          icon="cpu"
          label="Processador"
          // Abaixo de 10% mostra uma casa: servidor ocioso em máquina com muitos núcleos daria "0%", que parece medição quebrada.
          value={cpuShare !== undefined ? `${(cpuShare * 100).toLocaleString('pt-BR', { maximumFractionDigits: cpuShare < 0.1 ? 1 : 0 })}% em uso` : '—'}
          bar={cpuShare}
          tone={cpuShare === undefined ? undefined : cpuShare > 0.9 ? 'danger' : cpuShare > 0.7 ? 'warning' : undefined}
          detail={
            !running
              ? 'servidor desligado'
              : cpuShare === undefined
                ? 'medindo…'
                : `da capacidade total · ${data.resources!.cpuCores} ${data.resources!.cpuCores === 1 ? 'núcleo' : 'núcleos'}`
          }
        />
        <StatTile
          icon="gauge"
          label="Desempenho"
          value={!running || tps === undefined ? '—' : tps >= 19 ? 'Ótimo' : tps >= 15 ? 'Com lentidão' : 'Travando'}
          tone={!running || tps === undefined ? undefined : tps >= 19 ? 'success' : tps >= 15 ? 'warning' : 'danger'}
          detail={!running ? 'servidor desligado' : tps === undefined ? 'disponível só no Paper' : tps >= 19 ? 'sem travamentos agora' : 'o servidor não está dando conta'}
        />
      </div>

      <Card
        title="Último backup"
        description={data.lastBackup ? `${timeAgo(data.lastBackup.time)} · ${formatDateTime(data.lastBackup.time)}` : 'Nenhum backup ainda'}
        actions={
          <a className="tuc-btn is-outline is-sm" href="#/backups">
            <Icon name="backups" /> Ver backups
          </a>
        }
      />

      <Modal
        open={confirmStop}
        title="Desligar o servidor?"
        text="Quem estiver jogando será desconectado. O mundo é salvo antes de desligar."
        tone="danger"
        size="sm"
        onClose={() => setConfirmStop(false)}
        footer={
          <>
            <Button onClick={() => setConfirmStop(false)}>
              <Icon name="x" /> Cancelar
            </Button>
            <Button variant="danger" onClick={() => act('stop')} loading={busy === 'stop'}>
              <Icon name="stop" /> Desligar
            </Button>
          </>
        }
      />
    </>
  );
}

function AttentionAction({ item, busy, onStart }: { item: AttentionItem; busy?: string; onStart: () => void }) {
  if (!item.action) return null;
  if (item.action.server === 'start') {
    return (
      <Button size="sm" variant="primary" onClick={onStart} loading={busy === 'start'} disabled={!!busy}>
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
      <Button onClick={copy} aria-label="Copiar endereço">
        <Icon name={copied ? 'check' : 'copy'} /> {copied ? 'Copiado' : 'Copiar'}
      </Button>
    </div>
  );
}
