#!/usr/bin/env node
/**
 * Gera src/web/components/rune-icons.generated.ts a partir dos SVGs pixelados
 * da RuneIcons (https://github.com/Nexvyn/runeicons, Apache-2.0).
 *
 * A biblioteca não publica pacote no npm; os SVGs vivem no repositório. Este
 * script baixa só os ícones usados pelo painel, travados num commit, e junta os
 * "pixels" de cada um num único path com fill=currentColor (herda a cor do tema).
 *
 * Uso:  node scripts/generate-rune-icons.mjs [commit]
 */

import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const REPO = 'Nexvyn/runeicons';

/** Nome usado no painel -> caminho em public/pixelated/<categoria>/<nome>.svg */
const ICONS = {
  dashboard: 'layouts/layout-grid',
  console: 'code/terminal',
  players: 'identity/users',
  settings: 'tools/settings',
  rules: 'documents/clipboard-list',
  plugins: 'layouts/layers-2',
  backups: 'schedule/history',
  logout: 'identity/log-out',
  play: 'playback/play',
  stop: 'indicators/square-stop',
  restart: 'arrows/rotate-cw',
  copy: 'code/copy',
  check: 'indicators/check',
  x: 'indicators/x',
  chevron: 'arrows/chevron-down',
  cpu: 'metrics/activity',
  memory: 'code/server',
  gauge: 'other/zap',
  cube: 'documents/box',
  globe: 'other/globe',
  sun: 'nature/sun',
  moon: 'nature/moon',
  monitor: 'gadgets/laptop',
  search: 'tools/search',
  // Ações dos botões
  save: 'documents/save',
  refresh: 'schedule/refresh-cw',
  undo: 'arrows/rotate-ccw',
  plus: 'indicators/plus',
  trash: 'tools/trash-2',
  send: 'messaging/send',
  login: 'identity/log-in',
  shield: 'identity/shield-check',
  shieldOff: 'identity/shield-x',
  kick: 'identity/user-minus',
  ban: 'identity/lock',
  unban: 'identity/lock-open',
  userPlus: 'identity/user-plus',
  arrowRight: 'arrows/arrow-right',
  upload: 'nature/cloud-upload',
  download: 'nature/cloud-download',
};

const commit =
  process.argv[2] ??
  execFileSync('gh', ['api', `repos/${REPO}/commits/HEAD`, '--jq', '.sha'], { encoding: 'utf8' }).trim();

const paths = {};
for (const [name, source] of Object.entries(ICONS)) {
  const url = `https://raw.githubusercontent.com/${REPO}/${commit}/public/pixelated/${source}.svg`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${name}: ${res.status} em ${url}`);
  const svg = await res.text();

  // A grade varia por ícone (users é 41x42): guarda o viewBox de cada um, nunca força 40x40.
  const viewBox = /viewBox="([^"]+)"/.exec(svg)?.[1];
  if (!viewBox || !/^0 0 \d+(\.\d+)? \d+(\.\d+)?$/.test(viewBox)) throw new Error(`${name}: viewBox inesperado (${viewBox})`);

  // O conversor só entende <path>; qualquer outra forma sumiria do ícone em silêncio.
  const otherShapes = svg.match(/<(rect|circle|ellipse|polygon|polyline|line|use|image)\b/g);
  if (otherShapes) throw new Error(`${name}: formas não suportadas (${[...new Set(otherShapes)].join(', ')})`);

  // Só paths pintados; ignora qualquer elemento com fill="none".
  const ds = [...svg.matchAll(/<path\b[^>]*>/g)]
    .map((m) => m[0])
    .filter((tag) => !/fill="none"/.test(tag))
    .map((tag) => /\bd="([^"]+)"/.exec(tag)?.[1])
    .filter(Boolean);
  if (ds.length === 0) throw new Error(`${name}: nenhum path encontrado`);

  // Arredonda para 3 casas: os SVGs vêm com 5, e a diferença é invisível.
  const d = ds.join('').replace(/-?\d+\.\d{4,}/g, (n) => String(Math.round(Number(n) * 1000) / 1000));
  paths[name] = { viewBox, d };
  console.log(`${name.padEnd(10)} ${source.padEnd(28)} ${viewBox.padEnd(12)} ${ds.length} pixels`);
}

const out = `// Gerado por scripts/generate-rune-icons.mjs — não edite à mão.
// Ícones pixelados da RuneIcons (https://github.com/${REPO}), commit ${commit}.
// Licença Apache-2.0: ver RUNEICONS-LICENSE.txt nesta pasta.

export const RUNE_ICONS_COMMIT = '${commit}';

export const RUNE_ICONS = {
${Object.entries(paths)
  .map(([name, icon]) => `  ${JSON.stringify(name)}: { viewBox: ${JSON.stringify(icon.viewBox)}, d: ${JSON.stringify(icon.d)} },`)
  .join('\n')}
} as const;
`;

const target = new URL('../src/web/components/rune-icons.generated.ts', import.meta.url);
writeFileSync(target, out);

const license = await fetch(`https://raw.githubusercontent.com/${REPO}/${commit}/LICENSE`).then((r) => r.text());
writeFileSync(
  new URL('../src/web/components/RUNEICONS-LICENSE.txt', import.meta.url),
  `Ícones: RuneIcons — https://github.com/${REPO} (commit ${commit})\n\n${license}`,
);

console.log(`\n${Object.keys(paths).length} ícones gravados em ${target.pathname}`);
