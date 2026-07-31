// Gera os assets vetoriais da marca Nexa Beauty a partir da arte de referência.
// Medidas extraídas pixel a pixel de reference.png (321x112) e escaladas 2x.
const fs = require('fs');
const path = require('path');
const opentype = require('opentype.js');

const OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });

// ---------- Paleta (amostrada da referência) ----------
const NAVY = '#030E1B';
const PINK = '#F4497C';
const WHITE = '#FFFFFF';

// ---------- Fontes ----------
const loadFont = (f) => {
  const b = fs.readFileSync(path.join(__dirname, f));
  return opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
};
const fontBold = loadFont('Poppins-Bold.ttf');
const fontMed = loadFont('Poppins-Medium.ttf');

const xHeightRatio = (f) => f.tables.os2.sxHeight / f.unitsPerEm;
const capRatio = (f) => f.tables.os2.sCapHeight / f.unitsPerEm;

// Bbox "de tinta" de um opentype Path
function inkBBox(p) {
  const b = p.getBoundingBox();
  return { x0: b.x1, y0: b.y1, x1: b.x2, y1: b.y2, w: b.x2 - b.x1, h: b.y2 - b.y1 };
}

// O opentype.js pode reutilizar objetos de comando do cache do glifo;
// clonar antes de transformar evita corromper a fonte em memória.
function cloneCommands(p) {
  p.commands = p.commands.map((c) => ({ ...c }));
  return p;
}

// Layout manual de glifos (avanço + kerning), com tracking ajustado à largura-alvo
function layoutText(font, text, fontSize, trackingPx) {
  const scale = fontSize / font.unitsPerEm;
  const glyphs = font.stringToGlyphs(text);
  const p = new opentype.Path();
  let x = 0;
  for (let i = 0; i < glyphs.length; i++) {
    const gp = cloneCommands(glyphs[i].getPath(x, 0, fontSize));
    p.commands.push(...gp.commands);
    x += glyphs[i].advanceWidth * scale;
    if (i < glyphs.length - 1) {
      x += font.getKerningValue(glyphs[i], glyphs[i + 1]) * scale + trackingPx;
    }
  }
  return p;
}

function textPath(font, text, fontSize, targetW, leftX, baselineY) {
  const natural = layoutText(font, text, fontSize, 0);
  const nb = inkBBox(natural);
  const n = text.length;
  const trackingPx = n > 1 ? (targetW - nb.w) / (n - 1) : 0;
  const p = layoutText(font, text, fontSize, trackingPx);
  const b = inkBBox(p);
  const dx = leftX - b.x0;
  p.commands.forEach((c) => {
    ['x', 'x1', 'x2'].forEach((k) => { if (c[k] !== undefined) c[k] += dx; });
    ['y', 'y1', 'y2'].forEach((k) => { if (c[k] !== undefined) c[k] += baselineY; });
  });
  return { d: p.toPathData(2), bbox: inkBBox(p), letterSpacing: trackingPx / fontSize };
}

// ---------- Ícone: "n" geométrico desenhado à mão ----------
// Medidas (2x da referência): outer x 64..168, y 42..158; haste 29;
// contra-forma interna x 93..139, ápice interno y 71; corte diagonal
// da perna direita de (168,122) a (139,148); terminais com raio 8.
function iconNPath() {
  const X0 = 64, S = 29, X1 = 168, YT = 42, YB = 158;
  const XiL = X0 + S, XiR = X1 - S; // 93 e 139
  const YS_OUT = 80;  // altura onde o contorno externo "nasce" da haste
  const YS_IN = 94;   // nascimento do arco interno
  const YI_TOP = 69;  // ápice do arco interno
  const IAPX = 112;   // ápice do arco interno (x)
  const APX = 126;    // ápice externo (deslocado à direita, como na referência)
  const CUT_O = { x: X1, y: 123 }, CUT_I = { x: XiR, y: 149 };
  const R = 10; // raio dos terminais

  // direção unitária do corte (de fora para dentro)
  const dx = CUT_I.x - CUT_O.x, dy = CUT_I.y - CUT_O.y;
  const len = Math.hypot(dx, dy);
  const ux = dx / len, uy = dy / len;

  const f = (v) => +v.toFixed(2);
  return [
    `M ${X0} ${YS_OUT}`,
    // ombro externo esquerdo -> ápice -> descida externa direita
    `C ${X0} ${f(YT + 12)} ${f(X0 + 20)} ${YT} ${APX} ${YT}`,
    `C ${f(APX + 26)} ${YT} ${X1} ${f(YT + 22)} ${X1} ${YS_IN}`,
    // perna direita externa até o corte (canto arredondado)
    `L ${CUT_O.x} ${f(CUT_O.y - R)}`,
    `Q ${CUT_O.x} ${CUT_O.y} ${f(CUT_O.x + ux * R)} ${f(CUT_O.y + uy * R)}`,
    // aresta do corte
    `L ${f(CUT_I.x - ux * R)} ${f(CUT_I.y - uy * R)}`,
    `Q ${CUT_I.x} ${CUT_I.y} ${CUT_I.x} ${f(CUT_I.y - R)}`,
    // sobe pela perna direita interna
    `L ${XiR} ${YS_IN}`,
    // arco interno (contra-forma)
    `C ${XiR} ${f(YS_IN - 14)} ${f(IAPX + 14)} ${YI_TOP} ${IAPX} ${YI_TOP}`,
    `C ${f(IAPX - 14)} ${YI_TOP} ${XiL} ${f(YS_IN - 17)} ${XiL} ${YS_IN}`,
    // desce pela face interna da haste esquerda; base com cantos arredondados
    `L ${XiL} ${f(YB - R)}`,
    `Q ${XiL} ${YB} ${f(XiL - R)} ${YB}`,
    `L ${f(X0 + R)} ${YB}`,
    `Q ${X0} ${YB} ${X0} ${f(YB - R)}`,
    'Z',
  ].join(' ');
}

