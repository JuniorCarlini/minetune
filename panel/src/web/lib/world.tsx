/**
 * Mundo que o painel está mostrando. O seletor da barra lateral escolhe; as telas pedem
 * os dados dele (?world=) e gravam nele. Escolher não liga nada: o mundo ligado só muda
 * por "Ligar este mundo". A escolha fica salva neste navegador.
 */

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { WorldInfo, WorldsResponse } from '../../shared/worlds.ts';
import { useApi } from './hooks.ts';

const STORAGE_KEY = 'minetune-world';

export interface WorldContextValue {
  /** Lista carregada: antes disso as telas esperam, para não mostrar o mundo errado. */
  ready: boolean;
  data?: WorldsResponse;
  worlds: WorldInfo[];
  /** Pasta do mundo na tela. */
  selected: string;
  selectedWorld?: WorldInfo;
  /** Pasta do mundo ligado no servidor. */
  active: string;
  isActive: boolean;
  select(folder: string): void;
  reload(): Promise<void>;
  /** Caminho da API para o mundo na tela: acrescenta ?world= quando é um guardado. */
  path(path: string): string;
}

const WorldContext = createContext<WorldContextValue | null>(null);

function readStored(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

export function WorldProvider({ children }: { children: ReactNode }) {
  const { data, reload } = useApi<WorldsResponse>('/worlds', 30_000);
  const [stored, setStored] = useState(readStored);

  const select = useCallback((folder: string) => {
    setStored(folder);
    try {
      localStorage.setItem(STORAGE_KEY, folder);
    } catch {
      // armazenamento bloqueado: a escolha vale só nesta aba
    }
  }, []);

  const value = useMemo<WorldContextValue>(() => {
    const worlds = data?.worlds ?? [];
    const active = data?.active ?? '';
    // Mundo escolhido que sumiu (renomeado ou apagado) volta para o ligado.
    const selected = stored && worlds.some((w) => w.folder === stored) ? stored : active;
    const isActive = selected === active;
    return {
      ready: !!data,
      data,
      worlds,
      selected,
      selectedWorld: worlds.find((w) => w.folder === selected),
      active,
      isActive,
      select,
      reload,
      path: (path) => (isActive ? path : `${path}${path.includes('?') ? '&' : '?'}world=${encodeURIComponent(selected)}`),
    };
  }, [data, stored, select, reload]);

  return <WorldContext.Provider value={value}>{children}</WorldContext.Provider>;
}

export function useWorld(): WorldContextValue {
  const value = useContext(WorldContext);
  if (!value) throw new Error('useWorld precisa estar dentro do WorldProvider');
  return value;
}
