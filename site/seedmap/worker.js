// Worker do mapa de seeds: roda o cubiomes (WebAssembly) fora da thread da página.
// Cada mensagem traz um id e recebe uma resposta com o mesmo id.

import createCubiomes from './cubiomes.js';

const OUT_MAX = 4096; // pares x,z por consulta de estruturas

const modulePromise = createCubiomes();
let M = null;
let gen = 0;
let palette = null;
let outPtr = 0;
const structIds = new Map();

function withString(text, fn) {
  const ptr = M.stringToNewUTF8(text);
  try {
    return fn(ptr);
  } finally {
    M._free(ptr);
  }
}

function structId(name) {
  if (!structIds.has(name)) structIds.set(name, withString(name, (ptr) => M._sm_struct_lookup(ptr)));
  return structIds.get(name);
}

function out() {
  outPtr ||= M._malloc(OUT_MAX * 2 * 4);
  return outPtr;
}

// Pares x,z gravados pelo C em out(). Lê M.HEAP32 na hora: a memória pode ter crescido.
function readPairs(count) {
  const heap = M.HEAP32;
  const base = outPtr >> 2;
  const pairs = [];
  for (let i = 0; i < Math.min(count, OUT_MAX); i++) pairs.push([heap[base + 2 * i], heap[base + 2 * i + 1]]);
  return pairs;
}

const handlers = {
  init(msg) {
    gen = msg.gen;
    const mc = withString(msg.version, (ptr) => M._sm_init(ptr, msg.dim, BigInt.asUintN(64, BigInt(msg.seed))));
    if (!mc) throw new Error(`versão não suportada: ${msg.version}`);
    const colorsPtr = M._sm_colors();
    palette = M.HEAPU8.slice(colorsPtr, colorsPtr + 256 * 3);
    if (!msg.extras) return {};

    const names = Array.from({ length: 256 }, (_, id) => {
      const ptr = M._sm_biome_name(id);
      return ptr ? M.UTF8ToString(ptr) : '';
    });
    const regions = Object.fromEntries(msg.structs.map((name) => [name, M._sm_struct_region(structId(name))]));
    const spawn = M._sm_spawn(out()) ? readPairs(1)[0] : null;
    return { colors: palette, names, regions, spawn };
  },

  // Separado do init: as 128 fortalezas levam quase 1 s e o mapa não precisa esperar por elas.
  strongholds(msg) {
    if (msg.gen !== gen) return { skipped: true };
    return { strongholds: readPairs(M._sm_strongholds(out(), OUT_MAX)) };
  },

  tile(msg) {
    if (msg.gen !== gen) return { skipped: true };
    const n = msg.size * msg.size;
    const ptr = M._sm_biomes(msg.scale, msg.x, msg.z, msg.size, msg.size, msg.y);
    if (!ptr) throw new Error('não foi possível gerar os biomas');
    const src = M.HEAP32.subarray(ptr >> 2, (ptr >> 2) + n);
    const ids = new Uint8Array(n);
    const rgba = new Uint8ClampedArray(n * 4);
    for (let i = 0; i < n; i++) {
      const id = src[i] & 0xff;
      const c = id * 3;
      ids[i] = id;
      rgba[i * 4] = palette[c];
      rgba[i * 4 + 1] = palette[c + 1];
      rgba[i * 4 + 2] = palette[c + 2];
      rgba[i * 4 + 3] = 255;
    }
    return { ids, rgba, transfer: [ids.buffer, rgba.buffer] };
  },

  surface(msg) {
    if (msg.gen !== gen) return { skipped: true };
    const y = M._sm_surface(msg.x, msg.z);
    return { y: y === -2147483648 ? null : y };
  },

  structures(msg) {
    if (msg.gen !== gen) return { skipped: true };
    const results = msg.items.map((item) => {
      const count = M._sm_structures(structId(item.name), item.x0, item.z0, item.x1, item.z1, out(), OUT_MAX);
      return count > 0 ? readPairs(count) : [];
    });
    return { results };
  },
};

self.onmessage = async ({ data: msg }) => {
  try {
    M ??= await modulePromise;
    const { transfer = [], ...result } = handlers[msg.type](msg);
    self.postMessage({ ...result, id: msg.id }, transfer);
  } catch (err) {
    self.postMessage({ id: msg.id, error: err instanceof Error ? err.message : String(err) });
  }
};
