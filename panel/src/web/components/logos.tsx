/**
 * Logos em pixel art (grade 16x16). A escolhida fica salva no navegador e vale
 * para o menu, o login e o favicon. Os mesmos desenhos estão exportados em
 * docs/assets/logo/.
 */

import { useSyncExternalStore } from 'react';

export type LogoVariant = 'rack' | 'creeper' | 'power';

const PALETTE: Record<string, string> = {
  G: '#62c14f', // grama
  g: '#3f8f35', // grama sombra
  D: '#8a5a3b', // terra
  d: '#5e3b25', // terra sombra
  K: '#1c1f26', // moldura do rack
  S: '#3a404c', // gaveta
  s: '#4a5160', // gaveta clara
  W: '#15181d', // ventilação
  L: '#4ade80', // LED verde
  A: '#fbbf24', // LED âmbar
  C: '#5fd08a', // creeper
  c: '#3f9e63', // creeper sombra
  F: '#10261a', // rosto do creeper
};

export const LOGOS: Record<LogoVariant, { name: string; note: string; grid: string[] }> = {
  rack: {
    name: 'Rack de grama',
    note: 'Servidor com gavetas e LEDs, grama por cima',
    grid: [
      '..GGGGGGGGGGGG..',
      '.GGGgGGGGgGGGGG.',
      '.GgGGGGgGGGGgGG.',
      '.gDgDgDgDgDgDgD.',
      '.DDdDDDDDdDDDDD.',
      '.KKKKKKKKKKKKKK.',
      '.KssssssssssLAK.',
      '.KsWsWsWsWssssK.',
      '.KKKKKKKKKKKKKK.',
      '.KssssssssssLLK.',
      '.KsWsWsWsWssssK.',
      '.KKKKKKKKKKKKKK.',
      '.KssssssssssLsK.',
      '.KsWsWsWsWssssK.',
      '.KKKKKKKKKKKKKK.',
      '..K..........K..',
    ],
  },
  creeper: {
    name: 'Creeper servidor',
    note: 'Gabinete com rosto de creeper e baias com LEDs',
    grid: [
      '..KKKKKKKKKKKK..',
      '..KCCcCCCCcCCK..',
      '..KCFFCCCCFFCK..',
      '..KcFFCCcCFFCK..',
      '..KCCCCFFCCCcK..',
      '..KCCcFFFFCCCK..',
      '..KCCCFFFFCcCK..',
      '..KCCCFCCFCCCK..',
      '..KCcCCCCCCCCK..',
      '..KKKKKKKKKKKK..',
      '..KSSSSSSSSLSK..',
      '..KKKKKKKKKKKK..',
      '..KSSSSSSSSASK..',
      '..KKKKKKKKKKKK..',
      '..KsWsWsWsWssK..',
      '..KKKKKKKKKKKK..',
    ],
  },
  power: {
    name: 'Bloco ligado',
    note: 'Bloco de grama com o símbolo de power aceso',
    grid: [
      '................',
      '.GGGGGGGGGGGGGG.',
      '.GgGGGGGgGGGGgG.',
      '.GGGGgGGGGGgGGG.',
      '.gDgGDgGDgGDGgD.',
      '.DDgDDDDDDgDDDD.',
      '.DDDDDDLLDDDDDD.',
      '.DDDDLDLLDLDDDD.',
      '.DDDLDDLLDDLDDD.',
      '.DDDLDDLLDDLDdD.',
      '.DDDLDDDDDDLDDD.',
      '.DdDLDDDDDDLDDD.',
      '.DDDDLDDDDLDDDD.',
      '.DDDDDLLLLDDDDD.',
      '.DDdDDDDDDDDdDD.',
      '................',
    ],
  },
};

export const LOGO_VARIANTS = Object.keys(LOGOS) as LogoVariant[];

/** Bloco de grama visto de frente, usado na animação de carregamento. */
export const GRASS_BLOCK: string[] = [
  'GGGGGGGGGGGGGGGG',
  'GgGGGGGgGGGGgGGG',
  'GGGgGGGGGGgGGGgG',
  'gDgGDgGgDGGDgGDg',
  'DDgDDDgDDDgDDDDD',
  'DDDDDdDDDDDDDdDD',
  'DdDDDDDDDdDDDDDD',
  'DDDDDDdDDDDDDDDD',
  'DDDdDDDDDDDDdDDD',
  'DDDDDDDDdDDDDDDD',
  'DdDDDDDDDDDDDDdD',
  'DDDDDdDDDDDdDDDD',
  'DDDDDDDDDDDDDDDD',
  'DDdDDDDDdDDDDDDD',
  'DDDDDDDDDDDDDdDD',
  'dDDDDDDdDDDDDDDd',
];

export function gridPixels(grid: string[]): { x: number; y: number; fill: string }[] {
  const out: { x: number; y: number; fill: string }[] = [];
  grid.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      const fill = PALETTE[ch];
      if (fill) out.push({ x, y, fill });
    }),
  );
  return out;
}

const pixels = (variant: LogoVariant) => gridPixels(LOGOS[variant].grid);

export function PixelGrid({ grid, size = 32, className = 'pixel-logo' }: { grid: string[]; size?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 16 16" shapeRendering="crispEdges" aria-hidden>
      {gridPixels(grid).map((p) => (
        <rect key={`${p.x}-${p.y}`} x={p.x} y={p.y} width="1" height="1" fill={p.fill} />
      ))}
    </svg>
  );
}

export function PixelLogo({ variant, size = 32 }: { variant: LogoVariant; size?: number }) {
  return <PixelGrid grid={LOGOS[variant].grid} size={size} />;
}

// --- Preferência (localStorage) + favicon ------------------------------------------------

const STORAGE_KEY = 'minetune-logo';
const listeners = new Set<() => void>();

export function getLogo(): LogoVariant {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value && value in LOGOS ? (value as LogoVariant) : 'rack';
  } catch {
    return 'rack';
  }
}

export function setLogo(variant: LogoVariant): void {
  try {
    localStorage.setItem(STORAGE_KEY, variant);
  } catch {
    // armazenamento bloqueado: vale só nesta sessão
  }
  applyFavicon(variant);
  listeners.forEach((notify) => notify());
}

export function useLogo(): LogoVariant {
  return useSyncExternalStore(
    (notify) => {
      listeners.add(notify);
      return () => listeners.delete(notify);
    },
    getLogo,
  );
}

export function applyFavicon(variant: LogoVariant = getLogo()): void {
  const rects = pixels(variant)
    .map((p) => `<rect x="${p.x}" y="${p.y}" width="1" height="1" fill="${p.fill}"/>`)
    .join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges">${rects}</svg>`;
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.append(link);
  }
  link.href = `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
