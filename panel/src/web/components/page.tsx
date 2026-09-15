/**
 * Peças de estrutura compartilhadas por todas as telas (padrão da planta de telas).
 *
 * Toda página segue a mesma ordem: caminho (subpáginas), título com uma frase,
 * ações da página, avisos, cartões e, em formulários, a barra de salvar. O
 * cabeçalho aparece sempre, até durante o carregamento, para nada pular de
 * lugar quando os dados chegam. Nenhuma tela desenha a própria versão destas peças.
 */

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useMessages } from '../lib/i18n.tsx';
import { Icon, type IconName } from './icons.tsx';
import { Button, Spinner, Toggle } from './ui.tsx';

// --- Página ---------------------------------------------------------------------------------

export interface Crumb {
  label: string;
  href?: string;
}

export function Page({
  title,
  description,
  crumbs,
  actions,
  loading = false,
  error,
  onRetry,
  children,
}: {
  title: string;
  description?: ReactNode;
  /** Só em subpáginas: [{ label: 'Backups', href: '#/backups' }, { label: 'Onde guardar' }]. */
  crumbs?: Crumb[];
  /** Ações que valem para a página inteira. A principal vai por último. */
  actions?: ReactNode;
  loading?: boolean;
  /** Mensagem de erro ao carregar; aparece no lugar do conteúdo. */
  error?: string;
  onRetry?: () => void;
  children?: ReactNode;
}) {
  const m = useMessages();
  return (
    <>
      {crumbs && crumbs.length > 0 && (
        <nav className="crumbs" aria-label={m.app.page.crumbs}>
          {crumbs.map((crumb, i) => (
            <span key={crumb.label} className="crumbs-item">
              {i > 0 && <span aria-hidden>/</span>}
              {crumb.href ? <a href={crumb.href}>{crumb.label}</a> : <span aria-current="page">{crumb.label}</span>}
            </span>
          ))}
        </nav>
      )}
      <header className="page-header">
        <div>
          <h1>{title}</h1>
          {description && <p className="muted">{description}</p>}
        </div>
        {actions && <div className="row">{actions}</div>}
      </header>
      {error ? (
        <EmptyState
          icon="refresh"
          title={m.app.page.loadError}
          text={error}
          action={
            onRetry && (
              <Button onClick={onRetry}>
                <Icon name="refresh" /> {m.common.retry}
              </Button>
            )
          }
        />
      ) : loading ? (
        <Spinner />
      ) : (
        <div className="page-body">{children}</div>
      )}
    </>
  );
}

// --- Lista vazia -------------------------------------------------------------------------------

/** Sempre com ícone, o que falta e, quando fizer sentido, a próxima ação. */
export function EmptyState({ icon, title, text, action }: { icon: IconName; title: string; text?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Icon name={icon} size={18} />
      </span>
      <strong>{title}</strong>
      {text && <span className="muted small">{text}</span>}
      {action && <div className="empty-action">{action}</div>}
    </div>
  );
}

// --- Aviso -------------------------------------------------------------------------------------

export type NoticeTone = 'info' | 'success' | 'warning' | 'danger';

/** Uma frase com o problema (ou a confirmação) e o botão que resolve. */
export function Notice({ tone = 'info', title, children, action }: { tone?: NoticeTone; title?: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className={`notice notice-${tone}`} role={tone === 'danger' ? 'alert' : undefined}>
      <div className="notice-text">
        {title && <strong>{title}</strong>}
        {children && <span>{children}</span>}
      </div>
      {action && <div className="notice-action">{action}</div>}
    </div>
  );
}

// --- Lista -------------------------------------------------------------------------------------

export function ListView({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <ul className="list-view" aria-label={label}>
      {children}
    </ul>
  );
}

/**
 * Uma linha de lista: ícone ou avatar, nome, detalhe, etiquetas de estado e ações à direita.
 * Jogadores, plugins, resultados de busca e cópias de segurança usam esta mesma linha.
 */
export function ListItem({
  leading,
  title,
  detail,
  badges,
  actions,
}: {
  leading?: ReactNode;
  title: ReactNode;
  detail?: ReactNode;
  badges?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <li className="list-item">
      {leading && <span className="list-item-leading">{leading}</span>}
      <span className="list-item-text">
        <span className="list-item-title">{title}</span>
        {detail && <span className="list-item-detail">{detail}</span>}
      </span>
      {badges && <span className="list-item-badges">{badges}</span>}
      {actions && <span className="list-item-actions">{actions}</span>}
    </li>
  );
}

