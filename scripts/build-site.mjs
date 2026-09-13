#!/usr/bin/env node
/**
 * Monta o site do GitHub Pages em _site/.
 *
 * Nada é duplicado no repositório: fonte, logos, prints e ícones vêm de onde já
 * vivem (painel e docs), e o changelog é convertido do CHANGELOG.md a cada build.
 * Os ícones entram inline no HTML (<i data-icon="nome"></i>), sem JavaScript.
 *
 * Uso: node scripts/build-site.mjs
 */

import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, '_site');
const SITE = join(ROOT, 'site');

const { RUNE_ICONS } = await import(join(ROOT, 'panel/src/web/components/rune-icons.generated.ts'));
const { PIXEL_GLYPHS } = await import(join(ROOT, 'panel/src/web/components/pixel-glyphs.ts'));
const ICONS = { ...RUNE_ICONS, ...PIXEL_GLYPHS };

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

// --- Assets reaproveitados do repositório -------------------------------------
const copy = (from, to) => {
  mkdirSync(dirname(join(OUT, to)), { recursive: true });
  cpSync(join(ROOT, from), join(OUT, to), { recursive: true });
};
copy('site/styles.css', 'styles.css');
copy('site/og.jpg', 'assets/og.jpg');
copy('panel/src/web/assets/fonts/Monocraft.ttf', 'assets/fonts/Monocraft.ttf');
copy('panel/src/web/assets/fonts/Monocraft-Bold.ttf', 'assets/fonts/Monocraft-Bold.ttf');
copy('panel/src/web/assets/login-cover.webp', 'assets/cover.webp');
copy('docs/assets/logo/rack.svg', 'assets/logo.svg');
copy('docs/assets/logo/minetune-banner.png', 'assets/banner.png');
copy('docs/assets/screenshots', 'assets/screenshots');

// --- Changelog -------------------------------------------------------------------
const changelog = readFileSync(join(ROOT, 'CHANGELOG.md'), 'utf8');
const { html: changelogHtml, latest, releases } = renderChangelog(changelog);
const tocHtml = releases
  .map((r) => {
    const id = r.date ? `v${r.version}` : 'nao-lancado';
    const label = r.date ? `v${escapeHtml(r.version)}` : escapeHtml(r.version);
    const cls = r === latest ? ' class="is-latest"' : '';
    return `<a href="#${id}"${cls}>${label}${r.date ? `<time datetime="${r.date}">${formatDate(r.date)}</time>` : ''}</a>`;
  })
  .join('\n');

// --- Páginas -----------------------------------------------------------------------
const pages = {
  'index.html': (html) => html,
  'changelog.html': (html) => html.replace('<!-- CHANGELOG -->', changelogHtml).replace('<!-- TOC -->', tocHtml),
};
// Data do build no formato do sitemap (AAAA-MM-DD): diz aos buscadores quando o site mudou.
const buildDate = new Date().toISOString().slice(0, 10);
const fill = (text) =>
  text
    .replaceAll('{{VERSION}}', latest?.version ?? '')
    .replaceAll('{{VERSION_ISO}}', latest?.date ?? buildDate)
    .replaceAll('{{VERSION_DATE}}', latest ? formatDate(latest.date) : '')
    .replaceAll('{{BUILD_DATE}}', buildDate);

for (const [name, transform] of Object.entries(pages)) {
  const html = fill(transform(readFileSync(join(SITE, name), 'utf8'))).replace(/<i data-icon="([a-zA-Z]+)"><\/i>/g, (_, iconName) =>
    icon(iconName),
  );
  writeFileSync(join(OUT, name), html);
}

// SEO e GEO: mapa do site, regras para robôs e o resumo em texto que assistentes de IA leem.
for (const file of ['robots.txt', 'sitemap.xml', 'llms.txt']) {
  writeFileSync(join(OUT, file), fill(readFileSync(join(SITE, file), 'utf8')));
}
writeFileSync(join(OUT, '.nojekyll'), '');

