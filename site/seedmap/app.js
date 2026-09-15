// Mapa de seeds do site do Minetune.
// Os biomas e as estruturas vêm do cubiomes compilado para WebAssembly e são calculados
// em workers (seedmap/worker.js) para a página não travar. Aqui só se desenha e se
// trata a interação: arrastar, zoom, busca por coordenada e link para compartilhar.

import { init as initTucano, Select, toast } from '../assets/tucano/tucano.esm.js';
import { iconCanvas, iconSvg } from './icons.js';
import { BIOME_NAMES, NUMBER_LOCALE, STRUCTURE_NAMES, T } from './i18n.js';

const TILE = 256; // pixels de tela de cada bloco do mapa
const ZOOMS = [0.25, 0.5, 1, 2, 4, 8, 16, 32, 64, 128]; // blocos do jogo por pixel
const DEFAULT_ZOOM = 4;
const MAX_TILES = 320;
const REGIONS_PER_TILE = 8; // regiões de estrutura calculadas por pedido
const WORLD_LIMIT = 29_999_984;
const POOL_SIZE = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1));

// Valor = texto aceito pelo cubiomes; rótulo = versões do jogo com a mesma geração.
const VERSIONS = [
  ['26.2', '26.2'],
  ['26.1', '26.1.x'],
  ['1.21.11', '1.21.11'],
  ['1.21.9', '1.21.9–10'],
  ['1.21.6', '1.21.6–8'],
  ['1.21.5', '1.21.5'],
  ['1.21.4', '1.21.4'],
  ['1.21.3', '1.21.2–3'],
  ['1.21.1', '1.21–1.21.1'],
  ['1.20.6', '1.20.x'],
  ['1.19.4', '1.19.3–4'],
  ['1.19.2', '1.19–1.19.2'],
  ['1.18.2', '1.18.x'],
];

// maxBpp: a partir de quantos blocos por pixel a estrutura some (fica densa demais e cara de calcular).
// O nome de cada estrutura vem de seedmap/i18n.js, na língua da página.
const STRUCTURES = [
  { name: 'village', color: '#f2c14e', dim: 0, maxBpp: 16, on: true },
  { name: 'stronghold', color: '#e05cff', dim: 0, maxBpp: Infinity, on: true },
  { name: 'pillager_outpost', color: '#a8a8a8', dim: 0, maxBpp: 16, on: true },
  { name: 'mansion', color: '#b07a45', dim: 0, maxBpp: 64, on: true },
  { name: 'monument', color: '#35d0c4', dim: 0, maxBpp: 32, on: true },
  { name: 'ancient_city', color: '#5b7cff', dim: 0, maxBpp: 16, on: true },
  { name: 'trial_chambers', color: '#ff8a3d', dim: 0, maxBpp: 8, on: true },
  { name: 'desert_pyramid', color: '#f3e2a9', dim: 0, maxBpp: 16, on: false },
  { name: 'jungle_pyramid', color: '#6cc24a', dim: 0, maxBpp: 16, on: false },
  { name: 'swamp_hut', color: '#8e6fb3', dim: 0, maxBpp: 16, on: false },
  { name: 'igloo', color: '#d6f1ff', dim: 0, maxBpp: 16, on: false },
  { name: 'trail_ruins', color: '#d0735c', dim: 0, maxBpp: 16, on: false },
  { name: 'shipwreck', color: '#9c7a54', dim: 0, maxBpp: 8, on: false },
  { name: 'ocean_ruin', color: '#7fb7b0', dim: 0, maxBpp: 8, on: false },
  { name: 'ruined_portal', color: '#a066ff', dim: 0, maxBpp: 8, on: false },
  { name: 'fortress', color: '#ff5a4f', dim: -1, maxBpp: 32, on: true },
  { name: 'bastion_remnant', color: '#c9c9c9', dim: -1, maxBpp: 32, on: true },
  { name: 'ruined_portal_nether', color: '#a066ff', dim: -1, maxBpp: 8, on: false },
  { name: 'end_city', color: '#e8dcff', dim: 1, maxBpp: 32, on: true },
].map((s) => ({ ...s, label: STRUCTURE_NAMES[s.name] ?? s.name }));
const STRONGHOLD = STRUCTURES.find((s) => s.name === 'stronghold');

const $ = (id) => document.getElementById(id);
const els = {
  controls: $('controls'),
  seed: $('seed'),
  random: $('random'),
  version: $('version'),
  dimension: $('dimension'),
  height: $('height'),
  heightField: $('height-field'),
  goto: $('goto'),
  share: $('share'),
  canvas: $('map'),
  zoomIn: $('zoom-in'),
  zoomOut: $('zoom-out'),
  toSpawn: $('to-spawn'),
  hudCoords: $('hud-coords'),
  hudBiome: $('hud-biome'),
  status: $('map-status'),
  statusText: $('map-status-text'),
  structures: $('structures'),
  legend: $('legend'),
  pop: $('map-pop'),
  popIcon: $('pop-icon'),
  popTitle: $('pop-title'),
  popCoords: $('pop-coords'),
  popCommand: $('pop-command'),
  popNote: $('pop-note'),
  popCopy: $('pop-copy'),
  popClose: $('pop-close'),
};
const ctx = els.canvas.getContext('2d');

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

function readStorage(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeStorage(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // modo privado ou armazenamento bloqueado: só não lembra a escolha
  }
}

// --- Seed ------------------------------------------------------------------------------
const INT64_MIN = -(2n ** 63n);
const INT64_MAX = 2n ** 63n - 1n;

