import { useState, type FormEvent } from 'react';
import type { PlayerAction, PlayersResponse } from '../../shared/api.ts';
import { Icon, type IconName } from '../components/icons.tsx';
import { Alert, Badge, Button, Card, Input, Modal, PageHeader, Spinner, useToast } from '../components/ui.tsx';
import { api } from '../lib/api.ts';
import { useApi } from '../lib/hooks.ts';

/** Cabeça em blocos com a inicial e uma cor estável derivada do nick. */
function Avatar({ name }: { name: string }) {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return (
    <span className="avatar" style={{ '--avatar-hue': hash % 360 } as React.CSSProperties} aria-hidden>
      {name.replace(/^\./, '').charAt(0).toUpperCase()}
    </span>
  );
}

export function PlayersPage() {
  const { data, error, reload } = useApi<PlayersResponse>('/players', 10_000);
  const [busy, setBusy] = useState<string>();
  const [newName, setNewName] = useState('');
  const [reasonFor, setReasonFor] = useState<{ action: 'kick' | 'ban'; name: string }>();
  const [reason, setReason] = useState('');
  const toast = useToast();

  const run = async (action: PlayerAction, name: string, why?: string) => {
    setBusy(`${action}:${name}`);
    try {
      const { output } = await api.post<{ output: string }>('/players', { action, name, reason: why || undefined });
      toast.success(output || 'Feito');
      // Os arquivos json são gravados pelo servidor logo após o comando.
      setTimeout(reload, 500);
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(undefined);
    }
  };

  const addToWhitelist = async (event: FormEvent) => {
    event.preventDefault();
    await run('whitelist-add', newName.trim());
    setNewName('');
  };

  if (error) return <Alert tone="danger">{error.message}</Alert>;
  if (!data) return <Spinner />;

  const offline = !data.serverOnline;
  const isBusy = (action: PlayerAction, name: string) => busy === `${action}:${name}`;
  const opNames = new Set(data.ops.map((o) => o.name.toLowerCase()));
  const closeReason = () => {
    setReasonFor(undefined);
    setReason('');
  };

  return (
    <>
      <PageHeader title="Jogadores" description="Ações executadas no servidor em tempo real via RCON." />
      {offline && <Alert tone="warning">Servidor offline: as listas abaixo são somente leitura.</Alert>}

      <Card
        title={
          <span className="row">
            Online agora <Badge tone={data.online.length > 0 ? 'success' : 'neutral'}>{`${data.online.length} / ${data.max || '—'}`}</Badge>
          </span>
        }
      >
        {data.online.length === 0 ? (
          <EmptyState icon="players" title="Ninguém online" text={`Conecte em ${window.location.hostname}:25565 para aparecer aqui.`} />
        ) : (
          <ul className="player-list">
            {data.online.map((name) => (
              <li key={name}>
                <span className="player">
                  <Avatar name={name} />
                  <span className="row">
                    {name}
                    {opNames.has(name.toLowerCase()) && <Badge tone="info">op</Badge>}
                  </span>
                </span>
                <div className="row">
                  {opNames.has(name.toLowerCase()) ? (
                    <Button size="sm" onClick={() => run('deop', name)} loading={isBusy('deop', name)}>
                      <Icon name="shieldOff" /> Remover op
                    </Button>
                  ) : (
                    <Button size="sm" onClick={() => run('op', name)} loading={isBusy('op', name)}>
                      <Icon name="shield" /> Tornar op
                    </Button>
                  )}
                  <Button size="sm" onClick={() => setReasonFor({ action: 'kick', name })}>
                    <Icon name="kick" /> Expulsar
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => setReasonFor({ action: 'ban', name })}>
                    <Icon name="ban" /> Banir
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="grid two">
        <Card title="Whitelist" description="Só vale com a whitelist ativa (Configurações → Acesso).">
          <form className="inline-form" onSubmit={addToWhitelist}>
            <Input placeholder="Nick do jogador" value={newName} onChange={(e) => setNewName(e.target.value)} disabled={offline} />
            <Button type="submit" variant="primary" disabled={offline || !newName.trim()} loading={isBusy('whitelist-add', newName.trim())}>
              <Icon name="userPlus" /> Adicionar
            </Button>
          </form>
          <PlayerList
            players={data.whitelist}
            empty={<EmptyState icon="rules" title="Whitelist vazia" text="Adicione nicks acima." />}
            action={(name) => (
              <Button size="sm" variant="ghost" disabled={offline} onClick={() => run('whitelist-remove', name)} loading={isBusy('whitelist-remove', name)}>
                <Icon name="kick" /> Remover
              </Button>
            )}
          />
        </Card>

        <Card title="Operadores" description="Jogadores com permissão de comandos administrativos.">
          <PlayerList
            players={data.ops}
            empty={<EmptyState icon="settings" title="Nenhum operador" text="Torne alguém op pela lista de jogadores online." />}
            detail={(p) => `nível ${(p as { level?: number }).level ?? '?'}`}
            action={(name) => (
              <Button size="sm" variant="ghost" disabled={offline} onClick={() => run('deop', name)} loading={isBusy('deop', name)}>
                <Icon name="shieldOff" /> Remover
              </Button>
            )}
          />
        </Card>
      </div>

      <Card title="Banidos">
        <PlayerList
          players={data.banned}
          empty={<EmptyState icon="check" title="Ninguém banido" text="Tudo tranquilo por aqui." />}
          detail={(p) => (p as { reason?: string }).reason ?? ''}
          action={(name) => (
            <Button size="sm" variant="ghost" disabled={offline} onClick={() => run('pardon', name)} loading={isBusy('pardon', name)}>
              <Icon name="unban" /> Desbanir
            </Button>
          )}
        />
      </Card>

      <Modal
        open={!!reasonFor}
        title={reasonFor?.action === 'ban' ? `Banir ${reasonFor.name}` : `Expulsar ${reasonFor?.name ?? ''}`}
        text={reasonFor?.action === 'ban' ? 'O jogador não conseguirá entrar até ser desbanido.' : 'O jogador é desconectado e pode voltar.'}
        tone="danger"
        size="sm"
        onClose={closeReason}
        footer={
          <>
            <Button onClick={closeReason}>
              <Icon name="x" /> Cancelar
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                if (!reasonFor) return;
                await run(reasonFor.action, reasonFor.name, reason);
                closeReason();
              }}
            >
              <Icon name={reasonFor?.action === 'ban' ? 'ban' : 'kick'} /> Confirmar
            </Button>
          </>
        }
      >
        <label className="field">
          <span className="field-label">Motivo (opcional)</span>
          <Input value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} />
        </label>
      </Modal>
    </>
  );
}

function EmptyState({ icon, title, text }: { icon: IconName; title: string; text: string }) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Icon name={icon} size={18} />
      </span>
      <strong>{title}</strong>
      <span className="muted small">{text}</span>
    </div>
  );
}

function PlayerList({
  players,
  empty,
  detail,
  action,
}: {
  players: { name: string }[];
  empty: React.ReactNode;
  detail?: (player: { name: string }) => string;
  action: (name: string) => React.ReactNode;
}) {
  if (players.length === 0) return <>{empty}</>;
  return (
    <ul className="player-list">
      {players.map((p) => (
        <li key={p.name}>
          <span className="player">
            <Avatar name={p.name} />
            <span>
              {p.name} {detail && <span className="muted small">{detail(p)}</span>}
            </span>
          </span>
          {action(p.name)}
        </li>
      ))}
    </ul>
  );
}
