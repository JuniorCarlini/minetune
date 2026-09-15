/**
 * Componentes base do painel, todos sobre o Tucano.
 *
 * Classe CSS (botão, badge, campo, checkbox) vira JSX direto. O que tem
 * JavaScript no Tucano (Select, Modal, Tooltip, Toast) ganha um invólucro que
 * cria a instância no mount e destrói no unmount — o DOM continua sendo do
 * React, o Tucano só enriquece.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { autoInitDrawers, autoInitModals, Select, toast, Tooltip, type DialogInstance } from 'tucano';
import type { JobInfo } from '../../shared/api.ts';
import { useJob } from '../lib/hooks.ts';
import { useMessages } from '../lib/i18n.tsx';
import { Icon } from './icons.tsx';
import { GRASS_BLOCK, PixelGrid } from './logos.tsx';

// --- Botão e etiqueta (classes do Tucano) ------------------------------------------------

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: 'is-primary',
  secondary: 'is-outline',
  danger: 'is-danger',
  ghost: 'is-ghost',
};

export function Button({
  variant = 'secondary',
  size,
  loading = false,
  block = false,
  iconOnly = false,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  ref?: React.Ref<HTMLButtonElement>;
  variant?: ButtonVariant;
  size?: 'sm' | 'lg';
  loading?: boolean;
  block?: boolean;
  iconOnly?: boolean;
}) {
  const classes = [
    'tuc-btn',
    VARIANT_CLASS[variant],
    size ? `is-${size}` : '',
    block ? 'is-block' : '',
    iconOnly ? 'is-icon' : '',
    className ?? '',
  ].filter(Boolean);

  return (
    <button {...props} type={props.type ?? 'button'} className={classes.join(' ')} disabled={props.disabled || loading} aria-busy={loading || undefined}>
      {loading && <span className="spinner" aria-hidden />}
      {props.children}
    </button>
  );
}

export type Tone = 'success' | 'warning' | 'danger' | 'neutral' | 'info';

export function Badge({ tone = 'neutral', plain = false, children }: { tone?: Tone; plain?: boolean; children: ReactNode }) {
  const toneClass = tone === 'neutral' ? '' : `is-${tone}`;
  return <span className={['tuc-badge', toneClass, plain ? 'is-plain' : ''].filter(Boolean).join(' ')}>{children}</span>;
}

/** Carregamento no estilo Minecraft: bloco de grama pulando e barra de blocos acendendo. */
export function Spinner({ label }: { label?: string }) {
  const m = useMessages();
  return (
    <div className="mc-loader" role="status" aria-live="polite">
      <div className="mc-loader-block">
        <PixelGrid grid={GRASS_BLOCK} size={40} className="pixel-logo" />
      </div>
      <div className="mc-loader-bar" aria-hidden>
        {Array.from({ length: 10 }, (_, i) => (
          <span key={i} style={{ '--i': i } as React.CSSProperties} />
        ))}
      </div>
      <span className="mc-loader-label">{label ?? m.app.loading}</span>
    </div>
  );
}

// --- Estrutura -------------------------------------------------------------------------------