/** Mesma regra do jogo: número inteiro de 64 bits vira a seed; qualquer outro texto usa o hashCode do Java. */
function seedFromText(text) {
  if (/^[-+]?\d{1,20}$/.test(text)) {
    const n = BigInt(text);
    if (n >= INT64_MIN && n <= INT64_MAX) return n;
  }
  let hash = 0;
  for (let i = 0; i < text.length; i++) hash = (Math.imul(31, hash) + text.charCodeAt(i)) | 0;
  return BigInt(hash);
}

function randomSeedText() {
  return crypto.getRandomValues(new BigInt64Array(1))[0].toString();
}

// --- Estado e link -----------------------------------------------------------------------
const hash = new URLSearchParams(location.hash.slice(1));
const hashNumber = (key, allowed, fallback) => {
  const value = Number(hash.get(key));
  if (!hash.has(key) || !Number.isFinite(value)) return fallback;
  return allowed && !allowed.includes(value) ? fallback : value;
};

const savedStructures = (() => {
  try {
    const saved = JSON.parse(readStorage('seedmap:structures'));
    return Array.isArray(saved) ? new Set(saved) : null;
  } catch {
    return null;
  }
})();

const state = {
  seedText: hash.get('seed')?.trim() || randomSeedText(),
  seed: 0n,
  version: VERSIONS.some(([v]) => v === hash.get('v')) ? hash.get('v') : VERSIONS[0][0],
  dim: hashNumber('d', [0, -1, 1], 0),
  y: hashNumber('y', [64, 0, -40], 64),
  x: clamp(Math.round(hashNumber('x', null, 0)), -WORLD_LIMIT, WORLD_LIMIT),
  z: clamp(Math.round(hashNumber('z', null, 0)), -WORLD_LIMIT, WORLD_LIMIT),
  zoom: clamp(Math.round(hashNumber('zoom', null, DEFAULT_ZOOM)), 0, ZOOMS.length - 1),
  enabled: savedStructures ?? new Set(STRUCTURES.filter((s) => s.on).map((s) => s.name)),
};
state.seed = seedFromText(state.seedText);
// Sem coordenada no link, abre no spawn da seed (que nem sempre é 0, 0).
let centerOnSpawn = !hash.has('x');

let hashTimer = 0;
function writeHash() {
  clearTimeout(hashTimer);
  hashTimer = setTimeout(() => {
    const params = new URLSearchParams({
      seed: state.seedText,
      v: state.version,
      d: String(state.dim),
      y: String(state.y),
      x: String(Math.round(state.x)),
      z: String(Math.round(state.z)),
      zoom: String(state.zoom),
    });
    history.replaceState(null, '', `#${params}`);
    // Trocar de língua mantém o mesmo mapa: os links do seletor levam o mesmo #seed=… junto.
    for (const link of document.querySelectorAll('.lang-switch a')) link.hash = String(params);
  }, 250);
}

// --- Workers ------------------------------------------------------------------------------
const workers = [];
const calls = new Map();
let callSeq = 0;

function startWorkers() {
  for (let i = 0; i < POOL_SIZE; i++) {
    const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    const slot = { worker, busy: 0 };
    worker.onmessage = ({ data }) => {
      const pending = calls.get(data.id);
      if (!pending) return;
      calls.delete(data.id);
      slot.busy--;
      if (data.error) pending.reject(new Error(data.error));
      else pending.resolve(data);
      requestDraw();
    };
    worker.onerror = (event) => {
      event.preventDefault();
      fail(T.workerFail);
    };
    workers.push(slot);
  }
}

function call(msg, slot = workers.reduce((a, b) => (b.busy < a.busy ? b : a))) {
  const id = ++callSeq;
  slot.busy++;
  return new Promise((resolve, reject) => {
    calls.set(id, { resolve, reject });
    slot.worker.postMessage({ ...msg, id });
  });
}

// --- Mundo ----------------------------------------------------------------------------------
let world = null;
let gen = 0;
let loadedOnce = false;
const tiles = new Map();
const pendingTiles = new Set();
const structs = new Map();
const pendingStructs = new Set();

async function loadWorld() {
  const myGen = ++gen;
  closePopover();
  for (const tile of tiles.values()) tile.bitmap.close();
  tiles.clear();
  pendingTiles.clear();
  structs.clear();
  pendingStructs.clear();
  world = null;
  requestDraw();

  const base = {
    type: 'init',
    gen: myGen,
    version: state.version,
    dim: state.dim,
    seed: state.seed.toString(),
    structs: STRUCTURES.filter((s) => s !== STRONGHOLD).map((s) => s.name),
  };
  try {
    const [first] = await Promise.all(workers.map((slot, i) => call({ ...base, extras: i === 0 }, slot)));
    if (myGen !== gen) return;
    world = { ...first, strongholds: [] };
    // Fortalezas chegam depois, no primeiro worker: o mapa já começa a desenhar sem elas.
    if (state.dim === 0) {
      call({ type: 'strongholds', gen: myGen }, workers[0])
        .then((res) => {
          if (myGen !== gen || res.skipped) return;
          world.strongholds = res.strongholds;
          requestDraw();
        })
        .catch(() => undefined);
    }
    if (centerOnSpawn && world.spawn) {
      [state.x, state.z] = world.spawn;
    }
    centerOnSpawn = false;
    loadedOnce = true;
    setStatus(null);
    renderStructureList();
    requestDraw();
  } catch (err) {
    if (myGen === gen) fail(T.seedFail(err.message));
  }
}

