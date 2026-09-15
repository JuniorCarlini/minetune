// Ícones das estruturas em pixel art 12x12, desenhados para o Minetune no mesmo estilo
// do bloco de grama do painel (não são texturas do jogo). Cada letra é uma cor da paleta;
// "." é transparente.

const PALETTE = {
  k: '#141414', // contorno
  w: '#ffffff',
  g: '#9a9a9a', // pedra
  G: '#5f5f5f',
  n: '#262626', // interior escuro
  b: '#9c6b3c', // madeira
  B: '#5e3b1d',
  r: '#c0392b', // telhado / tijolo do Nether
  R: '#6e1f1a',
  e: '#46c35a', // verde
  E: '#24753a',
  c: '#3fd3c6', // prismarinho / sculk
  C: '#1f7a73',
  p: '#b36bff', // portal
  P: '#3b2366', // obsidiana
  s: '#f0dca0', // areia
  S: '#c4a86a',
  o: '#ff8a3d', // cobre / terracota
  O: '#a8501c',
  y: '#ffd23f', // ouro
  Y: '#b8860b',
  i: '#e8f6ff', // neve
  I: '#9cc9e3',
  m: '#e3d2ff', // purpur
  M: '#a07fd6',
};

export const STRUCTURE_ICONS = {
  village: [
    '....kkkk....',
    '...krrrrk...',
    '..krrrrrrk..',
    '.krrRrrRrrk.',
    'kkkkkkkkkkkk',
    '.kbbbbbbbbk.',
    '.kbwwbbwwbk.',
    '.kbwwbbwwbk.',
    '.kbbbkkbbbk.',
    '.kbbbkBkbbk.',
    '.kbbbkBkbbk.',
    '.kkkkkkkkkk.',
  ],
  stronghold: [
    '....kkkk....',
    '..kkeeeekk..',
    '.keeEEEEeek.',
    '.keEnnnnEek.',
    'keEnnnnnnEek',
    'keEnnwwnnEek',
    'keEnnwwnnEek',
    'keEnnnnnnEek',
    '.keEnnnnEek.',
    '.keeEEEEeek.',
    '..kkeeeekk..',
    '....kkkk....',
  ],
  pillager_outpost: [
    '.kkkkkkkkkk.',
    '.kBBBBBBBBk.',
    '.kkkkkkkkkk.',
    '..kbbbbbbk..',
    '..kbwbbbbk..',
    '..kbbbbrbk..',
    '..kbbbbrbk..',
    '..kbbbbbbk..',
    '..kbbwbbbk..',
    '..kbbbbbbk..',
    '.kkbbbbbbkk.',
    '.kkkkkkkkkk.',
  ],
  mansion: [
    '.....kk.....',
    '....kBBk....',
    '..kkBBBBkk..',
    '.kBBBBBBBBk.',
    'kkkkkkkkkkkk',
    'kbwbbwbbwbbk',
    'kbbbbbbbbbbk',
    'kbwbbwbbwbbk',
    'kbbbbbbbbbbk',
    'kbwbbkkbbwbk',
    'kbbbbkBbbbbk',
    'kkkkkkkkkkkk',
  ],
  monument: [
    '.....kk.....',
    '....kcck....',
    '...kccCck...',
    '..kcCccCck..',
    '..kcccccck..',
    '.kcCcccccCk.',
    '.kcccwwccck.',
    'kcCcccccccCk',
    'kcccccccccck',
    'kCCCCCCCCCCk',
    'kkkkkkkkkkkk',
    '............',
  ],
  ancient_city: [
    '.kkkkkkkkkk.',
    '.kGGGGGGGGk.',
    '.kGnnnnnnGk.',
    '.kGnccccnGk.',
    '.kGncCCcnGk.',
    '.kGncCCcnGk.',
    '.kGncCCcnGk.',
    '.kGnccccnGk.',
    '.kGnnnnnnGk.',
    'kkGGGGGGGGkk',
    'kGGGGGGGGGGk',
    'kkkkkkkkkkkk',
  ],
  trial_chambers: [
    'kkkkkkkkkkkk',
    'kOoOoOoOoOok',
    'kokkkkkkkkok',
    'koknnnnnnkok',
    'koknooonnkok',
    'koknoOonnkok',
    'koknooonnkok',
    'koknnnnnnkok',
    'kokkkkkkkkok',
    'kOoOoOoOoOok',
    'kkkkkkkkkkkk',
    '............',
  ],
  desert_pyramid: [
    '.....kk.....',
    '....kssk....',
    '....kSSk....',
    '...kssssk...',
    '...kSSSSk...',
    '..kssoossk..',
    '..kSSSSSSk..',
    '.kssssssssk.',
    '.kSSSSSSSSk.',
    'kssssssssssk',
    'kkkkkkkkkkkk',
    '............',
  ],
  jungle_pyramid: [
    '....kkkk....',
    '....kggk....',
    '..kkkkkkkk..',
    '..kgEggEgk..',
    '..kggggggk..',
    'kkkkkkkkkkkk',
    'kgEgggEgggEk',
    'kggknnnkgggk',
    'kgEknnnkgEgk',
    'kggknnnkgggk',
    'kkkkkkkkkkkk',
    '............',
  ],
  swamp_hut: [
    '..kkkkkkkk..',
    '.kBBBBBBBBk.',
    'kBBBBBBBBBBk',
    'kkkkkkkkkkkk',
    '.kbbbbbbbbk.',
    '.kbbkpkbbbk.',
    '.kbbkkkbbbk.',
    '.kkkkkkkkkk.',
    '..kb....bk..',
    '..kb....bk..',
    '..kb....bk..',
    '..kk....kk..',
  ],
  igloo: [
    '............',
    '....kkkk....',
    '..kkiiiikk..',
    '.kiiIiiIiik.',
    '.kiiiiiiiik.',
    'kiIiiiiiiIik',
    'kiiiiknkiiik',
    'kiiiiknkiiik',
    'kIIIIknkIIIk',
    'kkkkkkkkkkkk',
    '............',
    '............',
  ],
  trail_ruins: [
    '....kkkk....',
    '...kOooOk...',
    '....kook....',
    '..kkooookk..',
    '.kooooooook.',
    '.koOkOOkOok.',
    '.koOkOOkOok.',
    '.kooooooook.',
    '.kooooooook.',
    '..kooooook..',
    '...kkkkkk...',
    '............',
  ],
  shipwreck: [
    '.....k......',
    '.....kww....',
    '.....kwww...',
    '.....kwwww..',
    '.....kwww...',
    '.....k......',
    'kkkkkkkkkkkk',
    'kbbbbbbbbbbk',
    '.kbBbbBbbBk.',
    '..kbbbbbbk..',
    '...kkkkkk...',
    '............',
  ],
  ocean_ruin: [
    '............',
    '.kkkk..kkkk.',
    '.kggk..kCck.',
    '.kgGk..kcck.',
    '.kggkkkkcCk.',
    '.kGggggccck.',
    '.kggGggcCck.',
    '.kgggggccck.',
    'kkkkkkkkkkkk',
    'kcccCccccCck',
    'kkkkkkkkkkkk',
    '............',
  ],
  ruined_portal: [
    '.kkkkkkkkk..',
    '.kPPPPPPPk..',
    '.kPkkkkkPk..',
    '.kPkpppkPkk.',
    '.kPkpPpkPPk.',
    '.kPkpppkkPk.',
    '.kPkpppk.kk.',
    '.kPkpPpk....',
    '.kPkkkkkkkk.',
    '.kPPPPPPPPk.',
    '.kkkkkkkkkk.',
    '............',
  ],
  fortress: [
    'kkkkkkkkkkkk',
    'kRrRRrRRrRRk',
    'kRRRRRRRRRRk',
    'kkkkkkkkkkkk',
    '.kRk....kRk.',
    '.kRk....kRk.',
    '.krk....krk.',
    '.kRk....kRk.',
    '.kRk....kRk.',
    '.kRk....kRk.',
    'kkRkk..kkRkk',
    'kkkkk..kkkkk',
  ],
  bastion_remnant: [
    '..kkkkkkkk..',
    '.knnnnnnnnk.',
    'kngnnnnnngnk',
    'knnnkkkknnnk',
    'knnnkyykknnk',
    'knnnkyYkknnk',
    'knnnkkkknnnk',
    'kngnnnnnngnk',
    'knnnnnnnnnnk',
    'kkkkkkkkkkkk',
    '............',
    '............',
  ],
  end_city: [
    '....kkkk....',
    '...kmmmmk...',
    '...kmMMmk...',
    '..kkkkkkkk..',
    '....kmmk....',
    '....kmMk....',
    '..kkkkkkkk..',
    '..kmmmmmmk..',
    '..kmMmmMmk..',
    '..kmmknkmk..',
    '..kmmknkmk..',
    '..kkkkkkkk..',
  ],
};
STRUCTURE_ICONS.ruined_portal_nether = STRUCTURE_ICONS.ruined_portal;

