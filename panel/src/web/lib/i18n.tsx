import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { INTL_LOCALE, LOCALES, matchLocale, messages, type Locale, type Messages } from '../../shared/i18n/index.ts';

const STORAGE_KEY = 'minetune-lang';

function detect(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && (LOCALES as readonly string[]).includes(saved)) return saved as Locale;
  } catch {
    // Navegador sem localStorage (aba privada bloqueada): segue pelo idioma dele.
  }
  return matchLocale(navigator.languages?.join(',') || navigator.language);
}

/**
 * Língua atual fora do React: a API manda no cabeçalho e as funções de data usam no Intl.
 * O provedor atualiza este valor antes de renderizar de novo.
 */
let current: Locale = detect();
document.documentElement.lang = current;

export function currentLocale(): Locale {
  return current;
}

export function intlLocale(): string {
  return INTL_LOCALE[current];
}

interface I18nValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  m: Messages;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(current);

  const setLocale = useCallback((next: Locale) => {
    current = next;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Sem onde guardar: vale só nesta aba.
    }
    setLocaleState(next);
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo(() => ({ locale, setLocale, m: messages(locale) }), [locale, setLocale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n precisa estar dentro de <I18nProvider>');
  return value;
}

/** Atalho para os textos: `const m = useMessages(); m.players.title`. */
export function useMessages(): Messages {
  return useI18n().m;
}
