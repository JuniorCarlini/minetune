import { useEffect, useRef, useState } from 'react';
import type { ContainerInfo, StatusResponse } from '../../shared/api.ts';
import { SETTINGS_BY_KEY } from '../../shared/settings.ts';
import { Icon, type IconName } from '../components/icons.tsx';
import { Sparkline } from '../components/Sparkline.tsx';
import { Alert, Badge, Button, Card, Spinner, useTip, useToast, type Tone } from '../components/ui.tsx';
import { api } from '../lib/api.ts';
import { formatBytes, formatDateTime, timeAgo } from '../lib/format.ts';
import { useApi } from '../lib/hooks.ts';

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

interface Sample {
  players: number | null;
  memory: number | null;
  cpu: number | null;
  tps: number | null;
}

const HISTORY = 40;

export function OverviewPage() {
  const { data, error, reload } = useApi<StatusResponse>('/status', 5000);
  const [busy, setBusy] = useState<string>();
  const [history, setHistory] = useState<Sample[]>([]);
  const toast = useToast();

  useEffect(() => {
    if (!data) return;
    const sample: Sample = {
      players: data.players?.online ?? null,
      memory: data.resources?.memoryLimit ? (data.resources.memoryUsed / data.resources.memoryLimit) * 100 : null,
      cpu: data.resources?.cpuPercent ?? null,
      tps: data.tps?.[0] ?? null,
    };
    setHistory((h) => [...h, sample].slice(-HISTORY));
  }, [data]);

  const act = async (action: 'start' | 'stop' | 'restart') => {
    setBusy(action);
    try {
      await api.post(`/server/${action}`);
      toast.success(action === 'start' ? 'Servidor iniciando' : action === 'stop' ? 'Servidor parado' : 'Servidor reiniciando');
      await reload();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(undefined);
    }
  };

  if (error && !data) return <Alert tone="danger" title="Não foi possível obter o status">{error.message}</Alert>;
  if (!data) return <Spinner />;

  const state = serverStateBadge(data.server);
  const running = data.server.state === 'running';
  const typeLabel = SETTINGS_BY_KEY.get('TYPE')?.options?.find((o) => o.value === data.game.type)?.label.split(' —')[0];
  const series = (key: keyof Sample) => history.map((s) => s[key]);
  const tps = data.tps?.[0];
  const memPct = data.resources?.memoryLimit ? data.resources.memoryUsed / data.resources.memoryLimit : undefined;

  return (
    <>
      <section className={`hero hero-${state.tone}`}>
        <div className="hero-main">
          <div className="hero-status">
            <span className={`status-dot status-${state.tone}`} />
            <span className="hero-state">{state.label}</span>
            {running && data.server.startedAt && <span>· ligado {timeAgo(data.server.startedAt)}</span>}
          </div>
          <h1 className="hero-title">{data.game.motd || 'Servidor Minecraft'}</h1>
          <div className="chips">
            <span className="chip">
              <Icon name="cube" size={13} /> {typeLabel ?? data.game.type}
            </span>
            <span className="chip">
              <Icon name="globe" size={13} /> {data.game.version}
            </span>
            <CopyAddress address={`${window.location.hostname}:25565`} />
          </div>
        </div>

        <div className="hero-actions">
          {running ? (
            <>
              <Button onClick={() => act('restart')} loading={busy === 'restart'} disabled={!!busy}>
                <Icon name="restart" size={14} /> Reiniciar
              </Button>
              <Button variant="danger" onClick={() => act('stop')} loading={busy === 'stop'} disabled={!!busy}>
                <Icon name="stop" size={14} /> Parar
              </Button>
            </>
          ) : (
            <Button variant="primary" size="lg" onClick={() => act('start')} loading={busy === 'start'} disabled={!!busy || data.server.state === 'missing'}>
              <Icon name="play" size={14} /> Iniciar servidor
            </Button>
          )}
        </div>
      </section>

      <div className="grid metrics">
        <Metric
          icon="players"
          label="Jogadores"
          value={data.players ? String(data.players.online) : '—'}
          unit={data.players ? `/ ${data.players.max}` : undefined}
          detail={data.players?.names.join(', ') || (running ? 'ninguém online' : 'servidor parado')}
        >
          <Sparkline values={series('players')} max={Math.max(data.players?.max ?? 0, 4) / 4} />
        </Metric>

        <Metric
          icon="memory"
          label="Memória"
          value={data.resources ? formatBytes(data.resources.memoryUsed) : '—'}
          detail={data.resources ? `de ${formatBytes(data.resources.memoryLimit)} · ${Math.round((memPct ?? 0) * 100)}%` : 'sem dados'}
          tone={memPct !== undefined && memPct > 0.9 ? 'danger' : undefined}
        >
          <Sparkline values={series('memory')} max={100} tone={memPct !== undefined && memPct > 0.9 ? 'danger' : 'accent'} />
        </Metric>

        <Metric
          icon="cpu"
          label="CPU"
          value={data.resources?.cpuPercent != null ? `${data.resources.cpuPercent.toFixed(0)}` : '—'}
          unit={data.resources?.cpuPercent != null ? '%' : undefined}
          detail="uso do container (100% = 1 núcleo)"
        >
          <Sparkline values={series('cpu')} max={100} tone="warning" />
        </Metric>

        <Metric
          icon="gauge"
          label="TPS"
          value={tps !== undefined ? tps.toFixed(1) : '—'}
          detail={data.tps ? `5m ${data.tps[1]?.toFixed(1)} · 15m ${data.tps[2]?.toFixed(1)}` : 'disponível no Paper'}
          tone={tps === undefined ? undefined : tps >= 19 ? 'success' : tps >= 15 ? 'warning' : 'danger'}
        >
          <Sparkline values={series('tps')} max={20} tone={tps !== undefined && tps < 15 ? 'danger' : 'success'} />
        </Metric>
      </div>

      <div className="grid two">
        <Card title="Servidor" description="Detalhes da instância em execução">
          <dl className="details">
            <dt>Software</dt>
            <dd>{typeLabel ?? data.game.type}</dd>
            <dt>Versão</dt>
            <dd>{data.game.version}</dd>
            <dt>Container</dt>
            <dd>
              <Badge tone={state.tone}>
                {data.server.state}
                {data.server.health ? ` · ${data.server.health}` : ''}
              </Badge>
            </dd>
            <dt>Imagem</dt>
            <dd>
              <code>{data.server.image ?? '—'}</code>
            </dd>
          </dl>
        </Card>

        <Card
          title="Backups"
          description="Snapshots restic incrementais e criptografados"
          actions={
            <a className="tuc-btn is-outline is-sm" href="#/backups">
              Gerenciar <Icon name="arrowRight" />
            </a>
          }
        >
          <div className="backup-summary">
            <div className={`backup-icon ${data.lastBackup ? 'ok' : ''}`}>
              <Icon name="backups" size={20} />
            </div>
            <div>
              <strong>{data.lastBackup ? `Último backup ${timeAgo(data.lastBackup.time)}` : 'Nenhum backup ainda'}</strong>
              <span className="muted small">
                {data.lastBackup ? formatDateTime(data.lastBackup.time) : 'O primeiro backup automático sai minutos após o boot.'}
              </span>
            </div>
          </div>
          <dl className="details">
            <dt>Agendador</dt>
            <dd>
              <Badge tone={data.backup.state === 'running' ? 'success' : 'warning'}>
                {data.backup.state === 'running' ? 'ativo' : data.backup.state === 'missing' ? 'ausente' : 'parado'}
              </Badge>
            </dd>
          </dl>
        </Card>
      </div>
    </>
  );
}

function Metric({
  icon,
  label,
  value,
  unit,
  detail,
  tone,
  children,
}: {
  icon: IconName;
  label: string;
  value: string;
  unit?: string;
  detail: string;
  tone?: Tone;
  children?: React.ReactNode;
}) {
  return (
    <div className={`metric ${tone ? `metric-${tone}` : ''}`}>
      <div className="metric-head">
        <Icon name={icon} size={14} />
        <span className="metric-label">{label}</span>
      </div>
      <div className="metric-value">
        {value}
        {unit && <span className="metric-unit">{unit}</span>}
      </div>
      <span className="metric-detail" title={detail}>
        {detail}
      </span>
      <div className="metric-chart">{children}</div>
    </div>
  );
}

function CopyAddress({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);
  const tip = useTip<HTMLButtonElement>(copied ? 'Copiado!' : 'Copiar endereço');
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard indisponível (http fora de localhost): o endereço continua visível
    }
  };

  return (
    <button ref={tip} type="button" className="chip" onClick={copy} aria-label="Copiar endereço">
      <code>{address}</code>
      <Icon name={copied ? 'check' : 'copy'} size={13} />
    </button>
  );
}
