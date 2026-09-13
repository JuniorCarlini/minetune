import { useEffect, useState } from 'react';
import type { ModrinthListResponse, ModrinthSearchHit } from '../../shared/api.ts';
import { formatModrinthEntry, type ModrinthEntry } from '../../shared/modrinth.ts';
import { Icon } from '../components/icons.tsx';
import { AdvancedToggle, EmptyState, ListItem, ListView, Notice, Page, useAdvancedMode } from '../components/page.tsx';
import { Badge, Button, Card, CheckLabel, Input, SearchInput, Spinner, useToast } from '../components/ui.tsx';
import { api } from '../lib/api.ts';
import { formatNumber } from '../lib/format.ts';
import { useApi } from '../lib/hooks.ts';
import './Plugins.css';

export function PluginsPage() {
  const list = useApi<ModrinthListResponse>('/modrinth');
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
        const result = await api.get<{ hits: ModrinthSearchHit[] }>(`/modrinth/search?q=${encodeURIComponent(query)}`);
        setHits(result.hits);
      } catch (err) {
        toast.error(err);
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, list.data?.loader]);

  const loader = list.data?.loader;
  const kind = loader === 'paper' ? 'plugin' : 'mod';
  const kindPlural = `${kind}s`;

  const save = async () => {
    if (!entries) return;
    setSaving(true);
    try {
      await api.put('/modrinth', { entries: entries.map(formatModrinthEntry) });
      await list.reload();
      setSavedPendingRestart(true);
      toast.success('Lista salva');
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
      toast.success('Servidor reiniciando: os downloads acontecem enquanto ele liga');
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
        title="Plugins e mods"
        description="Adicione recursos ao servidor. Tudo é baixado do Modrinth."
        actions={<AdvancedToggle />}
        loading={!ready && !list.error}
        error={!ready ? list.error?.message : undefined}
        onRetry={list.reload}
      >
        {ready && !loader && (
          <EmptyState
            icon="plugins"
            title="Este tipo de servidor não aceita plugins nem mods"
            text="O Vanilla é o servidor oficial, sem extensões. Troque para Paper (plugins) ou Fabric (mods)."
            action={
              <a className="tuc-btn is-outline" href="#/settings">
                <Icon name="settings" /> Trocar tipo de servidor
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
                    <Icon name="restart" /> Reiniciar agora
                  </Button>
                }
              >
                As mudanças valem quando o servidor reiniciar.
              </Notice>
            )}

            <Card title="Instalados" description={`${entries!.length} ${entries!.length === 1 ? kind : kindPlural}`}>
              {entries!.length === 0 ? (
                <EmptyState icon="plugins" title={`Nenhum ${kind} instalado`} text="Busque abaixo e adicione." />
              ) : (
                <ListView label="Instalados">
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
                      detail={[
                        entry.optional ? 'opcional: o servidor sobe mesmo sem versão compatível' : 'obrigatório',
                        entry.version ? `versão ${entry.version}` : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                      actions={
                        <>
                          {advanced && (
                            <>
                              <CheckLabel checked={entry.optional} onChange={(optional) => update(entry.slug, { optional })}>
                                <span className="small muted">opcional</span>
                              </CheckLabel>
                              <Input
                                className="input-sm plugin-version"
                                placeholder="versão (última)"
                                aria-label={`Versão de ${entry.slug}`}
                                value={entry.version ?? ''}
                                onChange={(e) => update(entry.slug, { version: e.target.value.trim() || undefined })}
                              />
                            </>
                          )}
                          <Button size="sm" variant="ghost" onClick={() => setEntries((l) => l?.filter((e) => e.slug !== entry.slug))}>
                            <Icon name="trash" /> Remover
                          </Button>
                        </>
                      }
                    />
                  ))}
                </ListView>
              )}
            </Card>

            <Card title="Adicionar" description="Só aparecem os compatíveis com a versão do servidor">
              <SearchInput placeholder="Buscar: mapa, proteção, economia…" value={query} onValueChange={setQuery} />
              {searching && !hits && <Spinner />}
              {hits && hits.length > 0 && (
                <ListView label="Resultados da busca">
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
                      badges={<Badge>{formatNumber(hit.downloads)} downloads</Badge>}
                      actions={
                        installed.has(hit.slug.toLowerCase()) ? (
                          <Badge tone="success">na lista</Badge>
                        ) : (
                          <Button size="sm" onClick={() => setEntries((l) => [...(l ?? []), { slug: hit.slug, optional: true }])}>
                            <Icon name="plus" /> Adicionar
                          </Button>
                        )
                      }
                    />
                  ))}
                </ListView>
              )}
              {hits?.length === 0 && <EmptyState icon="search" title="Nada encontrado para esta versão" text="Tente outra palavra ou confira a versão em Configurações." />}
            </Card>
          </>
        )}
      </Page>

      {changed && (
        <div className="savebar">
          <span>Lista alterada · vale após reiniciar</span>
          <div className="row">
            <Button variant="ghost" onClick={() => setEntries(list.data!.entries)} disabled={saving}>
              <Icon name="undo" /> Descartar
            </Button>
            <Button variant="primary" onClick={save} loading={saving}>
              <Icon name="save" /> Salvar lista
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
