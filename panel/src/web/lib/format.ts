import { intlLocale } from './i18n.tsx';

export function formatBytes(bytes: number | undefined): string {
  if (bytes === undefined || !Number.isFinite(bytes)) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toLocaleString(intlLocale(), { maximumFractionDigits: value < 10 ? 1 : 0 })} ${units[unit]}`;
}

/** "há 5 minutos" / "5 minutes ago" / "hace 5 minutos", na língua escolhida no painel. */
export function timeAgo(iso: string | undefined): string {
  if (!iso) return '—';
  const relative = new Intl.RelativeTimeFormat(intlLocale(), { numeric: 'auto' });
  const seconds = (new Date(iso).getTime() - Date.now()) / 1000;
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31_536_000],
    ['month', 2_592_000],
    ['day', 86_400],
    ['hour', 3_600],
    ['minute', 60],
  ];
  for (const [unit, size] of steps) {
    if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit);
  }
  // numeric: 'auto' com 0 segundos vira "agora" / "now" / "ahora".
  return relative.format(0, 'second');
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(intlLocale(), { dateStyle: 'short', timeStyle: 'short' });
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat(intlLocale(), { notation: 'compact' }).format(n);
}
