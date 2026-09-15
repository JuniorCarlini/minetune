import { useEffect, useState } from 'react';
import type { ModrinthListResponse, ModrinthSearchHit } from '../../shared/api.ts';
import { formatModrinthEntry, type ModrinthEntry } from '../../shared/modrinth.ts';
import { Icon } from '../components/icons.tsx';
import { AdvancedToggle, EmptyState, ListItem, ListView, Notice, Page, useAdvancedMode } from '../components/page.tsx';
import { Badge, Button, Card, CheckLabel, Input, SearchInput, Spinner, useToast } from '../components/ui.tsx';
import { api } from '../lib/api.ts';
import { formatNumber } from '../lib/format.ts';
import { useApi } from '../lib/hooks.ts';
import { useMessages } from '../lib/i18n.tsx';
import { useWorld } from '../lib/world.tsx';
import './Plugins.css';

export function PluginsPage() {
  const world = useWorld();
  const m = useMessages();
  const t = m.plugins;
  const list = useApi<ModrinthListResponse>(world.ready ? world.path('/modrinth') : null);
  const [entries, setEntries] = useState<ModrinthEntry[]>();
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<ModrinthSearchHit[]>();
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [savedPendingRestart, setSavedPendingRestart] = useState(false);
  const [advanced] = useAdvancedMode();
  const toast = useToast();

  useEffect(() => {
    if (list.data) setEntries(list.data.entries);
  }, [list.data]);

  useEffect(() => {
    if (!list.data?.loader) return;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const result = await api.get<{ hits: ModrinthSearchHit[] }>(world.path(`/modrinth/search?q=${encodeURIComponent(query)}`));
        setHits(result.hits);
      } catch (err) {
        toast.error(err);
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, list.data?.loader, world.selected]);

  const loader = list.data?.loader;
  // Paper usa plugins; Fabric e NeoForge, mods. O texto muda de palavra em cada língua.
  const isPlugin = loader === 'paper';

  const save = async () => {
    if (!entries) return;
    setSaving(true);
    try {
      await api.put(world.path('/modrinth'), { entries: entries.map(formatModrinthEntry) });
      await list.reload();
      // Mundo guardado não tem o que reiniciar: a lista vale quando ele for ligado.
      setSavedPendingRestart(world.isActive);
      toast.success(world.isActive ? t.savedActive : t.savedStored);
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  };

  const restart = async () => {
    setRestarting(true);
    try {
      await api.post('/server/restart');
      setSavedPendingRestart(false);
      toast.success(t.restarting);
    } catch (err) {
      toast.error(err);
    } finally {
      setRestarting(false);
    }
  };

  const ready = !!list.data && !!entries;
  const changed = ready && entries!.map(formatModrinthEntry).join('\n') !== list.data!.entries.map(formatModrinthEntry).join('\n');
  const installed = new Set((entries ?? []).map((e) => e.slug.toLowerCase()));
  const update = (slug: string, patch: Partial<ModrinthEntry>) => setEntries((l) => l?.map((e) => (e.slug === slug ? { ...e, ...patch } : e)));

  return (
    <>
      <Page
        title={t.title}
        description={t.description}
        actions={<AdvancedToggle />}
        loading={!ready && !list.error}
        error={!ready ? list.error?.message : undefined}
        onRetry={list.reload}
      >
        {ready && !loader && (
          <EmptyState
            icon="plugins"
            title={t.noLoaderTitle}
            text={t.noLoaderText}
            action={
              <a className="tuc-btn is-outline" href="#/settings">
                <Icon name="settings" /> {t.changeType}
              </a>
            }
          />
        )}

        {ready && loader && (
          <>
            {savedPendingRestart && (
              <Notice
                tone="warning"
                action={
                  <Button size="sm" variant="primary" onClick={restart} loading={restarting}>
                    <Icon name="restart" /> {t.restartNow}
                  </Button>
                }
              >
                {t.pendingRestart}
              </Notice>
            )}

            <Card title={t.installed} description={t.count(entries!.length, isPlugin)}>
              {entries!.length === 0 ? (
                <EmptyState icon="plugins" title={t.noneInstalled(isPlugin)} text={t.searchBelow} />
              ) : (
                <ListView label={t.installed}>
                  {entries!.map((entry) => (
                    <ListItem
                      key={entry.slug}
                      leading={
                        <span className="plugin-icon">
                          <Icon name="plugins" />
                        </span>
                      }
                      title={
                        <a href={`https://modrinth.com/project/${entry.slug}`} target="_blank" rel="noreferrer">
                          {entry.slug}
                        </a>
                      }
                      detail={[entry.optional ? t.optionalDetail : t.required, entry.version ? t.versionDetail(entry.version) : null]
                        .filter(Boolean)
                        .join(' · ')}
                      actions={
                        <>
                          {advanced && (
                            <>
                              <CheckLabel checked={entry.optional} onChange={(optional) => update(entry.slug, { optional })}>
                                <span className="small muted">{t.optional}</span>
                              </CheckLabel>
                              <Input
                                className="input-sm plugin-version"
                                placeholder={t.versionPlaceholder}
                                aria-label={t.versionAria(entry.slug)}
                                value={entry.version ?? ''}
                                onChange={(e) => update(entry.slug, { version: e.target.value.trim() || undefined })}
                              />
                            </>
                          )}
                          <Button size="sm" variant="ghost" onClick={() => setEntries((l) => l?.filter((e) => e.slug !== entry.slug))}>
                            <Icon name="trash" /> {m.common.remove}
                          </Button>
                        </>
                      }
                    />
                  ))}
                </ListView>
              )}
            </Card>

            <Card title={t.add} description={t.addDescription}>
              <SearchInput placeholder={t.searchPlaceholder} value={query} onValueChange={setQuery} />
              {searching && !hits && <Spinner />}
              {hits && hits.length > 0 && (
                <ListView label={t.resultsAria}>
                  {hits.map((hit) => (
                    <ListItem
                      key={hit.slug}
                      leading={
                        hit.iconUrl ? (
                          <img src={hit.iconUrl} alt="" width={32} height={32} loading="lazy" />
                        ) : (
                          <span className="plugin-icon">
                            <Icon name="plugins" />
                          </span>
                        )
                      }
                      title={hit.title}
                      detail={hit.description}
                      badges={<Badge>{t.downloads(formatNumber(hit.downloads))}</Badge>}
                      actions={
                        installed.has(hit.slug.toLowerCase()) ? (
                          <Badge tone="success">{t.inList}</Badge>
                        ) : (
                          <Button size="sm" onClick={() => setEntries((l) => [...(l ?? []), { slug: hit.slug, optional: true }])}>
                            <Icon name="plus" /> {t.addButton}
                          </Button>
                        )
                      }
                    />
                  ))}
                </ListView>
              )}
              {hits?.length === 0 && <EmptyState icon="search" title={t.nothingTitle} text={t.nothingText} />}
            </Card>
          </>
        )}
      </Page>

      {changed && (
        <div className="savebar">
          <span>{t.savebar}</span>
          <div className="row">
            <Button variant="ghost" onClick={() => setEntries(list.data!.entries)} disabled={saving}>
              <Icon name="undo" /> {t.discard}
            </Button>
            <Button variant="primary" onClick={save} loading={saving}>
              <Icon name="save" /> {t.saveList}
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