// --- Tiles de biomas -------------------------------------------------------------------------
const size = { W: 0, H: 0, dpr: 1 };
const bpp = () => ZOOMS[state.zoom];
const screenX = (bx) => (bx - state.x) / bpp() + size.W / 2;
const screenZ = (bz) => (bz - state.z) / bpp() + size.H / 2;
const blockX = (sx) => (sx - size.W / 2) * bpp() + state.x;
const blockZ = (sz) => (sz - size.H / 2) * bpp() + state.z;

function viewRect(marginPx = 0) {
  const b = bpp();
  return {
    x0: state.x - (size.W / 2 + marginPx) * b,
    x1: state.x + (size.W / 2 + marginPx) * b,
    z0: state.z - (size.H / 2 + marginPx) * b,
    z1: state.z + (size.H / 2 + marginPx) * b,
  };
}

/** Em cada zoom, um tile tem 256 px; a escala de amostragem (1:4 a 1:256) mantém no máximo 256 células por lado. */
function levelInfo(zoom) {
  const b = ZOOMS[zoom];
  const blocks = TILE * b;
  const scale = [4, 16, 64, 256].find((s) => s >= b);
  return { blocks, scale, cells: blocks / scale };
}

const tileKey = (zoom, tx, tz) => `${zoom}:${tx}:${tz}`;

function visibleTiles(zoom) {
  const { blocks } = levelInfo(zoom);
  const r = viewRect();
  const list = [];
  for (let tz = Math.floor(r.z0 / blocks); tz <= Math.floor(r.z1 / blocks); tz++) {
    for (let tx = Math.floor(r.x0 / blocks); tx <= Math.floor(r.x1 / blocks); tx++) list.push([tx, tz]);
  }
  return list;
}

function storeTile(key, tile) {
  tiles.set(key, tile);
  if (tiles.size <= MAX_TILES) return;
  const visible = new Set(visibleTiles(state.zoom).map(([tx, tz]) => tileKey(state.zoom, tx, tz)));
  for (const [k, t] of tiles) {
    if (tiles.size <= MAX_TILES) break;
    if (visible.has(k)) continue;
    t.bitmap.close();
    tiles.delete(k);
  }
}

function scheduleTiles() {
  const zoom = state.zoom;
  const info = levelInfo(zoom);
  const cx = state.x / info.blocks - 0.5;
  const cz = state.z / info.blocks - 0.5;
  const missing = visibleTiles(zoom)
    .filter(([tx, tz]) => !tiles.has(tileKey(zoom, tx, tz)) && !pendingTiles.has(tileKey(zoom, tx, tz)))
    .sort((a, b) => Math.hypot(a[0] - cx, a[1] - cz) - Math.hypot(b[0] - cx, b[1] - cz));

  const myGen = gen;
  const y = state.dim === 0 ? state.y : 64;
  for (const [tx, tz] of missing) {
    if (calls.size >= POOL_SIZE * 2) break;
    const key = tileKey(zoom, tx, tz);
    pendingTiles.add(key);
    call({
      type: 'tile',
      gen: myGen,
      scale: info.scale,
      x: (tx * info.blocks) / info.scale,
      z: (tz * info.blocks) / info.scale,
      size: info.cells,
      y: Math.floor(y / 4),
    })
      .then(async (res) => {
        if (myGen !== gen || res.skipped) return;
        const bitmap = await createImageBitmap(new ImageData(new Uint8ClampedArray(res.rgba), info.cells, info.cells));
        if (myGen !== gen) return bitmap.close();
        storeTile(key, { zoom, tx, tz, info, bitmap, ids: new Uint8Array(res.ids) });
        requestDraw();
      })
      .catch(() => undefined)
      .finally(() => pendingTiles.delete(key));
  }
}

// --- Estruturas --------------------------------------------------------------------------------
function activeStructures() {
  if (!world) return [];
  return STRUCTURES.filter(
    (s) => s !== STRONGHOLD && s.dim === state.dim && state.enabled.has(s.name) && bpp() <= s.maxBpp && world.regions[s.name] > 0,
  );
}

function structureTiles(def, marginPx = 16) {
  const tb = world.regions[def.name] * 16 * REGIONS_PER_TILE;
  const r = viewRect(marginPx);
  const list = [];
  for (let tz = Math.floor(r.z0 / tb); tz <= Math.floor(r.z1 / tb); tz++) {
    for (let tx = Math.floor(r.x0 / tb); tx <= Math.floor(r.x1 / tb); tx++) list.push([tx, tz, tb]);
  }
  return list;
}

function scheduleStructures() {
  if (calls.size > POOL_SIZE * 2) return;
  const batch = [];
  collect: for (const def of activeStructures()) {
    for (const [tx, tz, tb] of structureTiles(def)) {
      const key = `${def.name}:${tx}:${tz}`;
      if (structs.has(key) || pendingStructs.has(key)) continue;
      batch.push({ key, name: def.name, x0: tx * tb, z0: tz * tb, x1: (tx + 1) * tb - 1, z1: (tz + 1) * tb - 1 });
      if (batch.length >= 48) break collect;
    }
  }
  if (!batch.length) return;

  const myGen = gen;
  for (const item of batch) pendingStructs.add(item.key);
  if (structs.size > 6000) structs.clear();
  call({ type: 'structures', gen: myGen, items: batch })
    .then((res) => {
      if (myGen !== gen || res.skipped) return;
      batch.forEach((item, i) => structs.set(item.key, res.results[i]));
    })
    .catch(() => undefined)
    .finally(() => batch.forEach((item) => pendingStructs.delete(item.key)));
}

