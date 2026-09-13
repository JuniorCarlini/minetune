/**
 * Expõe ícones pixelados como variáveis CSS (data URI) para uso em `mask-image`.
 *
 * Serve para os lugares onde o desenho não é nosso: o X e a seta do Select e o
 * fechar do toast (SVGs de traço fino criados pelo Tucano). Usa o mesmo mapa do
 * componente Icon, então trocar um ícone lá troca aqui também.
 */

import { ICONS, type IconName } from '../components/icons.tsx';

const MASKS: Record<string, IconName> = {
  '--mt-icon-x': 'x',
  '--mt-icon-chevron': 'chevron',
};

export function installIconMasks(root: HTMLElement = document.documentElement): void {
  for (const [property, name] of Object.entries(MASKS)) {
    const icon = ICONS[name];
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${icon.viewBox}" shape-rendering="crispEdges"><path fill="#000" d="${icon.d}"/></svg>`;
    root.style.setProperty(property, `url("data:image/svg+xml,${encodeURIComponent(svg)}")`);
  }
}
