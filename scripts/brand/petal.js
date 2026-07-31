// Estudo focado na PÉTALA — roteiro:
// silhueta em S (ponta afilada, base cheia e redonda), curva interna em
// espaço negativo (mecha de cabelo), corte da perna seguindo a curva da
// pétala, equilíbrio e legibilidade em 16px. Flat, cor sólida.
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const OUT = path.join(__dirname, 'out');
const NAVY = '#101828';
const PINK = '#F43F7A';
const WHITE = '#FFFFFF';

// ---------- utilidades Bézier (grau arbitrário, de Casteljau) ----------
const bez = (pts, t) => {
  let p = pts.map((q) => [...q]);
  while (p.length > 1) {
    const n = [];
    for (let i = 0; i < p.length - 1; i++) {
      n.push([p[i][0] + (p[i + 1][0] - p[i][0]) * t, p[i][1] + (p[i + 1][1] - p[i][1]) * t]);
    }
    p = n;
  }
  return p[0];
};
const bezTan = (pts, t) => {
  const d = [];
  for (let i = 0; i < pts.length - 1; i++) {
    d.push([(pts[i + 1][0] - pts[i][0]) * (pts.length - 1), (pts[i + 1][1] - pts[i][1]) * (pts.length - 1)]);
  }
  const [x, y] = bez(d, t);
  const m = Math.hypot(x, y) || 1;
  return [x / m, y / m];
};
// ponto deslocado ao longo da normal (lado esquerdo do sentido de percurso)
const bezOff = (pts, t, d) => {
  const p = bez(pts, t);
  const [tx, ty] = bezTan(pts, t);
  return [p[0] + ty * d, p[1] - tx * d];
};
const offTforX = (pts, d, xT) => {
  let lo = 0, hi = 1;
  for (let i = 0; i < 60; i++) {
    const m = (lo + hi) / 2;
    (bezOff(pts, m, d)[0] < xT) ? (lo = m) : (hi = m);
  }
  return (lo + hi) / 2;
};
const f = (v) => +v.toFixed(2);

// ---------- geometria da pétala ----------
// Silhueta: ponta (TIP) -> curva EXTERNA (cubica, bojo direita) -> base cheia
// (tampa arredondada) -> curva INTERNA (cubica, concava perto da base,
// acompanhando a externa) -> volta a ponta.
// Veio: lasca afilada em cor de fundo dentro do corpo, seguindo o fluxo.
function makePetal(P) {
  const outer = [P.tip, P.o1, P.o2, P.base1];
  const cap = [P.base1, P.capC, P.base2];
  const inner = [P.base2, P.i1, P.i2, P.tip];
  const body = [
    `M ${P.tip.map(f).join(' ')}`,
    `C ${P.o1.map(f).join(' ')} ${P.o2.map(f).join(' ')} ${P.base1.map(f).join(' ')}`,
    `Q ${P.capC.map(f).join(' ')} ${P.base2.map(f).join(' ')}`,
    `C ${P.i1.map(f).join(' ')} ${P.i2.map(f).join(' ')} ${P.tip.map(f).join(' ')}`,
    'Z',
  ].join(' ');
  // veio: duas quadráticas com os mesmos extremos, controles separados
  // perpendicular ao eixo -> lasca que afina nas duas pontas
  const [v0, v1, vc, w] = [P.v0, P.v1, P.vC, P.vW];
  const dir = [v1[0] - v0[0], v1[1] - v0[1]];
  const m = Math.hypot(...dir);
  const perp = [dir[1] / m, -dir[0] / m];
  const cA = [vc[0] + perp[0] * w, vc[1] + perp[1] * w];
  const cB = [vc[0] - perp[0] * w, vc[1] - perp[1] * w];
  const vein = `M ${v0.map(f).join(' ')} Q ${cA.map(f).join(' ')} ${v1.map(f).join(' ')} Q ${cB.map(f).join(' ')} ${v0.map(f).join(' ')} Z`;
  return { body, vein, outer, cap, inner };
}

