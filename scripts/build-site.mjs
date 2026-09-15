#!/usr/bin/env node
/**
 * Monta o site do GitHub Pages em _site/, em três línguas: português em /, inglês em /en/
 * e espanhol em /es/.
 *
 * Nada é duplicado no repositório: fonte, logos, prints e ícones vêm de onde já
 * vivem (painel e docs), e o changelog é convertido do CHANGELOG.md a cada build.
 * Os ícones entram inline no HTML (<i data-icon="nome"></i>), sem JavaScript.
 *
 * Textos: cada página em site/ é um modelo único. {{t:chave}} vira o texto da língua,
 * {{ta:chave}} o mesmo escapado para atributo e {{tj:chave}} escapado para JSON-LD.
 * As chaves ficam em site/i18n/<língua>.json; faltou uma em qualquer língua, o build para.
 *
 * Uso: node scripts/build-site.mjs
 */

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, '_site');
const SITE = join(ROOT, 'site');
const SITE_URL = 'https://juniorcarlini.github.io/minetune/';

/** Português é a língua padrão, na raiz; as outras em subpastas. short = sigla do seletor. */
const LOCALES = [
  { code: 'pt-BR', dir: '', og: 'pt_BR', name: 'Português', short: 'PT' },
  { code: 'en', dir: 'en', og: 'en_US', name: 'English', short: 'EN' },
  { code: 'es', dir: 'es', og: 'es_ES', name: 'Español', short: 'ES' },
];
const DEFAULT_LOCALE = LOCALES[0];

const { RUNE_ICONS } = await import(join(ROOT, 'panel/src/web/components/rune-icons.generated.ts'));
const { PIXEL_GLYPHS } = await import(join(ROOT, 'panel/src/web/components/pixel-glyphs.ts'));
const ICONS = { ...RUNE_ICONS, ...PIXEL_GLYPHS };

const DICTS = loadDictionaries();
const usedKeys = new Set();

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

// Mapa de seeds: a interface fica em site/seedmap; o gerador (cubiomes em WebAssembly)
// é compilado por scripts/build-seedmap.sh, porque o .wasm não é versionado.
// Componentes do Tucano, na mesma versão do painel (package-lock), para os controles do mapa.
// Os assets ficam só na raiz: as páginas de /en/ e /es/ apontam para ../ ({{ROOT}}).
copy('panel/node_modules/tucano/dist/tucano.min.css', 'assets/tucano/tucano.min.css');
copy('panel/node_modules/tucano/dist/tucano.esm.js', 'assets/tucano/tucano.esm.js');
copy('site/seedmap/app.js', 'seedmap/app.js');
copy('site/seedmap/worker.js', 'seedmap/worker.js');
copy('site/seedmap/icons.js', 'seedmap/icons.js');
copy('site/seedmap/i18n.js', 'seedmap/i18n.js');
for (const file of ['cubiomes.js', 'cubiomes.wasm']) {
  if (!existsSync(join(ROOT, 'build/seedmap', file))) {
    throw new Error(`falta build/seedmap/${file}: rode "bash scripts/build-seedmap.sh" antes`);
  }
  copy(`build/seedmap/${file}`, `seedmap/${file}`);
}

// --- Changelog -------------------------------------------------------------------
// Uma versão do changelog por língua: CHANGELOG.md (português, a referência), CHANGELOG.en.md e
// CHANGELOG.es.md. O build para se uma tradução não tiver as mesmas versões, datas e quantidade
// de itens: assim uma novidade escrita só em português não é publicada sem tradução.
const changelogFile = (locale) => (locale === DEFAULT_LOCALE ? 'CHANGELOG.md' : `CHANGELOG.${locale.code}.md`);
const changelogs = new Map(LOCALES.map((locale) => [locale, readFileSync(join(ROOT, changelogFile(locale)), 'utf8')]));
{
  const reference = renderChangelog(changelogs.get(DEFAULT_LOCALE), DEFAULT_LOCALE).releases;
  const problems = [];
  for (const locale of LOCALES.filter((l) => l !== DEFAULT_LOCALE)) {
    const translated = renderChangelog(changelogs.get(locale), locale).releases;
    const file = changelogFile(locale);
    if (translated.length !== reference.length) problems.push(`${file}: ${translated.length} versões, o CHANGELOG.md tem ${reference.length}`);
    reference.forEach((release, i) => {
      const other = translated[i];
      const name = release.date ? `v${release.version}` : 'não lançado';
      if (!other) return;
      if ((other.date ?? '') !== (release.date ?? '') || (release.date && other.version !== release.version)) {
        problems.push(`${file}: a ${i + 1}ª versão deveria ser ${name}`);
      } else if (other.items !== release.items) {
        problems.push(`${file}: ${name} tem ${other.items} itens, o CHANGELOG.md tem ${release.items}`);
      }
    });
  }
  if (problems.length) throw new Error(`changelog traduzido fora de sincronia:\n  - ${problems.join('\n  - ')}`);
}