function visibleMarkers() {
  if (!world) return [];
  const r = viewRect(12);
  const inView = (x, z) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
  const markers = [];
  for (const def of activeStructures()) {
    for (const [tx, tz] of structureTiles(def)) {
      for (const [x, z] of structs.get(`${def.name}:${tx}:${tz}`) ?? []) if (inView(x, z)) markers.push({ def, x, z });
    }
  }
  if (state.dim === 0 && state.enabled.has('stronghold')) {
    for (const [x, z] of world.strongholds) if (inView(x, z)) markers.push({ def: STRONGHOLD, x, z });
  }
  return markers;
}

function nearestMarker(px, py) {
  let best = null;
  let bestDist = 16;
  const candidates = visibleMarkers();
  if (world?.spawn && state.dim === 0) candidates.push({ def: { name: 'spawn', label: T.spawn }, x: world.spawn[0], z: world.spawn[1] });
  for (const m of candidates) {
    const d = Math.hypot(screenX(m.x) - px, screenZ(m.z) - py);
    if (d < bestDist) {
      bestDist = d;
      best = m;
    }
  }
  return best;
}

// --- Desenho ------------------------------------------------------------------------------------
let drawQueued = false;
function requestDraw() {
  if (drawQueued) return;
  drawQueued = true;
  requestAnimationFrame(() => {
    drawQueued = false;
    draw();
    if (world) {
      scheduleTiles();
      scheduleStructures();
    }
    updateHud();
    scheduleLegend();
    writeHash();
  });
}

function drawTile(tile) {
  const { blocks } = tile.info;
  const x0 = Math.round(screenX(tile.tx * blocks));
  const z0 = Math.round(screenZ(tile.tz * blocks));
  const x1 = Math.round(screenX((tile.tx + 1) * blocks));
  const z1 = Math.round(screenZ((tile.tz + 1) * blocks));
  if (x1 < 0 || z1 < 0 || x0 > size.W || z0 > size.H) return;
  ctx.drawImage(tile.bitmap, x0, z0, x1 - x0, z1 - z0);
}

function drawMarker(sx, sz, color, radius) {
  const x = Math.round(sx);
  const z = Math.round(sz);
  ctx.fillStyle = '#111112';
  ctx.fillRect(x - radius - 2, z - radius - 2, radius * 2 + 4, radius * 2 + 4);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x - radius - 1, z - radius - 1, radius * 2 + 2, radius * 2 + 2);
  ctx.fillStyle = color;
  ctx.fillRect(x - radius, z - radius, radius * 2, radius * 2);
}

/** Moldura em volta de um ícone do mapa (contorno escuro para aparecer em qualquer bioma) e o nome em cima. */
function drawMarkerHighlight(m, scale, color) {
  const half = (12 * scale) / 2 + 3;
  const x = Math.round(screenX(m.x));
  const z = Math.round(screenZ(m.z));
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#111112';
  ctx.strokeRect(x - half, z - half, half * 2, half * 2);
  ctx.lineWidth = 2;
  ctx.strokeStyle = color;
  ctx.strokeRect(x - half, z - half, half * 2, half * 2);
  // O spawn já mostra o nome o tempo todo.
  if (m.def.name !== 'spawn') drawLabel(m.def.label, x, z - half - 4);
}

/** Mira no ponto clicado; com zoom perto, contorna também o bloco exato. */
function drawCrosshair(bx, bz) {
  const blockPx = 1 / bpp();
  const x = Math.round(screenX(bx + 0.5));
  const z = Math.round(screenZ(bz + 0.5));
  if (blockPx >= 6) {
    const x0 = Math.round(screenX(bx));
    const z0 = Math.round(screenZ(bz));
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#111112';
    ctx.strokeRect(x0, z0, Math.round(blockPx), Math.round(blockPx));
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#5cec01';
    ctx.strokeRect(x0 + 0.5, z0 + 0.5, Math.round(blockPx) - 1, Math.round(blockPx) - 1);
  }
  // Braços grossos com um anel vazio no meio: dá para ver o ponto exato e o bioma embaixo dele.
  const arms = [
    [-17, -2, 10, 4],
    [7, -2, 10, 4],
    [-2, -17, 4, 10],
    [-2, 7, 4, 10],
  ];
  const ring = (inset, color) => {
    ctx.fillStyle = color;
    const s = 12 - inset * 2;
    ctx.fillRect(x - 6 + inset, z - 6 + inset, s, 2);
    ctx.fillRect(x - 6 + inset, z + 4 - inset, s, 2);
    ctx.fillRect(x - 6 + inset, z - 6 + inset, 2, s);
    ctx.fillRect(x + 4 - inset, z - 6 + inset, 2, s);
  };
  ctx.fillStyle = '#111112';
  for (const [dx, dz, w, h] of arms) ctx.fillRect(x + dx - 1, z + dz - 1, w + 2, h + 2);
  ctx.fillRect(x - 7, z - 7, 14, 2);
  ctx.fillRect(x - 7, z + 5, 14, 2);
  ctx.fillRect(x - 7, z - 7, 2, 14);
  ctx.fillRect(x + 5, z - 7, 2, 14);
  ctx.fillStyle = '#5cec01';
  for (const [dx, dz, w, h] of arms) ctx.fillRect(x + dx, z + dz, w, h);
  ring(0, '#5cec01');
}

function drawLabel(text, x, z) {
  ctx.font = '700 12px Monocraft, ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#111112';
  ctx.strokeText(text, x, z);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, x, z);
}