console.log(`site gerado em _site/ (versão mais recente: ${latest?.version ?? 'nenhuma'})`);

// =====================================================================================

function icon(name) {
  const glyph = ICONS[name];
  if (!glyph) throw new Error(`ícone desconhecido no site: ${name}`);
  return `<svg class="icon" viewBox="${glyph.viewBox}" fill="currentColor" shape-rendering="crispEdges" aria-hidden="true"><path d="${glyph.d}"/></svg>`;
}

function escapeHtml(text) {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function formatDate(iso) {
  const months = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${months[m - 1]} ${y}`;
}

function slug(text) {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Converte o CHANGELOG.md (formato Keep a Changelog) no HTML da página.
 * Cobre só o que o arquivo usa: títulos, listas com continuação, parágrafos,
 * negrito, código, links diretos e links de referência.
 */
function renderChangelog(markdown) {
  const refs = new Map();
  const lines = markdown.split('\n').filter((line) => {
    const ref = line.match(/^\[([^\]]+)\]:\s*(\S+)\s*$/);
    if (ref) refs.set(ref[1], ref[2]);
    return !ref;
  });

  const inline = (text) =>
    escapeHtml(text)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  const out = [];
  const releases = [];
  let list = null;
  let paragraph = [];
  let inRelease = false;
  let intro = true;

  const flushParagraph = () => {
    if (paragraph.length) out.push(`<p>${inline(paragraph.join(' '))}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (list) out.push(`<ul>${list.map((item) => `<li>${inline(item)}</li>`).join('')}</ul>`);
    list = null;
  };
  const flush = () => {
    flushParagraph();
    flushList();
  };

  for (const line of lines) {
    if (/^# /.test(line)) continue; // o título da página vem do template

    const release = line.match(/^## \[([^\]]+)\](?:\s*-\s*(\d{4}-\d{2}-\d{2}))?/);
    if (release) {
      flush();
      if (intro) {
        out.push('</div>');
        intro = false;
      }
      if (inRelease) out.push('</div></article>');
      const [, name, date] = release;
      const unreleased = !date;
      const id = unreleased ? 'nao-lancado' : `v${name}`;
      const isLatest = !unreleased && !releases.some((r) => r.date);
      releases.push({ version: name, date });
      const link = refs.get(name);
      out.push(
        `<article class="release${unreleased ? ' is-unreleased' : ''}${isLatest ? ' is-latest' : ''}" id="${id}">`,
        '<header class="release-head">',
        `<h2><a href="#${id}">${unreleased ? escapeHtml(name) : `v${escapeHtml(name)}`}</a></h2>`,
        isLatest ? '<span class="tag tag-latest">mais recente</span>' : '',
        unreleased ? '<span class="tag">em andamento</span>' : '',
        date ? `<time datetime="${date}">${formatDate(date)}</time>` : '',
        link ? `<a class="release-link" href="${link}">${unreleased ? 'comparar' : 'ver no GitHub'}</a>` : '',
        '</header>',
        '<div class="release-body">',
      );
      inRelease = true;
      continue;
    }

    const kind = line.match(/^### (.+)/);
    if (kind) {
      flush();
      out.push(`<h3 class="kind kind-${slug(kind[1])}">${escapeHtml(kind[1])}</h3>`);
      continue;
    }

    const group = line.match(/^#### (.+)/);
    if (group) {
      flush();
      out.push(`<h4>${escapeHtml(group[1])}</h4>`);
      continue;
    }

    const item = line.match(/^- (.+)/);
    if (item) {
      flushParagraph();
      list ??= [];
      list.push(item[1]);
      continue;
    }

    if (list && /^\s{2,}\S/.test(line)) {
      list[list.length - 1] += ` ${line.trim()}`;
      continue;
    }

    if (!line.trim()) {
      flush();
      continue;
    }

    flushList();
    paragraph.push(line.trim());
  }
  flush();
  if (inRelease) out.push('</div></article>');

  const html = `<div class="changelog-intro">${out.join('\n')}`;
  return { html, latest: releases.find((r) => r.date), releases };
}