/** Cabeça em blocos com a inicial e uma cor estável derivada do nick. */
export function Avatar({ name }: { name: string }) {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return (
    <span className="avatar" style={{ '--avatar-hue': hash % 360 } as React.CSSProperties} aria-hidden>
      {name.replace(/^\./, '').charAt(0).toUpperCase()}
    </span>
  );
}

// --- Linha de opção ---------------------------------------------------------------------------

// --- Modo avançado -------------------------------------------------------------------------------

const ADVANCED_KEY = 'minetune.advanced';
const ADVANCED_EVENT = 'minetune:advanced';

const readAdvanced = () => {
  try {
    return localStorage.getItem(ADVANCED_KEY) === '1';
  } catch {
    return false;
  }
};

/**
 * "Mostrar opções avançadas": uma preferência só para o painel inteiro, lembrada neste
 * navegador. Esconde nomes de variáveis, comandos e opções que leigos não devem mexer.
 */
export function useAdvancedMode(): [boolean, (value: boolean) => void] {
  const [advanced, setAdvanced] = useState(readAdvanced);
  useEffect(() => {
    const sync = () => setAdvanced(readAdvanced());
    window.addEventListener(ADVANCED_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(ADVANCED_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);
  const set = (value: boolean) => {
    try {
      localStorage.setItem(ADVANCED_KEY, value ? '1' : '0');
    } catch {
      // Sem armazenamento: vale só nesta visita.
    }
    setAdvanced(value);
    window.dispatchEvent(new Event(ADVANCED_EVENT));
  };
  return [advanced, set];
}

export function AdvancedToggle() {
  const m = useMessages();
  const [advanced, setAdvanced] = useAdvancedMode();
  return (
    <label className="advanced-toggle">
      <Toggle checked={advanced} onChange={setAdvanced} label={m.app.page.advancedShow} />
      <span className="small muted">{m.app.page.advanced}</span>
    </label>
  );
}

// --- Menu "Mais" -----------------------------------------------------------------------------------

export interface MenuAction {
  label: string;
  icon: IconName;
  onSelect: () => void;
  tone?: 'danger';
  disabled?: boolean;
}

/**
 * Ações de um item quando passam de duas, ou quando são de risco (expulsar, banir).
 * Fecha com Esc, clique fora ou ao escolher; o foco volta para o botão.
 */
export function ActionMenu({ label, items, busy = false }: { label?: string; items: MenuAction[]; busy?: boolean }) {
  const m = useMessages();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLSpanElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    root.current?.querySelector<HTMLButtonElement>('[role=menuitem]:not(:disabled)')?.focus();
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <span className="action-menu" ref={root}>
      <Button ref={trigger} size="sm" loading={busy} aria-haspopup="menu" aria-expanded={open} aria-controls={menuId} onClick={() => setOpen((o) => !o)}>
        {label ?? m.app.page.more} <Icon name="chevron" size={16} />
      </Button>
      {open && (
        <span className="action-menu-list" role="menu" id={menuId}>
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              className={`action-menu-item ${item.tone === 'danger' ? 'is-danger' : ''}`}
              disabled={item.disabled}
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
            >
              <Icon name={item.icon} /> {item.label}
            </button>
          ))}
        </span>
      )}
    </span>
  );
}

// --- Números e barras (tela Início) ----------------------------------------------------------------

/** Número em frase, com barra opcional: "75% usada", nunca só "3.2G/4G". */
export function StatTile({
  icon,
  label,
  value,
  detail,
  tone,
  bar,
  children,
}: {
  icon: IconName;
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  tone?: 'success' | 'warning' | 'danger';
  /** 0 a 1 */
  bar?: number;
  children?: ReactNode;
}) {
  return (
    <div className={`stat-tile ${tone ? `stat-${tone}` : ''}`}>
      <span className="stat-tile-label">
        <Icon name={icon} size={16} /> {label}
      </span>
      <strong className="stat-tile-value">{value}</strong>
      {bar !== undefined && (
        <span className="stat-bar" role="presentation">
          <span style={{ width: `${Math.round(Math.min(1, Math.max(0, bar)) * 100)}%` }} />
        </span>
      )}
      {detail && <span className="stat-tile-detail">{detail}</span>}
      {children}
    </div>
  );
}
