// Estudo de conceito — refinamento do símbolo conforme o roteiro aprovado:
// 1) cantos arredondados apenas no exterior; interiores retos
// 2) arco simétrico com peso consistente
// 3) pétala com curva fluida (folha + mecha de cabelo)
// 4) sobreposição pétala/perna intencional — recorte segue a curva da pétala
// 5) equilíbrio óptico no lockup
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const OUT = path.join(__dirname, 'out');
const NAVY = '#101828';
const PINK = '#F43F7A';
const WHITE = '#FFFFFF';

// ---------- ANTES: geometria atual (corte reto 45 graus + lente simétrica) ----------
function beforeArt() {
  const n = [
    'M 64 94', 'A 52 52 0 0 1 168 94', 'L 168 113',
    'Q 168 123 160.93 130.07', 'L 148.07 142.93', 'Q 141 150 141 140',
    'L 141 94', 'A 23 23 0 0 0 95 94', 'L 95 148', 'Q 95 158 85 158',
    'L 74 158', 'Q 64 158 64 148', 'Z',
  ].join(' ');
  const L = 76, w = 33, R = (L * L / 4 + w * w / 4) / w;
  const c = Math.SQRT1_2;
  const [x1, y1] = [176 - (L / 2) * c, 147 + (L / 2) * c];
  const [x2, y2] = [176 + (L / 2) * c, 147 - (L / 2) * c];
  const p = `M ${x1.toFixed(1)} ${y1.toFixed(1)} A ${R.toFixed(1)} ${R.toFixed(1)} 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)} A ${R.toFixed(1)} ${R.toFixed(1)} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)} Z`;
  return { n, p, mask: false };
}

// ---------- DEPOIS: conceito refinado ----------
// utilidades de curva quadrática
const qPoint = (p0, c, p1, t) => [
  (1 - t) ** 2 * p0[0] + 2 * t * (1 - t) * c[0] + t * t * p1[0],
  (1 - t) ** 2 * p0[1] + 2 * t * (1 - t) * c[1] + t * t * p1[1],
];
const qTangent = (p0, c, p1, t) => {
  const dx = 2 * (1 - t) * (c[0] - p0[0]) + 2 * t * (p1[0] - c[0]);
  const dy = 2 * (1 - t) * (c[1] - p0[1]) + 2 * t * (p1[1] - c[1]);
  const m = Math.hypot(dx, dy);
  return [dx / m, dy / m];
};
// desloca um ponto da curva ao longo da normal (lado esquerdo do sentido de percurso)
const qOffset = (p0, c, p1, t, d) => {
  const p = qPoint(p0, c, p1, t);
  const [tx, ty] = qTangent(p0, c, p1, t);
  return [p[0] + ty * d, p[1] - tx * d];
};
// t em que a curva deslocada cruza x = alvo (busca binária, x crescente)
function qOffsetTforX(p0, c, p1, d, xTarget) {
  let lo = 0, hi = 1;
  for (let i = 0; i < 48; i++) {
    const mid = (lo + hi) / 2;
    (qOffset(p0, c, p1, mid, d)[0] < xTarget) ? (lo = mid) : (hi = mid);
  }
  return (lo + hi) / 2;
}

// n: cantos externos arredondados, interiores retos; a perna direita termina
// num corte curvo paralelo a curva interna da pétala (canal constante = GAP).
function afterN() {
  const { base2, inCtrl, tip } = PETAL;
  const d = GAP; // deslocar para o lado da perna (esquerda/cima do sentido base->ponta)
  const XR_OUT = 168, XR_IN = 141, R_CUT = 9;
  // pontos do corte nas duas arestas da perna
  const tIn = qOffsetTforX(base2, inCtrl, tip, d, XR_IN);
  const tOut = qOffsetTforX(base2, inCtrl, tip, d, XR_OUT);
  const pIn = qOffset(base2, inCtrl, tip, tIn, d);   // canto interno (reto)
  const pOut = qOffset(base2, inCtrl, tip, tOut, d); // canto externo (arredondado)
  // ponto do corte a R_CUT do canto externo (busca binária; distância cresce de tOut para tIn)
  let lo = tIn, hi = tOut;
  for (let i = 0; i < 48; i++) {
    const m = (lo + hi) / 2;
    const dist = Math.hypot(...qOffset(base2, inCtrl, tip, m, d).map((v, k) => v - pOut[k]));
    (dist > R_CUT) ? (lo = m) : (hi = m);
  }
  const tMid = (lo + hi) / 2;
  const pMid = qOffset(base2, inCtrl, tip, tMid, d);
  // controle da quadrática do corte (ajusta a concavidade entre pIn e pMid)
  const tC = (tIn + tMid) / 2;
  const pC = qOffset(base2, inCtrl, tip, tC, d);
  const ctrl = [2 * pC[0] - (pIn[0] + pMid[0]) / 2, 2 * pC[1] - (pIn[1] + pMid[1]) / 2];
  const f = (v) => +v.toFixed(2);
  return [
    'M 64 94',
    'A 52 52 0 0 1 168 94',                       // domo externo (semicírculo)
    `L ${XR_OUT} ${f(pOut[1] - R_CUT)}`,
    `Q ${XR_OUT} ${f(pOut[1])} ${f(pMid[0])} ${f(pMid[1])}`, // canto externo arredondado
    `Q ${f(ctrl[0])} ${f(ctrl[1])} ${f(pIn[0])} ${f(pIn[1])}`, // corte segue a pétala
    `L ${XR_IN} 94`,                              // vertical interna direita reta
    'A 23 23 0 0 0 95 94',                        // contra-forma (semicírculo)
    'L 95 158',                                   // canto interno reto
    'L 74 158',
    'Q 64 158 64 148',                            // canto externo inferior esquerdo
    'Z',
  ].join(' ');
}