// --- Páginas -----------------------------------------------------------------------
const PAGES = ['index.html', 'mapa.html', 'changelog.html'];
// Data do build no formato do sitemap (AAAA-MM-DD): diz aos buscadores quando o site mudou.
const buildDate = new Date().toISOString().slice(0, 10);
let latest = null;

for (const locale of LOCALES) {
  const t = (key) => text(locale, key);
  const { html: changelogHtml, latest: latestRelease, releases } = renderChangelog(changelogs.get(locale), locale);
  latest = latestRelease;
  const tocHtml = releases
    .map((r) => {
      const id = r.date ? `v${r.version}` : 'nao-lancado';
      const label = r.date ? `v${escapeHtml(r.version)}` : escapeHtml(t('changelog.unreleased'));
      const cls = r === latestRelease ? ' class="is-latest"' : '';
      return `<a href="#${id}"${cls}>${label}${r.date ? `<time datetime="${r.date}">${formatDate(r.date, locale)}</time>` : ''}</a>`;
    })
    .join('\n');

  for (const page of PAGES) {
    let html = readFileSync(join(SITE, page), 'utf8');
    if (page === 'changelog.html') {
      html = html.replace('<!-- CHANGELOG -->', changelogHtml).replace('<!-- TOC -->', tocHtml).replace('<!-- CHANGELOG_NOTE -->', '');
    }
    html = fillPage(translate(html, locale), locale, page)
      .replace(/<i data-icon=["']([a-zA-Z]+)["']><\/i>/g, (_, iconName) => icon(iconName))
      .replace(/<i data-pixel=["']([a-z]+)["']><\/i>/g, (_, pixelName) => pixel(pixelName));
    const unresolved = html.match(/\{\{[^}]+\}\}/);
    if (unresolved) throw new Error(`marcador sem valor em ${locale.code}/${page}: ${unresolved[0]}`);
    mkdirSync(join(OUT, locale.dir), { recursive: true });
    writeFileSync(join(OUT, locale.dir, page), html);
  }
}

// SEO e GEO: mapa do site com as versões de cada língua, regras para robôs e o resumo em texto para assistentes de IA.
writeFileSync(join(OUT, 'sitemap.xml'), sitemap());
writeFileSync(join(OUT, 'robots.txt'), readFileSync(join(SITE, 'robots.txt'), 'utf8'));
writeFileSync(join(OUT, 'llms.txt'), fillCommon(readFileSync(join(SITE, 'llms.txt'), 'utf8'), DEFAULT_LOCALE));
writeFileSync(join(OUT, 'en', 'llms.txt'), fillCommon(readFileSync(join(SITE, 'llms.en.txt'), 'utf8'), LOCALES[1]));
// Verificação do Google Search Console: o arquivo precisa continuar publicado, sem alteração.
for (const file of readdirSync(SITE).filter((name) => /^google[0-9a-f]+\.html$/.test(name))) {
  cpSync(join(SITE, file), join(OUT, file));
}
writeFileSync(join(OUT, '.nojekyll'), '');

const unused = Object.keys(DICTS[DEFAULT_LOCALE.code]).filter((key) => !usedKeys.has(key));
if (unused.length) console.warn(`aviso: textos sem uso em site/i18n: ${unused.join(', ')}`);

console.log(`site gerado em _site/ (${LOCALES.map((l) => l.code).join(', ')}; versão mais recente: ${latest?.version ?? 'nenhuma'})`);

// =====================================================================================

/** Lê os dicionários e para o build se uma língua tiver chave faltando ou sobrando em relação ao português. */
function loadDictionaries() {
  const dicts = Object.fromEntries(LOCALES.map((l) => [l.code, JSON.parse(readFileSync(join(SITE, 'i18n', `${l.code}.json`), 'utf8'))]));
  const reference = Object.keys(dicts[DEFAULT_LOCALE.code]);
  const problems = [];
  for (const locale of LOCALES.slice(1)) {
    const keys = Object.keys(dicts[locale.code]);
    const missing = reference.filter((key) => !keys.includes(key));
    const extra = keys.filter((key) => !reference.includes(key));
    if (missing.length) problems.push(`${locale.code} sem tradução: ${missing.join(', ')}`);
    if (extra.length) problems.push(`${locale.code} com chaves que não existem em pt-BR: ${extra.join(', ')}`);
  }
  for (const locale of LOCALES) {
    for (const [key, value] of Object.entries(dicts[locale.code])) {
      if (typeof value !== 'string' || !value.trim()) problems.push(`${locale.code}: "${key}" vazio`);
    }
  }
  if (problems.length) throw new Error(`traduções do site incompletas:\n  ${problems.join('\n  ')}`);
  return dicts;
}

function text(locale, key) {
  const value = DICTS[locale.code][key];
  if (value === undefined) throw new Error(`texto desconhecido no site: ${key} (adicione em site/i18n/*.json)`);
  usedKeys.add(key);
  return value;
}

function translate(html, locale) {
  return html.replace(/\{\{(t|ta|tj):([a-zA-Z0-9_.]+)\}\}/g, (_, mode, key) => {
    const value = text(locale, key);
    if (mode === 'ta') return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
    if (mode === 'tj') return JSON.stringify(value).slice(1, -1);
    return value;
  });
}

/** Endereço absoluto de uma página numa língua (index.html vira a pasta). */
/** Pasta dos prints do painel de cada língua, relativa à raiz do site. */
function shotsDir(locale) {
  return `assets/screenshots/${locale.dir ? `${locale.dir}/` : ''}`;
}

function pageUrl(locale, page) {
  return `${SITE_URL}${locale.dir ? `${locale.dir}/` : ''}${page === 'index.html' ? '' : page}`;
}

/** Link relativo entre línguas: funciona no GitHub Pages (subpasta /minetune/) e no servidor local. */
function relativeLink(from, to, page) {
  const link = `${from.dir ? '../' : ''}${to.dir ? `${to.dir}/` : ''}${page === 'index.html' ? '' : page}`;
  return link || './';
}

/** Marcadores comuns a páginas e ao llms.txt: versão e datas no formato de cada língua. */
function fillCommon(content, locale) {
  return content
    .replaceAll('{{VERSION}}', latest?.version ?? '')
    .replaceAll('{{VERSION_ISO}}', latest?.date ?? buildDate)
    .replaceAll('{{VERSION_DATE}}', latest ? formatDate(latest.date, locale) : '')
    .replaceAll('{{BUILD_DATE}}', buildDate);
}

function fillPage(html, locale, page) {
  const alternates = [
    ...LOCALES.map((l) => `<link rel="alternate" hreflang="${l.code}" href="${pageUrl(l, page)}" />`),
    `<link rel="alternate" hreflang="x-default" href="${pageUrl(DEFAULT_LOCALE, page)}" />`,
  ].join('\n    ');
  const ogAlternates = LOCALES.filter((l) => l !== locale)
    .map((l) => `<meta property="og:locale:alternate" content="${l.og}" />`)
    .join('\n    ');
  const switcher = [
    `<span class="lang-switch" role="group" aria-label="${escapeAttr(text(locale, 'common.language'))}">`,
    ...LOCALES.map(
      (l) =>
        `<a href="${relativeLink(locale, l, page)}" hreflang="${l.code}" lang="${l.code}" title="${l.name}" aria-label="${l.name}"${l === locale ? ' aria-current="true"' : ''}>${l.short}</a>`,
    ),
    '</span>',
  ].join('');
  return fillCommon(html, locale)
    .replaceAll('{{LANG}}', locale.code)
    .replaceAll('{{OG_LOCALE}}', locale.og)
    .replaceAll('{{OG_ALTERNATES}}', ogAlternates)
    .replaceAll('{{ALTERNATES}}', alternates)
    .replaceAll('{{LANG_SWITCH}}', switcher)
    .replaceAll('{{ROOT}}', locale.dir ? '../' : '')
    .replaceAll('{{SITE}}', SITE_URL)
    // Prints do painel na língua da página: docs/assets/screenshots/ (pt-BR), /en/ e /es/.
    .replaceAll('{{SHOTS}}', shotsDir(locale))
    .replaceAll('{{PAGE_URL}}', pageUrl(locale, page))
    .replaceAll('{{HOME_URL}}', pageUrl(locale, 'index.html'))
    .replaceAll('{{CHANGELOG_URL}}', pageUrl(locale, 'changelog.html'))
    .replaceAll('{{LLMS_URL}}', `${SITE_URL}${locale === DEFAULT_LOCALE ? '' : 'en/'}llms.txt`);
}

/** Sitemap com cada página em cada língua e os links entre as versões (xhtml:link). */
function sitemap() {
  const screenshots = ['overview', 'players', 'settings', 'gamerules', 'plugins', 'backups', 'backup-destination', 'console'];
  const meta = {
    'index.html': { changefreq: 'weekly', priority: '1.0', images: (locale) => ['assets/og.jpg', ...screenshots.map((s) => `${shotsDir(locale)}${s}.png`)] },
    'mapa.html': { changefreq: 'monthly', priority: '0.8', images: () => [] },
    'changelog.html': { changefreq: 'weekly', priority: '0.6', images: () => [] },
  };
  const urls = PAGES.flatMap((page) =>
    LOCALES.map((locale) =>
      [
        '  <url>',
        `    <loc>${pageUrl(locale, page)}</loc>`,
        `    <lastmod>${buildDate}</lastmod>`,
        `    <changefreq>${meta[page].changefreq}</changefreq>`,
        `    <priority>${locale === DEFAULT_LOCALE ? meta[page].priority : (Number(meta[page].priority) - 0.1).toFixed(1)}</priority>`,
        ...LOCALES.map((l) => `    <xhtml:link rel="alternate" hreflang="${l.code}" href="${pageUrl(l, page)}" />`),
        `    <xhtml:link rel="alternate" hreflang="x-default" href="${pageUrl(DEFAULT_LOCALE, page)}" />`,
        ...meta[page].images(locale).map((image) => `    <image:image>\n      <image:loc>${SITE_URL}${image}</image:loc>\n    </image:image>`),
        '  </url>',
      ].join('\n'),
    ),
  );
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!-- Mapa do site: cada página nas três línguas, com as imagens da página inicial para a busca de imagens. -->',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ...urls,
    '</urlset>',
    '',
  ].join('\n');
}

/**
 * Desenho em pixel do painel (o bloco de grama do carregamento), lido do logos.tsx:
 * o .tsx não é importável pelo Node, e copiar a grade criaria uma segunda versão.
 */
function pixel(name) {
  const grids = { grass: 'GRASS_BLOCK' };
  if (!grids[name]) throw new Error(`desenho em pixel desconhecido no site: ${name}`);
  const source = readFileSync(join(ROOT, 'panel/src/web/components/logos.tsx'), 'utf8');
  const grid = source
    .match(new RegExp(`export const ${grids[name]}: string\\[\\] = \\[([\\s\\S]*?)\\];`))?.[1]
    .match(/'([^']+)'/g)
    ?.map((row) => row.slice(1, -1));
  const palette = Object.fromEntries(
    [...(source.match(/const PALETTE[^{]*\{([\s\S]*?)\};/)?.[1] ?? '').matchAll(/(\w): '(#[0-9a-fA-F]{3,8})'/g)].map((m) => [m[1], m[2]]),
  );
  if (!grid?.length) throw new Error(`não achei ${grids[name]} em logos.tsx`);
  const rects = grid
    .flatMap((row, y) => [...row].map((ch, x) => (palette[ch] ? `<rect x="${x}" y="${y}" width="1" height="1" fill="${palette[ch]}"/>` : '')))
    .join('');
  return `<svg class="pixel-logo" width="40" height="40" viewBox="0 0 16 16" shape-rendering="crispEdges" aria-hidden="true">${rects}</svg>`;
}

function icon(name) {
  const glyph = ICONS[name];
  if (!glyph) throw new Error(`ícone desconhecido no site: ${name}`);
  return `<svg class="icon" viewBox="${glyph.viewBox}" fill="currentColor" shape-rendering="crispEdges" aria-hidden="true"><path d="${glyph.d}"/></svg>`;
}

function escapeHtml(value) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll('"', '&quot;');
}

/** "13 set 2026" / "Sep 13, 2026" / "13 sept 2026": meses e ordem vêm do dicionário da língua. */
function formatDate(iso, locale) {
  const months = DICTS[locale.code]['changelog.months'].split(',');
  const [y, m, d] = iso.split('-').map(Number);
  usedKeys.add('changelog.months').add('changelog.dateFormat');
  return DICTS[locale.code]['changelog.dateFormat'].replace('{d}', d).replace('{m}', months[m - 1]).replace('{y}', y);
}

function slug(value) {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Tipo de mudança em inglês ou espanhol → classe do tipo em português (as cores do CSS).
 * Função, e não constante: a checagem das traduções roda no topo do arquivo, antes das constantes daqui.
 */
function kindClass(name) {
  const slugged = slug(name);
  const map = {
    added: 'adicionado',
    anadido: 'adicionado',
    changed: 'alterado',
    cambiado: 'alterado',
    deprecated: 'obsoleto',
    removed: 'removido',
    eliminado: 'removido',
    fixed: 'corrigido',
    corregido: 'corrigido',
    security: 'seguranca',
    seguridad: 'seguranca',
  };
  return map[slugged] ?? slugged;
}

/**
 * Converte o CHANGELOG.md (formato Keep a Changelog) no HTML da página.
 * Cobre só o que o arquivo usa: títulos, listas com continuação, parágrafos,
 * negrito, código, links diretos e links de referência. As etiquetas e datas
 * seguem a língua da página; o texto das notas continua como está no arquivo.
 */
function renderChangelog(markdown, locale) {
  const t = (key) => text(locale, key);
  const refs = new Map();
  const lines = markdown.split('\n').filter((line) => {
    const ref = line.match(/^\[([^\]]+)\]:\s*(\S+)\s*$/);
    if (ref) refs.set(ref[1], ref[2]);
    return !ref;
  });

  const inline = (value) =>
    escapeHtml(value)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  const out = [];
  const releases = [];
  let list = null;
  let paragraph = [];
  let inRelease = false;
  let intro = true;
  // Onde começa o cartão da versão atual e quantos itens ele tem: "Não lançado" vazio não aparece no site.
  let current = null;

  const closeRelease = () => {
    if (!inRelease) return;
    out.push('</div></article>');
    if (current.unreleased && current.items === 0) {
      out.splice(current.start);
      releases.pop();
    }
    inRelease = false;
  };

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
      closeRelease();
      const [, name, date] = release;
      const unreleased = !date;
      const id = unreleased ? 'nao-lancado' : `v${name}`;
      const isLatest = !unreleased && !releases.some((r) => r.date);
      releases.push({ version: name, date, items: 0 });
      const link = refs.get(name);
      current = { start: out.length, unreleased, items: 0 };
      out.push(
        `<article class="release${unreleased ? ' is-unreleased' : ''}${isLatest ? ' is-latest' : ''}" id="${id}">`,
        '<header class="release-head">',
        `<h2><a href="#${id}">${unreleased ? escapeHtml(t('changelog.unreleased')) : `v${escapeHtml(name)}`}</a></h2>`,
        isLatest ? `<span class="tag tag-latest">${escapeHtml(t('changelog.tagLatest'))}</span>` : '',
        unreleased ? `<span class="tag">${escapeHtml(t('changelog.tagUnreleased'))}</span>` : '',
        date ? `<time datetime="${date}">${formatDate(date, locale)}</time>` : '',
        link ? `<a class="release-link" href="${link}">${escapeHtml(unreleased ? t('changelog.compare') : t('changelog.viewOnGithub'))}</a>` : '',
        '</header>',
        '<div class="release-body">',
      );
      inRelease = true;
      continue;
    }

    const kind = line.match(/^### (.+)/);
    if (kind) {
      flush();
      // A cor de cada tipo vem do nome em português (kind-alterado...): o inglês e o espanhol usam a mesma.
      out.push(`<h3 class="kind kind-${kindClass(kind[1])}">${escapeHtml(kind[1])}</h3>`);
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
      if (current) {
        current.items++;
        releases.at(-1).items++;
      }
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
  closeRelease();

  const html = `<div class="changelog-intro">${out.join('\n')}`;
  return { html, latest: releases.find((r) => r.date), releases };
}
