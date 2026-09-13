/**
 * Ícones pixelados da RuneIcons (Apache-2.0), gerados em rune-icons.generated.ts
 * por scripts/generate-rune-icons.mjs. Pintados com currentColor: herdam a cor
 * do texto em volta (verde no item ativo, vermelho no botão de perigo...).
 */

import { PixelLogo, useLogo } from './logos.tsx';
import { PIXEL_GLYPHS } from './pixel-glyphs.ts';
import { RUNE_ICONS } from './rune-icons.generated.ts';

/** RuneIcons + glifos próprios de traço grosso (X e seta), que têm prioridade. */
export const ICONS: Record<keyof typeof RUNE_ICONS | keyof typeof PIXEL_GLYPHS, { viewBox: string; d: string }> = { ...RUNE_ICONS, ...PIXEL_GLYPHS };

export type IconName = keyof typeof ICONS;

/**
 * Pixel art perde definição abaixo de ~16px (cada "pixel" do desenho vira
 * fração de pixel da tela e borra), então o tamanho mínimo é 16.
 */
const MIN_SIZE = 16;

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const px = Math.max(size, MIN_SIZE);
  const icon = ICONS[name];
  return (
    <svg
      className="icon"
      width={px}
      height={px}
      viewBox={icon.viewBox}
      fill="currentColor"
      shapeRendering="crispEdges"
      aria-hidden
    >
      <path d={icon.d} />
    </svg>
  );
}

/** Marca do minetune: a logo em pixel art escolhida em Aparência. */
export function BrandMark({ size = 32 }: { size?: number }) {
  const variant = useLogo();
  return <PixelLogo variant={variant} size={size} />;
}