// Pétala "vírgula" (folha + mecha): base cheia e arredondada embaixo,
// afinando ate uma ponta no topo; lado interno concavo abraça a perna.
// A perna fica por trás; o recorte (keyline) segue o contorno da pétala.
function afterPetal(P) {
  const f = (v) => +v.toFixed(2);
  const [bx, by] = P.tip;
  return [
    `M ${f(bx)} ${f(by)}`,
    // belly externo: da ponta ate a base, varrendo por fora
    `Q ${P.outCtrl.map(f).join(' ')} ${P.base1.map(f).join(' ')}`,
    // tampa arredondada da base
    `Q ${P.capCtrl.map(f).join(' ')} ${P.base2.map(f).join(' ')}`,
    // curva interna concava, de volta a ponta
    `Q ${P.inCtrl.map(f).join(' ')} ${f(bx)} ${f(by)}`,
    'Z',
  ].join(' ');
}

// parâmetros da pétala refinada (coordenadas do ícone)
let PETAL = {
  tip: [208, 112],
  outCtrl: [202, 186],
  base1: [152, 182],
  capCtrl: [139, 179],
  base2: [142, 164],
  inCtrl: [182, 148],
};
const GAP = 5; // keyline entre pétala e perna

function afterArt() {
  // corte já embutido no path do n: sem necessidade de mask
  return { n: afterN(), p: afterPetal(PETAL), mask: false };
}

// ---------- Render ----------
function iconSvg(art, id) {
  const defs = art.mask
    ? `<defs><mask id="cut${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="280" height="240">` +
      `<rect width="280" height="240" fill="#fff"/>` +
      `<path d="${art.p}" fill="#000" stroke="#000" stroke-width="${GAP * 2}" stroke-linejoin="round"/>` +
      `</mask></defs>`
    : '';
  const maskAttr = art.mask ? ` mask="url(#cut${id})"` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="24 2 218 212">` +
    `<rect x="24" y="2" width="218" height="212" fill="${NAVY}"/>${defs}` +
    `<path d="${art.n}" fill="${WHITE}"${maskAttr}/>` +
    `<path d="${art.p}" fill="${PINK}"/></svg>`;
}

(async () => {
  const variants = { before: beforeArt(), after: afterArt() };
  const cols = [];
  for (const [name, art] of Object.entries(variants)) {
    const svg = iconSvg(art, name);
    fs.writeFileSync(path.join(OUT, `concept-${name}.svg`), svg);
    const buf = Buffer.from(svg);
    const r128 = await sharp(buf, { density: 150 }).resize(128, 128).png().toBuffer();
    const smalls = [];
    for (const s of [32, 16]) {
      const small = await sharp(buf, { density: 150 }).resize(s, s).png().toBuffer();
      smalls.push(await sharp(small).resize(96, 96, { kernel: 'nearest' }).png().toBuffer());
    }
    const col = await sharp({ create: { width: 140, height: 364, channels: 3, background: '#2a3040' } })
      .composite([
        { input: r128, left: 6, top: 6 },
        { input: smalls[0], left: 22, top: 146 },
        { input: smalls[1], left: 22, top: 252 },
      ]).png().toBuffer();
    cols.push(col);
  }
  await sharp({ create: { width: 140 * 2 + 18, height: 364, channels: 3, background: '#2a3040' } })
    .composite(cols.map((c, i) => ({ input: c, left: i * (140 + 12), top: 0 })))
    .png().toFile(path.join(OUT, 'concept-sheet.png'));
  console.log('concept-sheet.png ok (esq=antes | dir=depois; 128, 32, 16px)');

  // render grande do "depois" para inspeção fina
  await sharp(Buffer.from(iconSvg(variants.after, 'big')), { density: 300 })
    .resize(512, 512).png().toFile(path.join(OUT, 'concept-after-512.png'));
  console.log('concept-after-512.png ok');

  // preview do lockup: troca o símbolo antigo pelo refinado no logo.svg atual
  const lockup = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'brand', 'logo.svg'), 'utf8');
  const after = afterArt();
  let i = 0;
  const swapped = lockup.replace(/<path d="[^"]+" fill="#(?:FFFFFF|F43F7A)"\/>/g, (m) => {
    i += 1;
    if (i === 1) return `<path d="${after.n}" fill="#FFFFFF"/>`;
    if (i === 2) return `<path d="${after.p}" fill="#F43F7A"/>`;
    return m;
  });
  const preview = swapped.replace('<g transform', `<rect width="528" height="171" fill="${NAVY}"/><g transform`);
  fs.writeFileSync(path.join(OUT, 'concept-lockup.svg'), preview);
  await sharp(Buffer.from(preview), { density: 220 }).resize({ width: 1056 }).png()
    .toFile(path.join(OUT, 'concept-lockup.png'));
  console.log('concept-lockup.png ok');
})();