// parâmetros (coordenadas do ícone: n em x 64..168, baseline y=158)
const PETAL = {
  tip: [197, 103],
  o1: [210, 128], o2: [206, 164], base1: [166, 181],
  capC: [151, 180], base2: [147, 166],
  i1: [160, 148], i2: [180, 126],
  v0: [161, 167], v1: [191, 118], vC: [181, 149], vW: 3.5,
};
const GAP = 5;   // canal entre pétala e perna
const R_CUT = 9; // arredondamento do canto externo no corte

// ---------- n com corte seguindo a curva interna da pétala ----------
function nPath(petal) {
  const inner = petal.inner; // base2 -> ponta (x crescente)
  const XR_OUT = 168, XR_IN = 141;
  const tIn = offTforX(inner, GAP, XR_IN);
  const tOut = offTforX(inner, GAP, XR_OUT);
  const pIn = bezOff(inner, tIn, GAP);
  const pOut = bezOff(inner, tOut, GAP);
  // ponto a R_CUT do canto externo, sobre a curva do corte
  let lo = tIn, hi = tOut;
  for (let i = 0; i < 60; i++) {
    const m = (lo + hi) / 2;
    const dist = Math.hypot(...bezOff(inner, m, GAP).map((v, k) => v - pOut[k]));
    (dist > R_CUT) ? (lo = m) : (hi = m);
  }
  const tMid = (lo + hi) / 2;
  const pMid = bezOff(inner, tMid, GAP);
  const tC = (tIn + tMid) / 2;
  const pC = bezOff(inner, tC, GAP);
  const ctrl = [2 * pC[0] - (pIn[0] + pMid[0]) / 2, 2 * pC[1] - (pIn[1] + pMid[1]) / 2];
  return [
    'M 64 94',
    'A 52 52 0 0 1 168 94',
    `L ${XR_OUT} ${f(pOut[1] - R_CUT)}`,
    `Q ${XR_OUT} ${f(pOut[1])} ${f(pMid[0])} ${f(pMid[1])}`,
    `Q ${f(ctrl[0])} ${f(ctrl[1])} ${f(pIn[0])} ${f(pIn[1])}`,
    `L ${XR_IN} 94`,
    'A 23 23 0 0 0 95 94',
    'L 95 158',
    'L 74 158',
    'Q 64 158 64 148',
    'Z',
  ].join(' ');
}

// ---------- renders ----------
function iconSvg(petal, { bg = NAVY, fg = WHITE } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="24 2 218 212">` +
    `<rect x="24" y="2" width="218" height="212" fill="${bg}"/>` +
    `<path d="${nPath(petal)}" fill="${fg}"/>` +
    `<path d="${petal.body}" fill="${PINK}"/>` +
    `<path d="${petal.vein}" fill="${bg}"/></svg>`;
}

function petalOnlySvg(petal, bg = NAVY) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="130 92 90 100">` +
    `<rect x="130" y="92" width="90" height="100" fill="${bg}"/>` +
    `<path d="${petal.body}" fill="${PINK}"/>` +
    `<path d="${petal.vein}" fill="${bg}"/></svg>`;
}

