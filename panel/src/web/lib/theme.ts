/**
 * Tema claro/escuro seguindo a convenção do Tucano:
 *   - sistema: <html data-tuc-theme="auto">
 *   - forçado: classe .dark no <html> (ou ausência dela no claro)
 */

export type ThemeMode = 'system' | 'light' | 'dark';

const KEY = 'minetune-theme';

export function getStoredTheme(): ThemeMode {
  try {
    const value = localStorage.getItem(KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
}

export function applyTheme(mode: ThemeMode): void {
  const root = document.documentElement;
  root.classList.toggle('dark', mode === 'dark');
  if (mode === 'system') root.setAttribute('data-tuc-theme', 'auto');
  else root.removeAttribute('data-tuc-theme');
  root.dataset.theme = mode;
  try {
    if (mode === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, mode);
  } catch {
    // armazenamento bloqueado: o tema vale só nesta sessão
  }
}

export function applyStoredTheme(): void {
  applyTheme(getStoredTheme());
}

export const nextTheme = (mode: ThemeMode): ThemeMode => (mode === 'system' ? 'light' : mode === 'light' ? 'dark' : 'system');
