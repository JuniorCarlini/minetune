/**
 * Tipos mínimos do Tucano (o pacote é JavaScript puro, sem .d.ts).
 * Cobrem só o que o painel usa; a API completa está em node_modules/tucano/llms.txt.
 */
declare module 'tucano' {
  export interface ToastOptions {
    type?: 'info' | 'success' | 'warning' | 'error' | 'loading';
    title?: string | null;
    text?: string;
    duration?: number | null;
    position?: 'top-start' | 'top-center' | 'top-end' | 'bottom-start' | 'bottom-center' | 'bottom-end';
    closable?: boolean;
    action?: { text: string; onClick: () => void } | null;
  }

  export interface ToastInstance {
    update(options: ToastOptions): void;
    close(): void;
  }

  type ToastShortcut = (text: string, extra?: ToastOptions) => ToastInstance;

  export const toast: ((optionsOrText: ToastOptions | string, extra?: ToastOptions) => ToastInstance) & {
    info: ToastShortcut;
    success: ToastShortcut;
    warning: ToastShortcut;
    error: ToastShortcut;
    loading: ToastShortcut;
  };

  export interface DialogInstance {
    opts: { onClose: ((reason: string) => void) | null; closable: boolean; closeOnBackdrop: boolean };
    node: HTMLDialogElement;
    open(): DialogInstance;
    close(reason?: string): void;
  }

  /** Adota `dialog.tuc-modal` escritos no DOM (o painel usa isso com JSX). */
  export function autoInitModals(scope: ParentNode): DialogInstance[];

  export interface SelectOptions {
    search?: boolean;
    placeholder?: string;
    clearable?: boolean;
    placement?: string;
    onChange?: (value: string | string[] | null) => void;
  }

  export class Select {
    constructor(target: HTMLSelectElement, options?: SelectOptions);
    getValue(): string | string[] | null;
    setValue(value: string | string[], options?: { silent?: boolean }): void;
    refresh(): void;
    destroy(): void;
  }

  export class Tooltip {
    constructor(target: HTMLElement, options?: { text?: string; placement?: string; delay?: number });
    setText(text: string): void;
    destroy(): void;
  }
}

declare module 'tucano/css';