function drawScale() {
  const b = bpp();
  const steps = [16, 32, 64, 128, 256, 500, 1000, 2000, 5000, 10000, 20000, 50000];
  const blocks = steps.find((s) => s / b >= 80) ?? steps.at(-1);
  const px = Math.round(blocks / b);
  const x0 = 14;
  const y = 42;
  ctx.fillStyle = 'rgb(17 17 18 / 0.88)';
  ctx.fillRect(x0 - 8, 8, px + 16, 44);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x0, y, px, 3);
  ctx.fillRect(x0, y - 5, 2, 8);
  ctx.fillRect(x0 + px - 2, y - 5, 2, 8);
  ctx.font = '12px Monocraft, ui-monospace, monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(T.blocks(blocks.toLocaleString(NUMBER_LOCALE)), x0, y - 10);
}

function draw() {
  const { W, H, dpr } = size;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#111112';
  ctx.fillRect(0, 0, W, H);
  if (!world) return;

  // Enquanto o zoom atual calcula, mostra o que já existe de outros zooms (do mais distante ao mais próximo).
  const others = [];
  for (const tile of tiles.values()) if (tile.zoom !== state.zoom) others.push(tile);
  others.sort((a, b) => Math.abs(b.zoom - state.zoom) - Math.abs(a.zoom - state.zoom));
  others.forEach(drawTile);
  for (const [tx, tz] of visibleTiles(state.zoom)) {
    const tile = tiles.get(tileKey(state.zoom, tx, tz));
    if (tile) drawTile(tile);
  }

  // Grade de chunks quando dá para ver os blocos.
  if (bpp() <= 0.5) {
    const r = viewRect();
    ctx.fillStyle = 'rgb(0 0 0 / 0.22)';
    for (let bx = Math.floor(r.x0 / 16) * 16; bx <= r.x1; bx += 16) ctx.fillRect(Math.round(screenX(bx)), 0, 1, H);
    for (let bz = Math.floor(r.z0 / 16) * 16; bz <= r.z1; bz += 16) ctx.fillRect(0, Math.round(screenZ(bz)), W, 1);
  }

  // Ícone em 24 px; bem afastado cai para 12 px, senão os ícones escondem os biomas.
  const iconScale = bpp() >= 64 ? 1 : 2;
  for (const m of visibleMarkers()) {
    const icon = iconCanvas(m.def.name, iconScale);
    ctx.drawImage(icon, Math.round(screenX(m.x) - icon.width / 2), Math.round(screenZ(m.z) - icon.height / 2));
  }

  // Spawn: a bússola, sempre com o nome em cima.
  if (world.spawn && state.dim === 0) {
    const icon = iconCanvas('spawn', iconScale);
    const sx = Math.round(screenX(world.spawn[0]));
    const sz = Math.round(screenZ(world.spawn[1]));
    ctx.drawImage(icon, sx - icon.width / 2, sz - icon.height / 2);
    drawLabel(T.spawn, sx, sz - icon.height / 2 - 3);
  }

  // Destaques: quem está sob o mouse (branco, com o nome) e o que foi clicado (verde).
  // nearestMarker cria um objeto novo a cada movimento: compara pela posição, não pelo objeto.
  const hoveringSelected = hovered && selected?.marker && hovered.x === selected.marker.x && hovered.z === selected.marker.z;
  if (hovered && !hoveringSelected) drawMarkerHighlight(hovered, iconScale, '#ffffff');
  if (selected) {
    if (selected.marker) drawMarkerHighlight(selected.marker, iconScale, '#5cec01');
    else drawCrosshair(selected.x, selected.z);
  }

  drawScale();
}

// --- HUD e legenda -------------------------------------------------------------------------------
let pointer = null;
// Estrutura (ou spawn) sob o mouse e o ponto clicado: os dois ganham destaque no mapa.
let hovered = null;
let selected = null;

function biomeAt(bx, bz) {
  const direct = (zoom) => {
    const info = levelInfo(zoom);
    const tile = tiles.get(tileKey(zoom, Math.floor(bx / info.blocks), Math.floor(bz / info.blocks)));
    if (!tile) return null;
    const cx = Math.floor((bx - tile.tx * info.blocks) / info.scale);
    const cz = Math.floor((bz - tile.tz * info.blocks) / info.scale);
    return tile.ids[cz * info.cells + cx];
  };
  let id = direct(state.zoom);
  for (let d = 1; id == null && d < ZOOMS.length; d++) id = direct(state.zoom - d) ?? direct(state.zoom + d);
  return id;
}

function biomeName(id) {
  const internal = world?.names[id];
  if (!internal) return '—';
  return BIOME_NAMES[internal] ?? internal.replaceAll('_', ' ');
}

function updateHud() {
  const px = pointer ?? { x: size.W / 2, y: size.H / 2 };
  const bx = Math.floor(blockX(px.x));
  const bz = Math.floor(blockZ(px.y));
  els.hudCoords.textContent = `X ${bx} · Z ${bz}`;
  if (!world) {
    els.hudBiome.textContent = T.computing;
    return;
  }
  const marker = pointer && nearestMarker(px.x, px.y);
  els.hudBiome.textContent = marker ? `${marker.def.label} · ${marker.x} ${marker.z}` : biomeName(biomeAt(bx, bz));
}

let legendTimer = 0;
function scheduleLegend() {
  if (legendTimer) return;
  legendTimer = setTimeout(() => {
    legendTimer = 0;
    updateLegend();
  }, 350);
}

