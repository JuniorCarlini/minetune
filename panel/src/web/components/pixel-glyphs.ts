/**
 * X e seta desenhados em pixel, na mesma proporção dos ícones da RuneIcons.
 *
 * Os da RuneIcons têm diagonal de 1px e somem em tamanho de botão; a primeira
 * versão daqui ocupava a caixa inteira com traço de 20% e ficou maior e mais
 * pesada que os vizinhos. Agora: grade 16, margem de 2 em volta e traço de 2
 * (~12%), o mesmo peso visual de "Sair", "Salvar" etc. no mesmo tamanho.
 */

const SIZE = 16;
const PAD = 2;
const THICK = 2;

function toIcon(cells: [number, number][]): { viewBox: string; d: string } {
  const unique = [...new Set(cells.map(([x, y]) => `${x},${y}`))].map((key) => key.split(',').map(Number) as [number, number]);
  return { viewBox: `0 0 ${SIZE} ${SIZE}`, d: unique.map(([x, y]) => `M${x} ${y}h1v1h-1z`).join('') };
}

function pixelX() {
  const cells: [number, number][] = [];
  const last = SIZE - PAD - 1;
  for (let i = 0; i < SIZE - 2 * PAD; i++) {
    const y = PAD + i;
    for (let t = 0; t < THICK; t++) {
      const x = Math.min(PAD + i + t, last);
      cells.push([x, y], [SIZE - 1 - x, y]);
    }
  }
  return toIcon(cells);
}

function pixelChevron() {
  const cells: [number, number][] = [];
  const half = (SIZE - 2 * PAD) / 2;
  const top = Math.round((SIZE - half) / 2);
  for (let i = 0; i < half; i++) {
    const y = top + i;
    for (let t = 0; t < THICK; t++) {
      const x = Math.min(PAD + i + t, SIZE / 2 - 1);
      cells.push([x, y], [SIZE - 1 - x, y]);
    }
  }
  return toIcon(cells);
}

/** Desenho à mão numa grade 16x16 ('#' = pixel pintado). */
function grid(rows: string[]) {
  const cells: [number, number][] = [];
  rows.forEach((row, y) => [...row].forEach((cell, x) => cell === '#' && cells.push([x, y])));
  return toIcon(cells);
}

export const PIXEL_GLYPHS = {
  x: pixelX(),
  chevron: pixelChevron(),
  // A RuneIcons não tem marcas; o gato do GitHub é o recorte vazado dentro do círculo.
  github: grid([
    '.....######.....',
    '...##########...',
    '..############..',
    '.##.########.##.',
    '.##..........##.',
    '##............##',
    '##............##',
    '##............##',
    '##............##',
    '##............##',
    '.##..........##.',
    '.#.##......####.',
    '..#..#....####..',
    '...###....###...',
    '.....#....#.....',
    '................',
  ]),
  heart: grid([
    '................',
    '................',
    '...###....###...',
    '..#####..#####..',
    '.##############.',
    '.##############.',
    '.##############.',
    '..############..',
    '...##########...',
    '....########....',
    '.....######.....',
    '......####......',
    '.......##.......',
    '................',
    '................',
    '................',
  ]),
} as const;
