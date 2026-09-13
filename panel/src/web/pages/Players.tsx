import { useState, type FormEvent } from 'react';
import type { PlayerAction, PlayersResponse } from '../../shared/api.ts';
import { joinAddress } from '../../shared/join-address.ts';
import { Icon } from '../components/icons.tsx';
import { ActionMenu, Avatar, EmptyState, ListItem, ListView, Notice, Page } from '../components/page.tsx';
import { Button, Card, Input, Modal, Toggle, useToast } from '../components/ui.tsx';
import { api } from '../lib/api.ts';
import { useApi } from '../lib/hooks.ts';
import './Players.css';

/** Nível de permissão do Minecraft dito pelo que o administrador pode fazer. */
const LEVEL_LABEL: Record<number, string> = {
  1: 'ignora a proteção do spawn',
  2: 'comandos de trapaça',
  3: 'pode expulsar e banir',
  4: 'todos os comandos',
};

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

  const setInvitesOnly = async (enabled: boolean) => {
    setBusy('whitelist');
    try {
      const res = await api.put<{ enabled: boolean; appliedNow: boolean }>('/players/whitelist', { enabled });
      toast.success(`${enabled ? 'Agora só convidados podem entrar.' : 'Qualquer pessoa pode entrar.'}${res.appliedNow ? '' : ' Vale quando o servidor ligar.'}`);
      await reload();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(undefined);
    }
  };

  const invite = async (event: FormEvent) => {
    event.preventDefault();
    await run('whitelist-add', newName.trim());
    setNewName('');
  };

  const closeReason = () => {
    setReasonFor(undefined);
    setReason('');
  };

  const offline = data ? !data.serverOnline : false;
  const isBusy = (action: PlayerAction, name: string) => busy === `${action}:${name}`;
  const opNames = new Set(data?.ops.map((o) => o.name.toLowerCase()));
  const invitedNames = new Set(data?.whitelist.map((p) => p.name.toLowerCase()));
  const join = data ? joinAddress(data.join, window.location.hostname) : undefined;

  return (
    <Page
      title="Jogadores"
      description="Quem está jogando, quem pode entrar e quem é administrador."
      loading={!data && !error}
      error={!data ? error?.message : undefined}
      onRetry={reload}
    >
      {data && (
        <>
          {offline && <Notice tone="warning">Servidor desligado: dá para ver as listas, mas as mudanças só funcionam com ele ligado.</Notice>}

          <Card title="Jogando agora" description={`${data.online.length} de ${data.max || '—'}`}>
            {data.online.length === 0 ? (
              <EmptyState icon="players" title="Ninguém jogando agora" text={join?.scope === 'public' ? `Mande o endereço ${join.address} para seus amigos entrarem.` : 'Veja em Início como seus amigos entram.'} />
            ) : (
              <ListView label="Jogando agora">
                {data.online.map((name) => {
                  const isOp = opNames.has(name.toLowerCase());
                  const isInvited = invitedNames.has(name.toLowerCase());
                  return (
                    <ListItem
                      key={name}
                      leading={<Avatar name={name} />}
                      title={name}
                      detail={[isOp && 'administrador', isInvited && 'convidado'].filter(Boolean).join(' · ') || undefined}
                      actions={
                        <ActionMenu
                          busy={['op', 'deop', 'kick', 'ban', 'whitelist-add', 'whitelist-remove'].some((a) => isBusy(a as PlayerAction, name))}
                          items={[
                            isInvited
                              ? { label: 'Tirar dos convidados', icon: 'kick', onSelect: () => run('whitelist-remove', name) }
                              : { label: 'Adicionar aos convidados', icon: 'userPlus', onSelect: () => run('whitelist-add', name) },
                            isOp
                              ? { label: 'Remover administrador', icon: 'shieldOff', onSelect: () => run('deop', name) }
                              : { label: 'Tornar administrador', icon: 'shield', onSelect: () => run('op', name) },
                            { label: 'Expulsar', icon: 'kick', tone: 'danger', onSelect: () => setReasonFor({ action: 'kick', name }) },
                            { label: 'Banir', icon: 'ban', tone: 'danger', onSelect: () => setReasonFor({ action: 'ban', name }) },
                          ]}
                        />
                      }
                    />
                  );
                })}
              </ListView>
            )}
          </Card>

          <div className="grid two">
            <Card title="Lista de convidados" description="whitelist">
              <label className="invite-switch">
                <span className="invite-switch-text">
                  Só convidados podem entrar
                  <span>{data.whitelistEnabled ? 'Quem não estiver na lista não entra.' : 'Desligado: qualquer pessoa pode entrar.'}</span>
                </span>
                <Toggle label="Só convidados podem entrar" checked={data.whitelistEnabled} disabled={busy === 'whitelist'} onChange={setInvitesOnly} />
              </label>
              <form className="inline-form" onSubmit={invite}>
                <Input placeholder="Nick do jogador" value={newName} onChange={(e) => setNewName(e.target.value)} disabled={offline} aria-label="Nick do jogador" />
                <Button type="submit" variant="primary" disabled={offline || !newName.trim()} loading={isBusy('whitelist-add', newName.trim())}>
                  <Icon name="userPlus" /> Convidar
                </Button>
              </form>
              {data.whitelist.length === 0 ? (
                <EmptyState icon="rules" title="Ninguém convidado ainda" text="Digite o nick acima e toque em Convidar." />
              ) : (
                <ListView label="Lista de convidados">
                  {data.whitelist.map((p) => (
                    <ListItem
                      key={p.name}
                      leading={<Avatar name={p.name} />}
                      title={p.name}
                      actions={
                        <Button size="sm" variant="ghost" disabled={offline} onClick={() => run('whitelist-remove', p.name)} loading={isBusy('whitelist-remove', p.name)}>
                          <Icon name="kick" /> Remover
                        </Button>
                      }
                    />
                  ))}
                </ListView>
              )}
            </Card>

            <Card title="Administradores" description="podem usar comandos">
              {data.ops.length === 0 ? (
                <EmptyState icon="shield" title="Nenhum administrador" text="Use Mais → Tornar administrador em quem está jogando." />
              ) : (
                <ListView label="Administradores">
                  {data.ops.map((p) => (
                    <ListItem
                      key={p.name}
                      leading={<Avatar name={p.name} />}
                      title={p.name}
                      detail={p.level ? LEVEL_LABEL[p.level] : undefined}
                      actions={
                        <Button size="sm" variant="ghost" disabled={offline} onClick={() => run('deop', p.name)} loading={isBusy('deop', p.name)}>
                          <Icon name="shieldOff" /> Remover
                        </Button>
                      }
                    />
                  ))}
                </ListView>
              )}
            </Card>
          </div>

          <Card title="Banidos">
            {data.banned.length === 0 ? (
              <EmptyState icon="check" title="Ninguém banido" text="Tudo tranquilo por aqui." />
            ) : (
              <ListView label="Banidos">
                {data.banned.map((p) => (
                  <ListItem
                    key={p.name}
                    leading={<Avatar name={p.name} />}
                    title={p.name}
                    detail={p.reason}
                    actions={
                      <Button size="sm" variant="ghost" disabled={offline} onClick={() => run('pardon', p.name)} loading={isBusy('pardon', p.name)}>
                        <Icon name="unban" /> Desbanir
                      </Button>
                    }
                  />
                ))}
              </ListView>
            )}
          </Card>
        </>
      )}

      <Modal
        open={!!reasonFor}
        title={reasonFor?.action === 'ban' ? `Banir ${reasonFor.name}?` : `Expulsar ${reasonFor?.name ?? ''}?`}
        text={reasonFor?.action === 'ban' ? 'A pessoa não consegue mais entrar até ser desbanida.' : 'A pessoa é desconectada, mas pode entrar de novo.'}
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
              loading={!!reasonFor && isBusy(reasonFor.action, reasonFor.name)}
              onClick={async () => {
                if (!reasonFor) return;
                await run(reasonFor.action, reasonFor.name, reason);
                closeReason();
              }}
            >
              <Icon name={reasonFor?.action === 'ban' ? 'ban' : 'kick'} /> {reasonFor?.action === 'ban' ? 'Banir' : 'Expulsar'}
            </Button>
          </>
        }
      >
        <label className="field">
          <span className="field-label">Motivo (opcional)</span>
          <Input value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} />
        </label>
      </Modal>
    </Page>
  );
}