function updateLegend() {
  if (!world) return;
  const counts = new Uint32Array(256);
  let total = 0;
  const { blocks, scale, cells } = levelInfo(state.zoom);
  const r = viewRect();
  for (const [tx, tz] of visibleTiles(state.zoom)) {
    const tile = tiles.get(tileKey(state.zoom, tx, tz));
    if (!tile) continue;
    const cx0 = clamp(Math.floor((r.x0 - tx * blocks) / scale), 0, cells);
    const cx1 = clamp(Math.ceil((r.x1 - tx * blocks) / scale), 0, cells);
    const cz0 = clamp(Math.floor((r.z0 - tz * blocks) / scale), 0, cells);
    const cz1 = clamp(Math.ceil((r.z1 - tz * blocks) / scale), 0, cells);
    for (let cz = cz0; cz < cz1; cz++) {
      for (let cx = cx0; cx < cx1; cx++) counts[tile.ids[cz * cells + cx]]++;
    }
    total += (cx1 - cx0) * (cz1 - cz0);
  }

  if (!total) {
    const li = document.createElement('li');
    li.className = 'legend-empty';
    li.textContent = T.computingTitle;
    els.legend.replaceChildren(li);
    return;
  }
  const top = [...counts.entries()]
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12);
  els.legend.replaceChildren(
    ...top.map(([id, count]) => {
      const li = document.createElement('li');
      const swatch = document.createElement('span');
      swatch.className = 'swatch';
      swatch.style.background = `rgb(${world.colors[id * 3]} ${world.colors[id * 3 + 1]} ${world.colors[id * 3 + 2]})`;
      const name = document.createElement('span');
      name.textContent = biomeName(id);
      const pct = document.createElement('span');
      pct.className = 'pct';
      const share = (count / total) * 100;
      pct.textContent = share < 1 ? '<1%' : `${Math.round(share)}%`;
      li.append(swatch, name, pct);
      return li;
    }),
  );
}

function renderStructureList() {
  const defs = STRUCTURES.filter((s) => s.dim === state.dim);
  els.structures.replaceChildren(
    ...defs.map((def) => {
      const supported = def === STRONGHOLD || (world?.regions[def.name] ?? 0) > 0;
      const label = document.createElement('label');
      label.className = 'tuc-choice structure-item';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.className = 'tuc-check';
      input.id = `st-${def.name}`;
      input.checked = state.enabled.has(def.name);
      input.disabled = !supported;
      input.addEventListener('change', () => {
        if (input.checked) state.enabled.add(def.name);
        else state.enabled.delete(def.name);
        writeStorage('seedmap:structures', JSON.stringify([...state.enabled]));
        requestDraw();
      });
      const swatch = iconSvg(def.name, 22);
      const name = document.createElement('span');
      name.textContent = def.label;
      const hint = document.createElement('span');
      hint.className = 'hint';
      hint.textContent = !supported ? T.notHere : bpp() > def.maxBpp ? T.zoomHint : '';
      label.append(input, swatch, name, hint);
      return label;
    }),
  );
}

function setStatus(text, isError = false) {
  els.status.hidden = !text;
  els.statusText.textContent = text ?? '';
  els.status.classList.toggle('is-error', isError);
}

function fail(message) {
  setStatus(message, true);
}

// --- Interação -------------------------------------------------------------------------------------
// --- Caixinha de coordenadas e teleporte -------------------------------------------------------------
const SEA_LEVEL = 63;
// Estruturas que ficam embaixo da terra: o teleporte leva para a superfície logo acima.
const UNDERGROUND = new Set(['stronghold', 'ancient_city', 'trial_chambers', 'trail_ruins']);
let popToken = 0;

function closePopover() {
  popToken++;
  els.pop.hidden = true;
  // A mira do ponto clicado some junto com a caixinha.
  if (selected) {
    selected = null;
    requestDraw();
  }
}

function placePopover(point) {
  const { offsetWidth: w, offsetHeight: h } = els.pop;
  let left = point.x + 16;
  let top = point.y + 16;
  if (left + w > size.W - 8) left = point.x - w - 16;
  if (top + h > size.H - 8) top = point.y - h - 16;
  els.pop.style.left = `${clamp(left, 8, Math.max(8, size.W - w - 8))}px`;
  els.pop.style.top = `${clamp(top, 8, Math.max(8, size.H - h - 8))}px`;
}

function swatchFor(color) {
  const swatch = document.createElement('span');
  swatch.className = 'swatch';
  swatch.style.background = color;
  return swatch;
}

/** Comando de teleporte e a explicação de onde a pessoa vai parar. */
function teleportFor(x, z, y, marker) {
  if (state.dim === -1) {
    return {
      coords: `X ${x} · Z ${z}`,
      command: `/execute in minecraft:the_nether run spreadplayers ${x} ${z} 0 1 under 120 false @s`,
      note: T.netherNote,
    };
  }
  if (state.dim === 1) {
    return {
      coords: `X ${x} · Z ${z}`,
      command: `/execute in minecraft:the_end run spreadplayers ${x} ${z} 0 1 false @s`,
      note: T.endNote,
    };
  }
  if (y == null) {
    return {
      coords: `X ${x} · Z ${z}`,
      command: `/spreadplayers ${x} ${z} 0 1 false @s`,
      note: T.highestNote,
    };
  }
  const top = Math.max(y, SEA_LEVEL);
  let note = T.groundNote;
  if (y < SEA_LEVEL) note = T.waterNote;
  else if (marker && UNDERGROUND.has(marker.def.name)) note = T.undergroundNote;
  return { coords: `X ${x} · Y ${top} · Z ${z}`, command: `/tp @s ${x} ${top} ${z}`, note };
}

