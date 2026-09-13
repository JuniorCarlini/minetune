import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Icon } from '../components/icons.tsx';
import { Alert, Button, Card, CheckLabel, Input, PageHeader, useToast } from '../components/ui.tsx';
import { api } from '../lib/api.ts';

const MAX_LINES = 1500;
const ANSI = /\x1b\[[0-9;]*[A-Za-z]/g;
/** Conexões RCON do painel e do agendador de backup: úteis para debug, ruído no dia a dia. */
const RCON_NOISE = /\[RCON (Listener|Client) [^\]]*\]: Thread RCON Client/;

export function ConsolePage() {
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

  useEffect(() => {
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
      setStreamError(data || 'Conexão com os logs perdida, tentando reconectar...');
    });
    return () => source.close();
  }, []);

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

  return (
    <>
      <PageHeader title="Console" description="Logs ao vivo e comandos via RCON (sem a barra inicial)." />
      {streamError && <Alert tone="warning">{streamError}</Alert>}
      <Card
        title={
          <span className="row">
            <span className={`status-dot ${streamError ? 'status-warning' : 'status-success'}`} /> Logs do servidor
          </span>
        }
        actions={
          <>
            <CheckLabel checked={hideNoise} onChange={setHideNoise}>
              <span className="small muted">Ocultar conexões RCON</span>
            </CheckLabel>
            <CheckLabel checked={follow} onChange={setFollow}>
              <span className="small muted">Rolar automaticamente</span>
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
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="ex.: say Olá!   time set day   chunky radius 3000"
            autoComplete="off"
            spellCheck={false}
          />
          <Button type="submit" variant="primary" loading={sending} disabled={!command.trim()}>
            <Icon name="send" /> Enviar
          </Button>
        </form>
      </Card>
    </>
  );
}