// Spawn do mundo: uma bússola, que no jogo aponta justamente para o spawn.
// Aro de ouro, mostrador branco e a agulha vermelha para cima.
STRUCTURE_ICONS.spawn = [
  '...kkkkkk...',
  '..kYyyyyYk..',
  '.kYywwwwyYk.',
  'kYywwwwrwyYk',
  'kywwwwrrwwyk',
  'kywwwrrwwwyk',
  'kywwwGGwwwyk',
  'kywwGGwwwwyk',
  'kYywGwwwwyYk',
  '.kYywwwwyYk.',
  '..kYyyyyYk..',
  '...kkkkkk...',
];

const canvasCache = new Map();

/** Ícone desenhado num canvas do tamanho pedido (múltiplo de 12), pronto para drawImage. */
export function iconCanvas(name, scale) {
  const key = `${name}@${scale}`;
  if (canvasCache.has(key)) return canvasCache.get(key);
  const rows = STRUCTURE_ICONS[name];
  if (!rows) return null;
  const canvas = document.createElement('canvas');
  canvas.width = rows[0].length * scale;
  canvas.height = rows.length * scale;
  const ctx = canvas.getContext('2d');
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (!PALETTE[ch]) return;
      ctx.fillStyle = PALETTE[ch];
      ctx.fillRect(x * scale, y * scale, scale, scale);
    }),
  );
  canvasCache.set(key, canvas);
  return canvas;
}

/** O mesmo ícone como <svg> nítido, para a lista e a caixinha de coordenadas. */
export function iconSvg(name, size = 24) {
  const rows = STRUCTURE_ICONS[name];
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'structure-icon');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('viewBox', '0 0 12 12');
  svg.setAttribute('shape-rendering', 'crispEdges');
  svg.setAttribute('aria-hidden', 'true');
  rows?.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (!PALETTE[ch]) return;
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', String(x));
      rect.setAttribute('y', String(y));
      rect.setAttribute('width', '1');
      rect.setAttribute('height', '1');
      rect.setAttribute('fill', PALETTE[ch]);
      svg.append(rect);
    }),
  );
  return svg;
}