async function openPopover(point) {
  if (!world) return;
  const marker = nearestMarker(point.x, point.y);
  const x = marker ? marker.x : Math.floor(blockX(point.x));
  const z = marker ? marker.z : Math.floor(blockZ(point.y));
  const token = ++popToken;
  // Marca no mapa o ponto (ou a estrutura) das coordenadas da caixinha.
  selected = { x, z, marker };
  requestDraw();

  if (marker?.def.name) els.popIcon.replaceChildren(iconSvg(marker.def.name, 24));
  else if (marker) els.popIcon.replaceChildren(swatchFor('#f7cf5c'));
  else {
    const id = biomeAt(x, z);
    const c = id == null ? null : id * 3;
    els.popIcon.replaceChildren(swatchFor(c == null ? '#4a4b4d' : `rgb(${world.colors[c]} ${world.colors[c + 1]} ${world.colors[c + 2]})`));
  }
  els.popTitle.textContent = marker ? marker.def.label : biomeName(biomeAt(x, z));
  els.popCoords.textContent = `X ${x} · Z ${z}`;
  els.popCommand.value = '';
  els.popNote.textContent = T.computingHeight;
  els.popCopy.disabled = true;
  els.pop.hidden = false;
  placePopover(point);

  let y = null;
  if (state.dim === 0) {
    try {
      const res = await call({ type: 'surface', gen, x, z });
      if (!res.skipped) y = res.y;
    } catch {
      // sem altura: cai no spreadplayers, que acha o chão sozinho
    }
  }
  if (token !== popToken) return;
  const tp = teleportFor(x, z, y, marker);
  els.popCoords.textContent = tp.coords;
  els.popCommand.value = tp.command;
  els.popNote.textContent = tp.note;
  els.popCopy.disabled = false;
  placePopover(point);
}

els.popClose.addEventListener('click', closePopover);
els.popCopy.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(els.popCommand.value);
    toast.success(T.commandCopied, { position: 'bottom-center' });
  } catch {
    els.popCommand.select();
    toast.warning(T.commandCopyFail, { position: 'bottom-center' });
  }
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !els.pop.hidden) closePopover();
});

function setZoom(zoom, px = size.W / 2, py = size.H / 2) {
  const next = clamp(zoom, 0, ZOOMS.length - 1);
  if (next === state.zoom) return;
  closePopover();
  const bx = blockX(px);
  const bz = blockZ(py);
  state.zoom = next;
  state.x = clamp(bx - (px - size.W / 2) * bpp(), -WORLD_LIMIT, WORLD_LIMIT);
  state.z = clamp(bz - (py - size.H / 2) * bpp(), -WORLD_LIMIT, WORLD_LIMIT);
  renderStructureList();
  requestDraw();
}

function panBy(dxPx, dzPx) {
  if (dxPx || dzPx) closePopover();
  state.x = clamp(state.x - dxPx * bpp(), -WORLD_LIMIT, WORLD_LIMIT);
  state.z = clamp(state.z - dzPx * bpp(), -WORLD_LIMIT, WORLD_LIMIT);
  requestDraw();
}

const pointers = new Map();
let pinchDistance = 0;
let moved = false;
let downPoint = null;

function localPoint(event) {
  const rect = els.canvas.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

els.canvas.addEventListener('pointerdown', (event) => {
  pointers.set(event.pointerId, localPoint(event));
  // A captura só melhora o arrastar para fora do mapa; se o navegador recusar, o clique segue valendo.
  try {
    els.canvas.setPointerCapture(event.pointerId);
  } catch {
    // ponteiro sem captura (alguns eventos sintéticos e canetas)
  }
  moved = false;
  downPoint = localPoint(event);
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    pinchDistance = Math.hypot(a.x - b.x, a.y - b.y);
  }
});

els.canvas.addEventListener('pointermove', (event) => {
  const point = localPoint(event);
  const previous = pointers.get(event.pointerId);
  if (event.pointerType === 'mouse') pointer = point;
  if (!previous) {
    // Só passando o mouse: destaca a estrutura sob ele e troca o cursor para a mão de clique.
    const over = event.pointerType === 'mouse' ? nearestMarker(point.x, point.y) : null;
    if (over?.x !== hovered?.x || over?.z !== hovered?.z) hovered = over;
    els.canvas.classList.toggle('is-over-marker', !!over);
    requestDraw();
    return;
  }
  pointers.set(event.pointerId, point);
  if (pointers.size === 1) {
    // Tremida de até 4 px ainda conta como clique (abre a caixinha), não como arrastar.
    if (downPoint && Math.hypot(point.x - downPoint.x, point.y - downPoint.y) > 4) {
      moved = true;
      els.canvas.classList.add('is-dragging');
    }
    panBy(point.x - previous.x, point.y - previous.y);
  } else if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    const distance = Math.hypot(a.x - b.x, a.y - b.y);
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    moved = true;
    if (distance / pinchDistance > 1.6) {
      setZoom(state.zoom - 1, mid.x, mid.y);
      pinchDistance = distance;
    } else if (distance / pinchDistance < 0.62) {
      setZoom(state.zoom + 1, mid.x, mid.y);
      pinchDistance = distance;
    }
  }
});

function endPointer(event) {
  if (!pointers.has(event.pointerId)) return;
  pointers.delete(event.pointerId);
  // Clique ou toque sem arrastar: abre a caixinha com as coordenadas daquele ponto (ou da estrutura).
  if (!moved && pointers.size === 0) {
    const point = localPoint(event);
    if (event.pointerType !== 'mouse') pointer = point;
    if (event.pointerType !== 'mouse' || event.button === 0) openPopover(point);
    requestDraw();
  }
  if (!pointers.size) els.canvas.classList.remove('is-dragging');
}
els.canvas.addEventListener('pointerup', endPointer);
els.canvas.addEventListener('pointercancel', endPointer);
els.canvas.addEventListener('pointerleave', (event) => {
  if (event.pointerType === 'mouse' && !pointers.size) {
    pointer = null;
    hovered = null;
    els.canvas.classList.remove('is-over-marker');
    requestDraw();
  }
});