export function Card({
  title,
  description,
  actions,
  children,
  className,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`card ${className ?? ''}`}>
      {(title || actions) && (
        <div className="card-header">
          <div>
            {title && <h2>{title}</h2>}
            {description && <p className="muted small">{description}</p>}
          </div>
          {actions && <div className="row">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function Alert({ tone = 'info', title, children }: { tone?: Tone; title?: string; children?: ReactNode }) {
  return (
    <div className={`alert alert-${tone}`} role={tone === 'danger' ? 'alert' : undefined}>
      {title && <strong>{title}</strong>}
      {children && <div>{children}</div>}
    </div>
  );
}

// --- Campos --------------------------------------------------------------------------------

export function Input({ className, invalid, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return <input {...props} className={['tuc-input', invalid ? 'is-invalid' : '', className ?? ''].filter(Boolean).join(' ')} />;
}

/** Busca com botão de limpar próprio: o X nativo do navegador não aceita borda nem estilo. */
export function SearchInput({
  value,
  onValueChange,
  ...props
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & { value: string; onValueChange: (value: string) => void }) {
  const m = useMessages();
  return (
    <label className="tuc-input-group search-input">
      <Icon name="search" size={16} />
      <input type="search" {...props} className="tuc-input" value={value} onChange={(e) => onValueChange(e.target.value)} />
      {value && (
        <button type="button" className="tuc-btn is-outline is-icon is-sm search-clear" aria-label={m.app.clearSearch} onClick={() => onValueChange('')}>
          <Icon name="x" size={16} />
        </button>
      )}
    </label>
  );
}

/**
 * Interruptor no estilo das opções do Minecraft Bedrock: trilho retangular,
 * bloco que desliza, marcas I (ligado) e O (desligado).
 *
 * Por baixo é um <input type="checkbox" role="switch"> invisível cobrindo o
 * desenho: teclado, foco, leitor de tela e clique no <label> vêm do nativo, sem
 * depender de ::before em input (que o Firefox não desenha).
 */
export function Toggle({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <span className={`mc-switch ${disabled ? 'is-disabled' : ''}`}>
      <input
        type="checkbox"
        role="switch"
        aria-label={label}
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="mc-switch-track" aria-hidden>
        <span className="mc-switch-mark mc-switch-on" />
        <span className="mc-switch-mark mc-switch-off" />
        <span className="mc-switch-knob" />
      </span>
    </span>
  );
}

export function CheckLabel({ checked, onChange, children }: { checked: boolean; onChange: (checked: boolean) => void; children: ReactNode }) {
  return (
    <label className="check-label">
      <Toggle checked={checked} onChange={onChange} />
      <span>{children}</span>
    </label>
  );
}

/**
 * Select do Tucano sobre um <select> nativo. A primeira <option value="">
 * vira placeholder; limpar (X) devolve string vazia, que no painel significa
 * "usar o padrão do servidor".
 */
export function TucSelect({
  id,
  value,
  options,
  placeholder,
  clearable = true,
  onChange,
}: {
  id?: string;
  value: string;
  options: { value: string; label: string }[];
  placeholder: string;
  /** false quando sempre há uma escolha e o X de limpar não teria o que fazer. */
  clearable?: boolean;
  onChange: (value: string) => void;
}) {
  const nativeRef = useRef<HTMLSelectElement>(null);
  const instance = useRef<Select | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const node = nativeRef.current!;
    instance.current = new Select(node, {
      placeholder,
      // Dentro de um modal a lista abre no próprio <dialog>: desde a Tucano 0.32 o Select faz isso sozinho.
      clearable,
      search: options.length > 8,
      onChange: (next) => onChangeRef.current(typeof next === 'string' ? next : ''),
    });
    return () => {
      instance.current?.destroy();
      instance.current = null;
    };
    // Instância criada uma vez; mudanças de valor e opções são sincronizadas abaixo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const optionsKey = options.map((o) => `${o.value}:${o.label}`).join('|');
  useEffect(() => {
    instance.current?.refresh();
  }, [optionsKey]);

  useEffect(() => {
    const select = instance.current;
    if (select && (select.getValue() ?? '') !== value) select.setValue(value, { silent: true });
  }, [value]);

  return (
    <select id={id} ref={nativeRef} defaultValue={value}>
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** Dica do Tucano presa a um elemento. Uso: `<button ref={useTip('Copiar')}>`. */
export function useTip<T extends HTMLElement>(text: string) {
  const tip = useRef<Tooltip | null>(null);
  const node = useRef<T | null>(null);

  useEffect(() => {
    tip.current?.setText(text);
  }, [text]);

  return useCallback(
    (el: T | null) => {
      if (el === node.current) return;
      tip.current?.destroy();
      tip.current = null;
      node.current = el;
      if (el) tip.current = new Tooltip(el, { text });
    },
    // O texto é atualizado pelo efeito acima, sem recriar a dica.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
}

/**
 * "?" ao lado do nome de uma opção: explicação e, entre parênteses, o nome técnico
 * (variável ou regra do jogo). Fica fora da tela para não confundir quem não precisa dele.
 */
export function HelpTip({ text, technical }: { text?: string; technical?: string }) {
  const m = useMessages();
  const full = [text, technical && `(${technical})`].filter(Boolean).join(' ');
  const tip = useTip<HTMLButtonElement>(full);
  if (!full) return null;
  return (
    <button ref={tip} type="button" className="help-tip" aria-label={m.common.help(full)}>
      ?
    </button>
  );
}

// --- Modal (dialog.tuc-modal adotado pelo Tucano) ---------------------------------------------

export function Modal({
  open,
  title,
  text,
  tone = 'default',
  size = 'md',
  children,
  footer,
  onClose,
}: {
  open: boolean;
  title: string;
  text?: string;
  tone?: 'default' | 'danger' | 'warning' | 'success';
  size?: 'sm' | 'md' | 'lg';
  children?: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
}) {
  const m = useMessages();
  const hostRef = useRef<HTMLDivElement>(null);
  const instance = useRef<DialogInstance | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    // Refs sobrevivem ao mount duplo do StrictMode: adota uma vez só.
    if (!instance.current && hostRef.current) {
      const [adopted] = autoInitModals(hostRef.current);
      if (adopted) {
        adopted.opts.onClose = () => onCloseRef.current();
        instance.current = adopted;
      }
    }
    const modal = instance.current as (DialogInstance & { isOpen?: boolean }) | null;
    if (!modal) return;
    if (open && !modal.isOpen) modal.open();
    if (!open && modal.isOpen) modal.close('api');
  }, [open]);

  return (
    <div ref={hostRef} style={{ display: 'contents' }}>
      {/* Sem is-sheet: no celular o modal fica centralizado, como no computador, e não sobe do rodapé. */}
      <dialog className={`tuc-modal is-${size} is-${tone}`}>
        <div className="tuc-modal__panel">
          <div className="tuc-modal__top">
            <div className="tuc-modal__header">
              <h2 className="tuc-modal__title">{title}</h2>
              {text && <p className="tuc-modal__text">{text}</p>}
            </div>
            <button type="button" className="tuc-btn is-outline is-icon is-sm tuc-modal__close" aria-label={m.common.close} data-tuc-modal-close>
              <Icon name="x" size={16} />
            </button>
          </div>
          <div className="tuc-modal__body">{open ? children : null}</div>
          {footer && <div className="tuc-modal__footer">{footer}</div>}
        </div>
      </dialog>
    </div>
  );
}

// --- Gaveta / off-canvas (dialog.tuc-drawer adotado pelo Tucano) --------------------------------

/**
 * Painel que entra por uma borda, com o motor do modal do Tucano: animação, foco preso, Esc,
 * fundo escurecido e a página de trás parada. O conteúdo fica montado mesmo fechada.
 */
export function Drawer({
  open,
  title,
  side = 'left',
  size = 'sm',
  className = '',
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  side?: 'left' | 'right' | 'top' | 'bottom';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  children?: ReactNode;
  onClose: () => void;
}) {
  const m = useMessages();
  const hostRef = useRef<HTMLDivElement>(null);
  const instance = useRef<DialogInstance | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    // Mesmo cuidado do Modal: o StrictMode monta duas vezes, a gaveta é adotada uma só.
    if (!instance.current && hostRef.current) {
      const [adopted] = autoInitDrawers(hostRef.current);
      if (adopted) {
        adopted.opts.onClose = () => onCloseRef.current();
        instance.current = adopted;
      }
    }
    const drawer = instance.current as (DialogInstance & { isOpen?: boolean }) | null;
    if (!drawer) return;
    if (open && !drawer.isOpen) drawer.open();
    if (!open && drawer.isOpen) drawer.close('api');
  }, [open]);

  return (
    <div ref={hostRef} style={{ display: 'contents' }}>
      <dialog className={`tuc-drawer is-${side} is-${size} is-default ${className}`.trim()}>
        <div className="tuc-drawer__panel">
          <div className="tuc-drawer__top">
            <div className="tuc-drawer__header">
              <h2 className="tuc-drawer__title">{title}</h2>
            </div>
            <button type="button" className="tuc-btn is-outline is-icon is-sm tuc-drawer__close" aria-label={m.common.close} data-tuc-drawer-close>
              <Icon name="x" size={16} />
            </button>
          </div>
          <div className="tuc-drawer__body">{children}</div>
        </div>
      </dialog>
    </div>
  );
}

export function Progress({ value }: { value: number | undefined }) {
  const pct = Math.round((value ?? 0) * 100);
  return (
    <div className="progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div style={{ width: `${pct}%` }} />
    </div>
  );
}

// --- Jobs ------------------------------------------------------------------------------------

export function JobPanel({ jobId, onFinish }: { jobId: string; onFinish?: (job: JobInfo) => void }) {
  const m = useMessages();
  const job = useJob(jobId, onFinish);
  const logRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [job?.logs.length]);

  if (!job) {
    return (
      <Card>
        <Spinner />
      </Card>
    );
  }

  const tone: Tone = job.status === 'succeeded' ? 'success' : job.status === 'failed' ? 'danger' : 'info';
  const label = job.status === 'running' ? m.app.jobStatus.running : job.status === 'succeeded' ? m.app.jobStatus.succeeded : m.app.jobStatus.failed;

  return (
    <Card title={m.app.jobs[job.kind]} actions={<Badge tone={tone}>{label}</Badge>}>
      {job.status === 'running' && <Progress value={job.progress} />}
      {job.error && <Alert tone="danger">{job.error}</Alert>}
      <pre ref={logRef} className="log small">
        {job.logs.join('\n')}
      </pre>
    </Card>
  );
}

// --- Toasts (Tucano) ---------------------------------------------------------------------------

/** Mantido para não mudar a árvore do App; os toasts do Tucano não precisam de provider. */
export function ToastProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

/** Todas as notificações do painel saem no centro, embaixo. */
const TOAST_POSITION = 'bottom-center' as const;

export function useToast() {
  return {
    success: (message: string) => toast.success(message, { position: TOAST_POSITION }),
    error: (err: unknown) => toast.error(err instanceof Error ? err.message : String(err), { position: TOAST_POSITION }),
    info: (message: string) => toast.info(message, { position: TOAST_POSITION }),
  };
}

/** Estado controlado por string, útil para formulários simples. */
export function useField(initial = '') {
  const [value, setValue] = useState(initial);
  return { value, setValue, bind: { value, onChange: (e: React.ChangeEvent<HTMLInputElement>) => setValue(e.target.value) } };
}