function constructionSvg(petal, P) {
  const dot = ([x, y], c) => `<circle cx="${f(x)}" cy="${f(y)}" r="1.6" fill="${c}"/>`;
  const line = (a, b) => `<line x1="${f(a[0])}" y1="${f(a[1])}" x2="${f(b[0])}" y2="${f(b[1])}" stroke="#5a637a" stroke-width="0.5" stroke-dasharray="2 2"/>`;
  let grid = '';
  for (let x = 130; x <= 220; x += 10) grid += `<line x1="${x}" y1="92" x2="${x}" y2="192" stroke="#232c40" stroke-width="0.4"/>`;
  for (let y = 92; y <= 192; y += 10) grid += `<line x1="130" y1="${y}" x2="220" y2="${y}" stroke="#232c40" stroke-width="0.4"/>`;
  const handles =
    line(P.tip, P.o1) + line(P.base1, P.o2) + line(P.base1, P.capC) + line(P.base2, P.capC) +
    line(P.base2, P.i1) + line(P.tip, P.i2) +
    [P.tip, P.base1, P.base2].map((p) => dot(p, '#FFFFFF')).join('') +
    [P.o1, P.o2, P.capC, P.i1, P.i2].map((p) => dot(p, '#FF5C9D')).join('') +
    [P.v0, P.v1, P.vC].map((p) => dot(p, '#8be9fd')).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="128 90 94 104">` +
    `<rect x="128" y="90" width="94" height="104" fill="${NAVY}"/>${grid}` +
    `<path d="${petal.body}" fill="${PINK}" fill-opacity="0.55"/>` +
    `<path d="${petal.vein}" fill="${NAVY}"/>` +
    `<path d="${petal.body}" fill="none" stroke="#FFFFFF" stroke-width="0.6"/>${handles}</svg>`;
}

async function renderAll(tag = '') {
  const petal = makePetal(PETAL);
  const s = (n) => path.join(OUT, n + (tag ? `-${tag}` : '') + '.png');

  fs.writeFileSync(path.join(OUT, 'petal-isolated.svg'), petalOnlySvg(petal));
  await sharp(Buffer.from(petalOnlySvg(petal)), { density: 300 }).resize({ height: 512 })
    .png().toFile(s('petal-isolated'));

  await sharp(Buffer.from(constructionSvg(petal, PETAL)), { density: 300 }).resize({ height: 640 })
    .png().toFile(s('petal-construction'));

  const dark = iconSvg(petal);
  const light = iconSvg(petal, { bg: WHITE, fg: NAVY });
  fs.writeFileSync(path.join(OUT, 'petal-icon.svg'), dark);
  await sharp(Buffer.from(dark), { density: 300 }).resize(512, 512).png().toFile(s('petal-icon-512'));

  // prancheta: dark 128 + light 128 + favicon 32/16 ampliados (nearest)
  const cells = [];
  for (const [svg, size] of [[dark, 128], [light, 128], [dark, 32], [dark, 16]]) {
    const buf = await sharp(Buffer.from(svg), { density: 150 }).resize(size, size).png().toBuffer();
    cells.push(size < 128
      ? await sharp(buf).resize(128, 128, { kernel: 'nearest' }).png().toBuffer()
      : buf);
  }
  await sharp({ create: { width: 4 * 140 + 12, height: 152, channels: 3, background: '#2a3040' } })
    .composite(cells.map((c, i) => ({ input: c, left: 12 + i * 140, top: 12 })))
    .png().toFile(s('petal-sheet'));

  // detalhe da integração: zoom no encontro pétala/perna
  const big = await sharp(Buffer.from(dark), { density: 300 }).resize(1024, 1024).png().toBuffer();
  await sharp(big).extract({ left: 470, top: 400, width: 440, height: 480 })
    .resize({ width: 640 }).png().toFile(s('petal-integration-detail'));
  console.log('renders ok' + (tag ? ` (${tag})` : ''));
}

// variações opcionais da pétala (mesma construção, parâmetros diferentes)
async function renderVariations() {
  const variants = [
    ['A atual', PETAL],
    ['B ponta longa', { ...PETAL, tip: [201, 96], i2: [182, 122], o1: [212, 124], v1: [194, 112] }],
    ['C mais curva', { ...PETAL, o1: [214, 132], o2: [202, 168], i1: [156, 150], i2: [184, 130], vC: [184, 152] }],
  ];
  const cells = [];
  for (const [, P] of variants) {
    const petal = makePetal(P);
    cells.push(await sharp(Buffer.from(petalOnlySvg(petal)), { density: 200 })
      .resize({ height: 300 }).png().toBuffer());
  }
  const meta = await Promise.all(cells.map((c) => sharp(c).metadata()));
  const w = Math.max(...meta.map((m) => m.width));
  await sharp({ create: { width: (w + 16) * 3, height: 316, channels: 3, background: '#2a3040' } })
    .composite(cells.map((c, i) => ({ input: c, left: 8 + i * (w + 16), top: 8 })))
    .png().toFile(path.join(OUT, 'petal-variations.png'));
  console.log('variations ok');
}

(async () => { await renderAll(); await renderVariations(); })();
