import { useEffect, useState } from 'react';
import type { ModrinthListResponse, ModrinthSearchHit } from '../../shared/api.ts';
import { formatModrinthEntry, type ModrinthEntry } from '../../shared/modrinth.ts';
import { Icon } from '../components/icons.tsx';
import { Alert, Button, Card, CheckLabel, Empty, Input, PageHeader, SearchInput, Spinner, useToast } from '../components/ui.tsx';
import { api } from '../lib/api.ts';
import { formatNumber } from '../lib/format.ts';
import { useApi } from '../lib/hooks.ts';

export function PluginsPage() {
  const list = useApi<ModrinthListResponse>('/modrinth');
  const [entries, setEntries] = useState<ModrinthEntry[]>();
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<ModrinthSearchHit[]>();
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [savedPendingRestart, setSavedPendingRestart] = useState(false);
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

  if (list.error) return <Alert tone="danger">{list.error.message}</Alert>;
  if (!list.data || !entries) return <Spinner />;

  const { loader } = list.data;
  const kind = loader === 'paper' ? 'plugins' : 'mods';
  const original = list.data.entries.map(formatModrinthEntry).join('\n');
  const changed = entries.map(formatModrinthEntry).join('\n') !== original;
  const installed = new Set(entries.map((e) => e.slug.toLowerCase()));

  const update = (slug: string, patch: Partial<ModrinthEntry>) => setEntries((l) => l?.map((e) => (e.slug === slug ? { ...e, ...patch } : e)));

  const save = async () => {
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
      toast.success('Servidor reiniciando: os downloads acontecem durante o boot');
    } catch (err) {
      toast.error(err);
    } finally {
      setRestarting(false);
    }
  };

  if (!loader) {
    return (
      <>
        <PageHeader title="Plugins e mods" />
        <Alert tone="info">O software atual (Vanilla) não suporta plugins nem mods. Troque em Configurações → Servidor.</Alert>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Plugins e mods"
        description={`Baixados do Modrinth a cada boot (config/modrinth/${loader}.txt). Remover da lista remove do servidor.`}
      />

      {savedPendingRestart && (
        <Alert tone="warning" title="Reinicie para aplicar">
          <div className="row">
            <span>A lista foi salva, mas só é aplicada no próximo boot do servidor.</span>
            <Button size="sm" variant="primary" onClick={restart} loading={restarting}>
              <Icon name="restart" /> Reiniciar agora
            </Button>
          </div>
        </Alert>
      )}

      <Card
        title={`Instalados (${entries.length})`}
        description="Opcional: se não houver versão compatível, o servidor sobe mesmo assim."
        actions={
          changed && (
            <>
              <Button variant="ghost" onClick={() => setEntries(list.data!.entries)}>
                <Icon name="undo" /> Descartar
              </Button>
              <Button variant="primary" onClick={save} loading={saving}>
                <Icon name="save" /> Salvar lista
              </Button>
            </>
          )
        }
      >
        {entries.length === 0 ? (
          <Empty>Nenhum {kind} na lista.</Empty>
        ) : (
          <ul className="list">
            {entries.map((entry) => (
              <li key={entry.slug}>
                <a href={`https://modrinth.com/project/${entry.slug}`} target="_blank" rel="noreferrer">
                  <code>{entry.slug}</code>
                </a>
                <div className="row">
                  <CheckLabel checked={entry.optional} onChange={(optional) => update(entry.slug, { optional })}>
                    <span className="small muted">opcional</span>
                  </CheckLabel>
                  <Input
                    className="input-sm"
                    placeholder="versão (última)"
                    value={entry.version ?? ''}
                    onChange={(e) => update(entry.slug, { version: e.target.value.trim() || undefined })}
                  />
                  <Button size="sm" variant="ghost" onClick={() => setEntries((l) => l?.filter((e) => e.slug !== entry.slug))}>
                    <Icon name="trash" /> Remover
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title={`Buscar ${kind} no Modrinth`} description="Filtrado pelo loader e pela versão configurados.">
        <SearchInput placeholder="Ex.: luckperms, worldedit, chunky..." value={query} onValueChange={setQuery} />
        {searching && !hits && <Spinner />}
        <ul className="list">
          {hits?.map((hit) => (
            <li key={hit.slug}>
              <div className="hit">
                {hit.iconUrl ? <img src={hit.iconUrl} alt="" width={40} height={40} loading="lazy" /> : <span className="hit-icon" />}
                <div>
                  <strong>{hit.title}</strong>{' '}
                  <span className="muted small">
                    por {hit.author} · {formatNumber(hit.downloads)} downloads
                  </span>
                  <p className="muted small">{hit.description}</p>
                </div>
              </div>
              {installed.has(hit.slug.toLowerCase()) ? (
                <span className="tuc-badge is-success">na lista</span>
              ) : (
                <Button size="sm" onClick={() => setEntries((l) => [...(l ?? []), { slug: hit.slug, optional: true }])}>
                  <Icon name="plus" /> Adicionar
                </Button>
              )}
            </li>
          ))}
        </ul>
        {hits?.length === 0 && <Empty>Nada encontrado para esta versão.</Empty>}
      </Card>
    </>
  );
}