// ---------- Pétala: lente de dois arcos circulares ----------
// Alvo (2x): bbox x 146..198 (53), y 116..170 (55)
function petal(L, w, angleDeg, cx, cy) {
  // lente no eixo x: pontas (-L/2,0)..(L/2,0), sagitta w/2 para cada lado
  const R = (L * L / 4 + w * w / 4) / w;
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  const pt = (x, y) => [cx + x * cos - y * sin, cy + x * sin + y * cos];
  const [x1, y1] = pt(-L / 2, 0);
  const [x2, y2] = pt(L / 2, 0);
  const f = (v) => +v.toFixed(2);
  const d = `M ${f(x1)} ${f(y1)} A ${f(R)} ${f(R)} 0 0 1 ${f(x2)} ${f(y2)} A ${f(R)} ${f(R)} 0 0 1 ${f(x1)} ${f(y1)} Z`;
  // bbox numérico (amostragem dos dois arcos)
  let bx0 = 1e9, by0 = 1e9, bx1 = -1e9, by1 = -1e9;
  for (let s = -1; s <= 1; s += 2) {
    // centro do arco fica a (R - w/2) do eixo
    const ay = s * (R - w / 2);
    for (let t = 0; t <= 200; t++) {
      const x = -L / 2 + (L * t) / 200;
      const yy = ay - s * Math.sqrt(Math.max(0, R * R - x * x));
      const [px, py] = pt(x, yy);
      bx0 = Math.min(bx0, px); by0 = Math.min(by0, py);
      bx1 = Math.max(bx1, px); by1 = Math.max(by1, py);
    }
  }
  return { d, bbox: { x0: bx0, y0: by0, x1: bx1, y1: by1, w: bx1 - bx0, h: by1 - by0 } };
}

// ---------- Montagem ----------
// Parâmetros da pétala: comprimento, largura, ângulo, centro
// bbox alvo (2x da referência): x 146..198, y 116..170
const PETAL_PARAMS = [76, 33, -45, 175, 146];

const BRAND_DIR = path.join(__dirname, '..', '..', 'public', 'brand');
const PUBLIC_DIR = path.join(__dirname, '..', '..', 'public');
fs.mkdirSync(BRAND_DIR, { recursive: true });

const HEADER = '<!-- Nexa Beauty - identidade vetorial gerada a partir da arte aprovada -->\n';

