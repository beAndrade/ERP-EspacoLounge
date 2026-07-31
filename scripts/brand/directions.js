// Constrói as 3 direções criativas do símbolo e gera prancheta comparativa.
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const OUT = path.join(__dirname, 'out');
const NAVY = '#101828';
const PINK = '#F43F7A';
const WHITE = '#FFFFFF';

// lente de dois arcos (pétala)
function petal(L, w, angleDeg, cx, cy) {
  const R = (L * L / 4 + w * w / 4) / w;
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  const pt = (x, y) => [cx + x * cos - y * sin, cy + x * sin + y * cos];
  const [x1, y1] = pt(-L / 2, 0);
  const [x2, y2] = pt(L / 2, 0);
  const f = (v) => +v.toFixed(2);
  return `M ${f(x1)} ${f(y1)} A ${f(R)} ${f(R)} 0 0 1 ${f(x2)} ${f(y2)} A ${f(R)} ${f(R)} 0 0 1 ${f(x1)} ${f(y1)} Z`;
}

// ---- Direção 01 — Geométrica (arcos perfeitos, corte a 45 graus, nós mínimos) ----
function dir1() {
  const n = [
    'M 64 94',
    'A 52 52 0 0 1 168 94',      // domo externo: semicírculo perfeito
    'L 168 113',
    'Q 168 123 160.93 130.07',   // canto do corte (r=10)
    'L 148.07 142.93',
    'Q 141 150 141 140',
    'L 141 94',
    'A 23 23 0 0 0 95 94',       // contra-forma: semicírculo perfeito
    'L 95 148',
    'Q 95 158 85 158',           // base com cantos r=10
    'L 74 158',
    'Q 64 158 64 148',
    'Z',
  ].join(' ');
  const p = petal(76, 33, -45, 176, 147); // eixo paralelo ao corte, gap constante
  return `<path d="${n}" fill="${WHITE}"/><path d="${p}" fill="${PINK}"/>`;
}

// ---- Direção 02 — Orgânica (domo assimétrico, terminais macios, pétala integrada) ----
function dir2() {
  const n = [
    'M 64 80',
    'C 64 54 84 42 126 42',      // ombro esquerdo suave, ápice deslocado
    'C 152 42 168 64 168 94',
    'L 168 112',
    'Q 168 124 159.5 132.5',     // corte com canto mais macio (r=12)
    'L 149.5 142.5',
    'Q 141 151 141 139',
    'L 141 94',
    'C 141 80 128 69 114 69',
    'C 100 69 95 77 95 94',
    'L 95 145',
    'Q 95 158 82 158',           // base r=13
    'L 77 158',
    'Q 64 158 64 145',
    'Z',
  ].join(' ');
  const p = petal(80, 36, -44, 171, 142); // pétala maior, tocando o corte
  return `<path d="${n}" fill="${WHITE}"/><path d="${p}" fill="${PINK}"/>`;
}

// ---- Direção 03 — Monograma (arco abstrato; a perna direita "vira" pétala) ----
function dir3() {
  const skeleton = 'M 80 158 L 80 96 A 37 37 0 0 1 154 96 L 154 110';
  const p = petal(70, 30, -45, 172, 148);
  return `<path d="${skeleton}" fill="none" stroke="${WHITE}" stroke-width="30" stroke-linecap="round"/>` +
    `<path d="${p}" fill="${PINK}"/>`;
}

const dirs = { d1: dir1(), d2: dir2(), d3: dir3() };

// mesmo enquadramento para os três (54..212 x 32..183)
const iconSvg = (art) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="54 32 158 152">${art}</svg>`;
const tileSvg = (art) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="24 2 218 212">` +
  `<rect x="24" y="2" width="218" height="212" fill="${NAVY}"/>${art}</svg>`;

(async () => {
  const cols = [];
  for (const [name, art] of Object.entries(dirs)) {
    fs.writeFileSync(path.join(OUT, `direction-${name}.svg`), iconSvg(art));
    const tile = Buffer.from(tileSvg(art));
    const r128 = await sharp(tile, { density: 150 }).resize(128, 128).png().toBuffer();
    const sizes = [];
    for (const s of [48, 32, 16]) {
      const small = await sharp(tile, { density: 150 }).resize(s, s).png().toBuffer();
      sizes.push(await sharp(small).resize(96, 96, { kernel: 'nearest' }).png().toBuffer());
    }
    // coluna: 128 + três amostras pequenas ampliadas
    const col = await sharp({ create: { width: 140, height: 470, channels: 3, background: '#2a3040' } })
      .composite([
        { input: r128, left: 6, top: 6 },
        { input: sizes[0], left: 22, top: 146 },
        { input: sizes[1], left: 22, top: 252 },
        { input: sizes[2], left: 22, top: 358 },
      ]).png().toBuffer();
    cols.push(col);
  }
  await sharp({ create: { width: 140 * 3 + 24, height: 470, channels: 3, background: '#2a3040' } })
    .composite(cols.map((c, i) => ({ input: c, left: i * (140 + 12), top: 0 })))
    .png().toFile(path.join(OUT, 'directions-sheet.png'));
  console.log('directions-sheet.png ok (colunas: D1 geometrica | D2 organica | D3 monograma; linhas: 128, 48, 32, 16px)');
})();
