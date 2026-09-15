import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Icon } from '../components/icons.tsx';
import { EmptyState, Notice, Page } from '../components/page.tsx';
import { Button, Card, CheckLabel, Input, useToast } from '../components/ui.tsx';
import { api } from '../lib/api.ts';
import { useMessages } from '../lib/i18n.tsx';
import { useWorld } from '../lib/world.tsx';

const MAX_LINES = 1500;
const ANSI = /\x1b\[[0-9;]*[A-Za-z]/g;
/** Conexões RCON do painel e do agendador de backup: úteis para debug, ruído no dia a dia. */
const RCON_NOISE = /\[RCON (Listener|Client) [^\]]*\]: Thread RCON Client/;
/** Os pedidos mais comuns: preenchem o campo para a pessoa conferir antes de enviar. O "say" segue a língua. */
const COMMAND_SUGGESTIONS = ['time set day', 'weather clear', 'list'];

export function ConsolePage() {
  const m = useMessages();
  const suggestions = [m.app.console.welcomeCommand, ...COMMAND_SUGGESTIONS];
  const [lines, setLines] = useState<string[]>([]);
  const [streamError, setStreamError] = useState<string>();
  const [command, setCommand] = useState('');
  const [sending, setSending] = useState(false);
  const [follow, setFollow] = useState(true);
  const [hideNoise, setHideNoise] = useState(true);
  const history = useRef<string[]>([]);
  const historyIndex = useRef(-1);
  const logRef = useRef<HTMLPreElement>(null);
  const toast = useToast();
  const world = useWorld();
  // O registro e os comandos são do mundo que está rodando: num mundo guardado nem conecta.
  const live = world.ready && world.isActive;

  useEffect(() => {
    if (!live) return;
    const source = new EventSource('/api/console/logs');
    source.onmessage = (event) => {
      setStreamError(undefined);
      setLines((current) => {
        const next = [...current, (event.data as string).replace(ANSI, '')];
        return next.length > MAX_LINES ? next.slice(-MAX_LINES) : next;
      });
    };
    source.addEventListener('error', (event) => {
      const data = (event as MessageEvent).data as string | undefined;
      setStreamError(data || m.app.console.streamLost);
    });
    return () => source.close();
    // A mensagem de erro não reconecta o registro: trocar de língua não deve abrir outra conexão.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live]);

  useEffect(() => {
    if (follow) logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [lines, follow, hideNoise]);

  const send = async (event: FormEvent) => {
    event.preventDefault();
    const text = command.trim();
    if (!text) return;
    setSending(true);
    try {
      const { output } = await api.post<{ output: string }>('/console', { command: text });
      setLines((current) => [...current, `> ${text}`, ...(output ? output.split('\n') : [])]);
      history.current = [text, ...history.current.filter((h) => h !== text)].slice(0, 50);
      historyIndex.current = -1;
      setCommand('');
    } catch (err) {
      toast.error(err);
    } finally {
      setSending(false);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    const delta = event.key === 'ArrowUp' ? 1 : -1;
    const next = Math.max(-1, Math.min(history.current.length - 1, historyIndex.current + delta));
    historyIndex.current = next;
    setCommand(next === -1 ? '' : history.current[next]!);
  };

  if (world.ready && !world.isActive) {
    const runningName = world.worlds.find((w) => w.active)?.name ?? world.active;
    return (
      <Page title={m.app.console.title} description={m.app.console.description}>
        <EmptyState
          icon="console"
          title={m.app.console.storedTitle}
          text={m.app.console.storedText(runningName)}
          action={
            <Button onClick={() => world.select(world.active)}>
              <Icon name="arrowRight" /> {m.app.console.goTo(runningName)}
            </Button>
          }
        />
      </Page>
    );
  }

  return (
    <Page title={m.app.console.title} description={m.app.console.description}>
      <Notice tone="warning">{m.app.console.warning}</Notice>
      {streamError && <Notice tone="warning">{streamError}</Notice>}

      <Card
        title={
          <span className="row">
            <span className={`status-dot ${streamError ? 'status-warning' : 'status-success'}`} /> {m.app.console.log}
          </span>
        }
        actions={
          <>
            <CheckLabel checked={hideNoise} onChange={setHideNoise}>
              <span className="small muted">{m.app.console.hideNoise}</span>
            </CheckLabel>
            <CheckLabel checked={follow} onChange={setFollow}>
              <span className="small muted">{m.app.console.follow}</span>
            </CheckLabel>
          </>
        }
      >
        <pre ref={logRef} className="log terminal">
          {(hideNoise ? lines.filter((line) => !RCON_NOISE.test(line)) : lines).join('\n')}
        </pre>
        <form className="row console-input" onSubmit={send}>
          <span className="prompt">&gt;</span>
          <Input
            id="console-command"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={m.app.console.placeholder}
            aria-label={m.app.console.command}
            autoComplete="off"
            spellCheck={false}
          />
          <Button type="submit" variant="primary" loading={sending} disabled={!command.trim()}>
            <Icon name="send" /> {m.app.console.send}
          </Button>
        </form>
        <div className="chips" role="group" aria-label={m.app.console.suggestions}>
          {suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              className="chip"
              onClick={() => {
                setCommand(suggestion);
                // Input do painel não repassa ref: foca pelo id.
                document.getElementById('console-command')?.focus();
              }}
            >
              <code>{suggestion}</code>
            </button>
          ))}
        </div>
      </Card>
    </Page>
  );
}
