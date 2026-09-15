import { useState, type FormEvent } from 'react';
import type { PlayerAction, PlayersResponse } from '../../shared/api.ts';
import type { GateResponse } from '../../shared/gate.ts';
import { joinAddress } from '../../shared/join-address.ts';
import { Icon } from '../components/icons.tsx';
import { ActionMenu, Avatar, EmptyState, ListItem, ListView, Notice, Page } from '../components/page.tsx';
import { Button, Card, Input, Modal, Toggle, useToast } from '../components/ui.tsx';
import { api } from '../lib/api.ts';
import { timeAgo } from '../lib/format.ts';
import { useApi } from '../lib/hooks.ts';
import { useMessages } from '../lib/i18n.tsx';
import { useWorld } from '../lib/world.tsx';
import './Players.css';

export function PlayersPage() {
  const world = useWorld();
  const m = useMessages();
  const t = m.players;
  const { data, error, reload } = useApi<PlayersResponse>(world.ready ? world.path('/players') : null, 10_000);
  const [busy, setBusy] = useState<string>();
  const [newName, setNewName] = useState('');
  const [reasonFor, setReasonFor] = useState<{ action: 'kick' | 'ban'; name: string }>();
  const [reason, setReason] = useState('');
  const toast = useToast();
  // Senhas do portão valem para o servidor inteiro, não para um mundo: sem ?world=.
  const gate = useApi<GateResponse>('/gate', 30_000);
  const [resetFor, setResetFor] = useState<string>();

  const setRequirePassword = async (requirePassword: boolean) => {
    setBusy('gate');
    try {
      await api.put('/gate', { requirePassword });
      toast.success(t.gateToggled(requirePassword));
      await gate.reload();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(undefined);
    }
  };

  const resetPassword = async (name: string) => {
    setBusy(`reset:${name}`);
    try {
      await api.post('/gate/accounts/reset', { name });
      toast.success(t.gateResetDone(name));
      setResetFor(undefined);
      await gate.reload();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(undefined);
    }
  };

  const run = async (action: PlayerAction, name: string, why?: string) => {
    setBusy(`${action}:${name}`);
    try {
      // Com o mundo da tela: num mundo guardado o servidor recusa, em vez de mexer no que está rodando.
      const { output } = await api.post<{ output: string }>(world.path('/players'), { action, name, reason: why || undefined });
      // A resposta do comando vem do próprio Minecraft (em inglês); sem ela, a confirmação na língua do painel.
      toast.success(output || t.done);
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
      const res = await api.put<{ enabled: boolean; appliedNow: boolean }>(world.path('/players/whitelist'), { enabled });
      toast.success(t.whitelistToggled(enabled, res.appliedNow));
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
    <Page title={t.title} description={t.description} loading={!data && !error} error={!data ? error?.message : undefined} onRetry={reload}>
      {data && (
        <>
          {data.worldActive === false ? <Notice tone="info">{t.storedNotice}</Notice> : offline && <Notice tone="warning">{t.offlineNotice}</Notice>}

          {/* Quem está online é do mundo que roda: num mundo guardado esse cartão só confundiria. */}
          {data.worldActive !== false && (
            <Card title={t.playingNow} description={t.playingCount(data.online.length, data.max ? String(data.max) : '—')}>
              {data.online.length === 0 ? (
                <EmptyState icon="players" title={t.nobodyPlaying} text={join?.scope === 'public' ? t.shareAddress(join.address) : t.seeHome} />
              ) : (
                <ListView label={t.playingNow}>
                  {data.online.map((name) => {
                    const isOp = opNames.has(name.toLowerCase());
                    const isInvited = invitedNames.has(name.toLowerCase());
                    return (
                      <ListItem
                        key={name}
                        leading={<Avatar name={name} />}
                        title={name}
                        detail={[isOp && t.tagOp, isInvited && t.tagInvited].filter(Boolean).join(' · ') || undefined}
                        actions={
                          <ActionMenu
                            busy={['op', 'deop', 'kick', 'ban', 'whitelist-add', 'whitelist-remove'].some((a) => isBusy(a as PlayerAction, name))}
                            items={[
                              isInvited
                                ? { label: t.uninvite, icon: 'kick', onSelect: () => run('whitelist-remove', name) }
                                : { label: t.invite, icon: 'userPlus', onSelect: () => run('whitelist-add', name) },
                              isOp
                                ? { label: t.deop, icon: 'shieldOff', onSelect: () => run('deop', name) }
                                : { label: t.op, icon: 'shield', onSelect: () => run('op', name) },
                              { label: t.kick, icon: 'kick', tone: 'danger', onSelect: () => setReasonFor({ action: 'kick', name }) },
                              { label: t.ban, icon: 'ban', tone: 'danger', onSelect: () => setReasonFor({ action: 'ban', name }) },
                            ]}
                          />
                        }
                      />
                    );
                  })}
                </ListView>
              )}
            </Card>
          )}

          {gate.data?.installed && (
            <Card title={t.gateTitle} description={t.gateDescription}>
              {!gate.data.running && <Notice tone="danger">{t.gateStopped}</Notice>}
              {gate.data.onlineMode && <Notice tone="info">{t.gateOnlineMode}</Notice>}
              {!gate.data.onlineMode && !gate.data.passwordWindow && <Notice tone="warning">{t.gateOldVersion}</Notice>}
              <label className="invite-switch">
                <span className="invite-switch-text">
                  {t.gateRequire}
                  <span>{gate.data.requirePassword ? t.gateRequireOnHelp : t.gateRequireOffHelp}</span>
                </span>
                <Toggle label={t.gateRequire} checked={gate.data.requirePassword} disabled={busy === 'gate'} onChange={setRequirePassword} />
              </label>
              {gate.data.accounts.length === 0 ? (
                <EmptyState icon="shield" title={t.gateNoAccounts} text={t.gateNoAccountsText} />
              ) : (
                <ListView label={t.gateTitle}>
                  {gate.data.accounts.map((account) => (
                    <ListItem
                      key={account.name}
                      leading={<Avatar name={account.name} />}
                      title={account.name}
                      detail={account.lastLoginAt ? t.gateLastLogin(timeAgo(account.lastLoginAt)) : t.gateCreated(timeAgo(account.createdAt))}
                      actions={
                        <Button size="sm" variant="ghost" onClick={() => setResetFor(account.name)} loading={busy === `reset:${account.name}`}>
                          <Icon name="shieldOff" /> {t.gateReset}
                        </Button>
                      }
                    />
                  ))}
                </ListView>
              )}
            </Card>
          )}

          <div className="grid two">
            <Card title={t.whitelistTitle} description={t.whitelistDescription}>
              <label className="invite-switch">
                <span className="invite-switch-text">
                  {t.invitesOnly}
                  <span>{data.whitelistEnabled ? t.invitesOnlyOnHelp : t.invitesOnlyOffHelp}</span>
                </span>
                <Toggle label={t.invitesOnly} checked={data.whitelistEnabled} disabled={busy === 'whitelist'} onChange={setInvitesOnly} />
              </label>
              <form className="inline-form" onSubmit={invite}>
                <Input placeholder={t.nickPlaceholder} value={newName} onChange={(e) => setNewName(e.target.value)} disabled={offline} aria-label={t.nickPlaceholder} />
                <Button type="submit" variant="primary" disabled={offline || !newName.trim()} loading={isBusy('whitelist-add', newName.trim())}>
                  <Icon name="userPlus" /> {t.inviteButton}
                </Button>
              </form>
              {data.whitelist.length === 0 ? (
                <EmptyState icon="rules" title={t.noInvited} text={t.noInvitedText} />
              ) : (
                <ListView label={t.whitelistTitle}>
                  {data.whitelist.map((p) => (
                    <ListItem
                      key={p.name}
                      leading={<Avatar name={p.name} />}
                      title={p.name}
                      actions={
                        <Button size="sm" variant="ghost" disabled={offline} onClick={() => run('whitelist-remove', p.name)} loading={isBusy('whitelist-remove', p.name)}>
                          <Icon name="kick" /> {m.common.remove}
                        </Button>
                      }
                    />
                  ))}
                </ListView>
              )}
            </Card>

            <Card title={t.opsTitle} description={t.opsDescription}>
              {data.ops.length === 0 ? (
                <EmptyState icon="shield" title={t.noOps} text={t.noOpsText} />
              ) : (
                <ListView label={t.opsTitle}>
                  {data.ops.map((p) => (
                    <ListItem
                      key={p.name}
                      leading={<Avatar name={p.name} />}
                      title={p.name}
                      detail={p.level ? t.opLevel[p.level] : undefined}
                      actions={
                        <Button size="sm" variant="ghost" disabled={offline} onClick={() => run('deop', p.name)} loading={isBusy('deop', p.name)}>
                          <Icon name="shieldOff" /> {m.common.remove}
                        </Button>
                      }
                    />
                  ))}
                </ListView>
              )}
            </Card>
          </div>

          <Card title={t.bannedTitle}>
            {data.banned.length === 0 ? (
              <EmptyState icon="check" title={t.noBanned} text={t.noBannedText} />
            ) : (
              <ListView label={t.bannedTitle}>
                {data.banned.map((p) => (
                  <ListItem
                    key={p.name}
                    leading={<Avatar name={p.name} />}
                    title={p.name}
                    detail={p.reason}
                    actions={
                      <Button size="sm" variant="ghost" disabled={offline} onClick={() => run('pardon', p.name)} loading={isBusy('pardon', p.name)}>
                        <Icon name="unban" /> {t.pardon}
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
        title={reasonFor?.action === 'ban' ? t.banTitle(reasonFor.name) : t.kickTitle(reasonFor?.name ?? '')}
        text={reasonFor?.action === 'ban' ? t.banText : t.kickText}
        tone="danger"
        size="sm"
        onClose={closeReason}
        footer={
          <>
            <Button onClick={closeReason}>
              <Icon name="x" /> {m.common.cancel}
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
              <Icon name={reasonFor?.action === 'ban' ? 'ban' : 'kick'} /> {reasonFor?.action === 'ban' ? t.ban : t.kick}
            </Button>
          </>
        }
      >
        <label className="field">
          <span className="field-label">{t.reasonLabel}</span>
          <Input value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} />
        </label>
      </Modal>

      <Modal
        open={!!resetFor}
        title={t.gateResetTitle(resetFor ?? '')}
        text={t.gateResetText}
        tone="danger"
        size="md"
        onClose={() => setResetFor(undefined)}
        footer={
          <>
            <Button onClick={() => setResetFor(undefined)}>
              <Icon name="x" /> {m.common.cancel}
            </Button>
            <Button variant="danger" loading={!!resetFor && busy === `reset:${resetFor}`} onClick={() => resetFor && resetPassword(resetFor)}>
              <Icon name="shieldOff" /> {t.gateReset}
            </Button>
          </>
        }
      />
    </Page>
  );
}