let wheelDelta = 0;
els.canvas.addEventListener(
  'wheel',
  (event) => {
    event.preventDefault();
    wheelDelta += event.deltaMode === 1 ? event.deltaY * 30 : event.deltaY;
    if (Math.abs(wheelDelta) < 60) return;
    const point = localPoint(event);
    setZoom(state.zoom + Math.sign(wheelDelta), point.x, point.y);
    wheelDelta = 0;
  },
  { passive: false },
);

els.canvas.addEventListener('dblclick', (event) => {
  const point = localPoint(event);
  setZoom(state.zoom - 1, point.x, point.y);
});

els.canvas.addEventListener('keydown', (event) => {
  const step = 96;
  const actions = {
    ArrowLeft: () => panBy(step, 0),
    ArrowRight: () => panBy(-step, 0),
    ArrowUp: () => panBy(0, step),
    ArrowDown: () => panBy(0, -step),
    '+': () => setZoom(state.zoom - 1),
    '=': () => setZoom(state.zoom - 1),
    '-': () => setZoom(state.zoom + 1),
  };
  if (!actions[event.key]) return;
  event.preventDefault();
  actions[event.key]();
});

els.zoomIn.addEventListener('click', () => setZoom(state.zoom - 1));
els.zoomOut.addEventListener('click', () => setZoom(state.zoom + 1));
// O botão usa a mesma bússola do spawn no mapa.
els.toSpawn.replaceChildren(iconSvg('spawn', 18));
els.toSpawn.addEventListener('click', () => {
  [state.x, state.z] = world?.spawn && state.dim === 0 ? world.spawn : [0, 0];
  requestDraw();
});

function applySeedInput() {
  const text = els.seed.value.trim() || randomSeedText();
  els.seed.value = text;
  if (text === state.seedText) return;
  state.seedText = text;
  state.seed = seedFromText(text);
  centerOnSpawn = true;
  loadWorld();
}

function goTo() {
  const numbers = els.goto.value.match(/-?\d+/g)?.map(Number) ?? [];
  if (numbers.length < 2) {
    els.goto.setAttribute('aria-invalid', 'true');
    toast.warning(T.gotoInvalid, { position: 'bottom-center' });
    return;
  }
  els.goto.removeAttribute('aria-invalid');
  // "X Y Z" (como aparece no F3) também funciona: usa o primeiro e o último número.
  state.x = clamp(numbers[0], -WORLD_LIMIT, WORLD_LIMIT);
  state.z = clamp(numbers.at(-1), -WORLD_LIMIT, WORLD_LIMIT);
  pointer = null;
  requestDraw();
}

els.seed.addEventListener('change', applySeedInput);
els.goto.addEventListener('input', () => els.goto.removeAttribute('aria-invalid'));
els.controls.addEventListener('submit', (event) => {
  event.preventDefault();
  if (document.activeElement === els.seed) applySeedInput();
  else goTo();
});
els.random.addEventListener('click', () => {
  els.seed.value = randomSeedText();
  applySeedInput();
});
// Os três seletores são o Select do Tucano: a mudança chega pelo onChange dele.
function onVersionChange(value) {
  if (!value || value === state.version) return;
  state.version = value;
  loadWorld();
}
function onDimensionChange(value) {
  if (value === '' || Number(value) === state.dim) return;
  state.dim = Number(value);
  // Nether e End não têm cavernas por altura no mapa: o campo some em vez de ficar ali sem efeito.
  els.heightField.hidden = state.dim !== 0;
  renderStructureList();
  loadWorld();
}
function onHeightChange(value) {
  if (value === '' || Number(value) === state.y) return;
  state.y = Number(value);
  loadWorld();
}

els.share.addEventListener('click', async () => {
  clearTimeout(hashTimer);
  writeHash();
  await new Promise((resolve) => setTimeout(resolve, 260));
  try {
    await navigator.clipboard.writeText(location.href);
    toast.success(T.linkCopied, { position: 'bottom-center' });
  } catch {
    toast.warning(T.linkCopyFail, { position: 'bottom-center' });
  }
});

// --- Início --------------------------------------------------------------------------------------------
els.version.replaceChildren(...VERSIONS.map(([value, label]) => new Option(label, value)));
els.seed.value = state.seedText;
els.version.value = state.version;
els.dimension.value = String(state.dim);
els.height.value = String(state.y);
els.heightField.hidden = state.dim !== 0;

// Listas curtas e sempre com valor: sem busca e sem o X de limpar.
const selectOptions = { clearable: false, search: false };
new Select(els.version, { ...selectOptions, onChange: onVersionChange });
new Select(els.dimension, { ...selectOptions, onChange: onDimensionChange });
new Select(els.height, { ...selectOptions, onChange: onHeightChange });
// Dicas (data-tuc-tip) dos botões.
initTucano(document);

new ResizeObserver(() => {
  const rect = els.canvas.getBoundingClientRect();
  size.dpr = Math.min(window.devicePixelRatio || 1, 2);
  size.W = rect.width;
  size.H = rect.height;
  els.canvas.width = Math.round(rect.width * size.dpr);
  els.canvas.height = Math.round(rect.height * size.dpr);
  requestDraw();
}).observe(els.canvas);

document.fonts?.ready.then(requestDraw);

if (typeof Worker === 'undefined' || typeof BigInt64Array === 'undefined' || typeof createImageBitmap === 'undefined') {
  fail(T.oldBrowser);
} else {
  setStatus(T.loading);
  renderStructureList();
  startWorkers();
  loadWorld();
}