function buildAssets() {
  const iconD = iconNPath();
  const pet = petal(...PETAL_PARAMS);

  // nexa: x-height 76 (2x de 38), tinta de 232 a 550 (largura 318), baseline 123
  const nexa = textPath(fontBold, 'nexa', 76 / xHeightRatio(fontBold), 318, 232, 123);
  // BEAUTY: cap 26 (2x de 13), tinta de 233 a 475 (largura 242), baseline 169
  const beauty = textPath(fontMed, 'BEAUTY', 26 / capRatio(fontMed), 242, 233, 169);

  const lockupArt = (fg) =>
    `<path d="${iconD}" fill="${fg}"/>` +
    `<path d="${pet.d}" fill="${PINK}"/>` +
    `<path d="${nexa.d}" fill="${fg}"/>` +
    `<path d="${beauty.d}" fill="${fg}"/>`;

  // Conteúdo do lockup: x 64..550, y 42..173 -> viewBox justo com respiro de 20
  const PAD = 20;
  const CB = { x0: 64, y0: 42, x1: 550, y1: 173 };
  const vb = `0 0 ${CB.x1 - CB.x0 + 2 * PAD} ${CB.y1 - CB.y0 + 2 * PAD}`;
  const shift = `translate(${PAD - CB.x0} ${PAD - CB.y0})`;
  const lockupSvg = (fg) =>
    `${HEADER}<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}">` +
    `<g transform="${shift}">${lockupArt(fg)}</g></svg>`;

  // Versão com fundo navy: mesmo enquadramento da referência (642x224)
  const lockupBgSvg =
    `${HEADER}<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 642 224">` +
    `<rect width="642" height="224" fill="${NAVY}"/>${lockupArt(WHITE)}</svg>`;

  // Ícone isolado: n + pétala, viewBox justo
  const IB = { x0: 64, y0: 42, x1: 202, y1: 173 };
  const IPAD = 10;
  const ivb = `0 0 ${IB.x1 - IB.x0 + 2 * IPAD} ${IB.y1 - IB.y0 + 2 * IPAD}`;
  const ishift = `translate(${IPAD - IB.x0} ${IPAD - IB.y0})`;
  const iconSvg = (fg) =>
    `${HEADER}<svg xmlns="http://www.w3.org/2000/svg" viewBox="${ivb}">` +
    `<g transform="${ishift}"><path d="${iconD}" fill="${fg}"/>` +
    `<path d="${pet.d}" fill="${PINK}"/></g></svg>`;

  // Favicon: quadrado navy com o símbolo centralizado (78% do lado, p/ leitura em 16px)
  const SIDE = 512;
  const iw = IB.x1 - IB.x0, ih = IB.y1 - IB.y0;
  const scale = (SIDE * 0.78) / Math.max(iw, ih);
  const tx = (SIDE - iw * scale) / 2 - IB.x0 * scale;
  const ty = (SIDE - ih * scale) / 2 - IB.y0 * scale;
  const faviconSvg =
    `${HEADER}<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIDE} ${SIDE}">` +
    `<rect width="${SIDE}" height="${SIDE}" rx="${SIDE * 0.14}" fill="${NAVY}"/>` +
    `<g transform="translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${scale.toFixed(4)})">` +
    `<path d="${iconD}" fill="${WHITE}"/><path d="${pet.d}" fill="${PINK}"/></g></svg>`;

  return { lockupSvg, lockupBgSvg, iconSvg, faviconSvg, pet, nexa, beauty };
}

const A = buildAssets();

fs.writeFileSync(path.join(BRAND_DIR, 'nexa-beauty-lockup.svg'), A.lockupSvg(WHITE));
fs.writeFileSync(path.join(BRAND_DIR, 'nexa-beauty-lockup-navy.svg'), A.lockupSvg(NAVY));
fs.writeFileSync(path.join(BRAND_DIR, 'nexa-beauty-lockup-bg.svg'), A.lockupBgSvg);
fs.writeFileSync(path.join(BRAND_DIR, 'nexa-beauty-icon.svg'), A.iconSvg(WHITE));
fs.writeFileSync(path.join(BRAND_DIR, 'nexa-beauty-icon-navy.svg'), A.iconSvg(NAVY));
fs.writeFileSync(path.join(PUBLIC_DIR, 'favicon.svg'), A.faviconSvg);

// Preview para validação visual (mesmo enquadramento da referência)
fs.writeFileSync(path.join(OUT, 'lockup-bold-medium.svg'), A.lockupBgSvg.replace(HEADER, ''));

console.log('petala bbox:', JSON.stringify(A.pet.bbox));
console.log('nexa tracking (em):', A.nexa.letterSpacing.toFixed(4), '| beauty tracking (em):', A.beauty.letterSpacing.toFixed(4));
console.log('assets svg gravados em public/brand e public/');

// ---------- Rasterização: favicons e ícones PNG ----------
(async () => {
  const sharp = require('sharp');
  const pngToIcoMod = require('png-to-ico');
  const pngToIco = pngToIcoMod.default || pngToIcoMod;
  const svgBuf = Buffer.from(A.faviconSvg);

  const png = (size) => sharp(svgBuf, { density: 300 }).resize(size, size).png().toBuffer();

  const [p16, p32, p48, p180, p192, p512] = await Promise.all([16, 32, 48, 180, 192, 512].map(png));
  fs.writeFileSync(path.join(PUBLIC_DIR, 'favicon.ico'), await pngToIco([p16, p32, p48]));
  fs.writeFileSync(path.join(PUBLIC_DIR, 'apple-touch-icon.png'), p180);
  fs.writeFileSync(path.join(BRAND_DIR, 'nexa-beauty-icon-192.png'), p192);
  fs.writeFileSync(path.join(BRAND_DIR, 'nexa-beauty-icon-512.png'), p512);

  // amostra do favicon em 16px ampliada p/ inspeção
  await sharp(p16).resize(128, 128, { kernel: 'nearest' }).png().toFile(path.join(OUT, 'favicon-16-preview.png'));
  await sharp(p32).resize(128, 128, { kernel: 'nearest' }).png().toFile(path.join(OUT, 'favicon-32-preview.png'));
  console.log('favicon.ico, favicon.svg, apple-touch-icon e PNGs gerados');
})();
