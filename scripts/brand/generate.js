// Gera a identidade vetorial Nexa (produto: Nexa Beauty).
// Sistema de coordenadas: unidades do lockup (2x do tamanho base; 1px base = 2 un.).
const fs = require('fs');
const path = require('path');
const opentype = require('opentype.js');

const OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });

// ---------- Paleta ----------
const NAVY = '#101828';   // fundo / versão light
const PINK = '#F43F7A';   // pétala
const PINK2 = '#FF5C9D';  // rosa secundário (guias do grid)
const WHITE = '#FFFFFF';

// ---------- Fontes ----------
const loadFont = (f) => {
  const b = fs.readFileSync(path.join(__dirname, f));
  return opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
};
const fontNexa = loadFont('SpaceGrotesk-Bold.ttf');
const fontBeauty = loadFont('Inter-Medium.ttf');

const xHeightRatio = (f) => f.tables.os2.sxHeight / f.unitsPerEm;
const capRatio = (f) => f.tables.os2.sCapHeight / f.unitsPerEm;

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

// Layout manual de glifos (avanço + kerning + tracking em em),
// com pares de kerning óptico opcionais (em "em", ex.: { 'xa': -0.008 }).
function layoutText(font, text, fontSize, trackingEm, kernPairs = {}) {
  const scale = fontSize / font.unitsPerEm;
  const glyphs = font.stringToGlyphs(text);
  const p = new opentype.Path();
  const glyphBoxes = [];
  let x = 0;
  for (let i = 0; i < glyphs.length; i++) {
    const gp = cloneCommands(glyphs[i].getPath(x, 0, fontSize));
    glyphBoxes.push(inkBBox(gp));
    p.commands.push(...gp.commands);
    x += glyphs[i].advanceWidth * scale;
    if (i < glyphs.length - 1) {
      const pair = text[i] + text[i + 1];
      const extra = (kernPairs[pair] || 0) * fontSize;
      x += font.getKerningValue(glyphs[i], glyphs[i + 1]) * scale + trackingEm * fontSize + extra;
    }
  }
  return { path: p, glyphBoxes };
}

// Texto em contornos, alinhado pela tinta (leftX, baselineY)
function textPath(font, text, fontSize, trackingEm, leftX, baselineY, kernPairs) {
  const { path: p, glyphBoxes } = layoutText(font, text, fontSize, trackingEm, kernPairs);
  const b = inkBBox(p);
  const dx = leftX - b.x0;
  p.commands.forEach((c) => {
    ['x', 'x1', 'x2'].forEach((k) => { if (c[k] !== undefined) c[k] += dx; });
    ['y', 'y1', 'y2'].forEach((k) => { if (c[k] !== undefined) c[k] += baselineY; });
  });
  const boxes = glyphBoxes.map((g) => ({
    x0: g.x0 + dx, x1: g.x1 + dx, y0: g.y0 + baselineY, y1: g.y1 + baselineY,
  }));
  return { d: p.toPathData(2), bbox: inkBBox(p), glyphBoxes: boxes };
}

// ---------- Ícone: "n" geométrico desenhado à mão ----------
// Haste esquerda levemente mais larga (31 un.) que a direita (27 un.),
// terminais arredondados (r=10) e corte diagonal na perna direita.
const ICON_GEO = {
  X0: 64, X1: 168, YT: 42, YB: 158,
  SL: 31, SR: 27,          // larguras das hastes (esquerda / direita)
  YS_OUT: 80,              // nascimento do contorno externo na haste
  YS_IN: 94,               // nascimento do arco interno
  YI_TOP: 69,              // ápice do arco interno (y)
  IAPX: 114,               // ápice do arco interno (x)
  APX: 126,                // ápice externo
  CUT_O: { x: 168, y: 123 },
  R: 10,
};

function iconNPath() {
  const { X0, X1, YT, YB, SL, SR, YS_OUT, YS_IN, YI_TOP, IAPX, APX, CUT_O, R } = ICON_GEO;
  const XiL = X0 + SL, XiR = X1 - SR;
  const CUT_I = { x: XiR, y: 150 };

  const dx = CUT_I.x - CUT_O.x, dy = CUT_I.y - CUT_O.y;
  const len = Math.hypot(dx, dy);
  const ux = dx / len, uy = dy / len;

  const f = (v) => +v.toFixed(2);
  return [
    `M ${X0} ${YS_OUT}`,
    // ombro externo esquerdo -> ápice -> descida externa direita
    `C ${X0} ${f(YT + 12)} ${f(X0 + 20)} ${YT} ${APX} ${YT}`,
    `C ${f(APX + 26)} ${YT} ${X1} ${f(YT + 22)} ${X1} ${YS_IN}`,
    // perna direita externa até o corte (cantos arredondados)
    `L ${CUT_O.x} ${f(CUT_O.y - R)}`,
    `Q ${CUT_O.x} ${CUT_O.y} ${f(CUT_O.x + ux * R)} ${f(CUT_O.y + uy * R)}`,
    `L ${f(CUT_I.x - ux * R)} ${f(CUT_I.y - uy * R)}`,
    `Q ${CUT_I.x} ${CUT_I.y} ${CUT_I.x} ${f(CUT_I.y - R)}`,
    `L ${XiR} ${YS_IN}`,
    // arco interno (contra-forma)
    `C ${XiR} ${f(YS_IN - 14)} ${f(IAPX + 14)} ${YI_TOP} ${IAPX} ${YI_TOP}`,
    `C ${f(IAPX - 14)} ${YI_TOP} ${XiL} ${f(YS_IN - 17)} ${XiL} ${YS_IN}`,
    // face interna da haste esquerda; base com cantos arredondados
    `L ${XiL} ${f(YB - R)}`,
    `Q ${XiL} ${YB} ${f(XiL - R)} ${YB}`,
    `L ${f(X0 + R)} ${YB}`,
    `Q ${X0} ${YB} ${X0} ${f(YB - R)}`,
    'Z',
  ].join(' ');
}

// ---------- Pétala: lente de dois arcos circulares ----------
function petal(L, w, angleDeg, cx, cy) {
  const R = (L * L / 4 + w * w / 4) / w;
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  const pt = (x, y) => [cx + x * cos - y * sin, cy + x * sin + y * cos];
  const [x1, y1] = pt(-L / 2, 0);
  const [x2, y2] = pt(L / 2, 0);
  const f = (v) => +v.toFixed(2);
  const d = `M ${f(x1)} ${f(y1)} A ${f(R)} ${f(R)} 0 0 1 ${f(x2)} ${f(y2)} A ${f(R)} ${f(R)} 0 0 1 ${f(x1)} ${f(y1)} Z`;
  return { d, R, tip1: [x1, y1], tip2: [x2, y2] };
}
// comprimento, largura, ângulo, centro — pétala encaixada no corte da perna
const PETAL_PARAMS = [76, 33, -45, 175, 146];

// ---------- Montagem ----------
const BRAND_DIR = path.join(__dirname, '..', '..', 'public', 'brand');
const PUBLIC_DIR = path.join(__dirname, '..', '..', 'public');
fs.mkdirSync(BRAND_DIR, { recursive: true });

const HEADER = '<!-- Nexa - identidade vetorial (gerada por scripts/brand/generate.js) -->\n';
const svgOpen = (vb) => `${HEADER}<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}">`;

function buildAssets() {
  const iconD = iconNPath();
  const pet = petal(...PETAL_PARAMS);

  // Bbox do símbolo (n + pétala): pétala vai até ~202,173
  const IB = { x0: 64, y0: 42, x1: 202, y1: 173 };

  // "nexa": Space Grotesk Bold, x-height 76 un., baseline 123.
  // Gap ícone->texto: 16 un. (= 8px no tamanho base). Kerning óptico leve.
  const GAP = 16;
  const nexaLeft = IB.x1 + GAP;
  const nexaSize = 76 / xHeightRatio(fontNexa);
  const nexa = textPath(fontNexa, 'nexa', nexaSize, -0.012, nexaLeft, 123, { ex: -0.006, xa: -0.006 });

  // "BEAUTY": Inter Medium, caps 26 un., tracking 0.34em,
  // começando opticamente sob o "e" de nexa, baseline 169.
  const eStart = nexa.glyphBoxes[1].x0;
  const beautySize = 26 / capRatio(fontBeauty);
  const beauty = textPath(fontBeauty, 'BEAUTY', beautySize, 0.34, eStart, 169);

  const lockupArt = (fg, petalFill) =>
    `<path d="${iconD}" fill="${fg}"/>` +
    `<path d="${pet.d}" fill="${petalFill}"/>` +
    `<path d="${nexa.d}" fill="${fg}"/>` +
    `<path d="${beauty.d}" fill="${fg}"/>`;

  // Conteúdo do lockup
  const CB = {
    x0: IB.x0, y0: 42,
    x1: Math.max(nexa.bbox.x1, beauty.bbox.x1), y1: IB.y1,
  };
  const PAD = 20;
  const vbW = CB.x1 - CB.x0 + 2 * PAD, vbH = CB.y1 - CB.y0 + 2 * PAD;
  const shift = `translate(${PAD - CB.x0} ${PAD - CB.y0})`;
  const lockupSvg = (fg, petalFill) =>
    `${svgOpen(`0 0 ${vbW.toFixed(0)} ${vbH.toFixed(0)}`)}<g transform="${shift}">${lockupArt(fg, petalFill)}</g></svg>`;

  // Versão com fundo navy (mesma proporção da arte aprovada)
  const bgW = vbW + 72, bgH = vbH + 72;
  const lockupBgSvg =
    `${svgOpen(`0 0 ${bgW.toFixed(0)} ${bgH.toFixed(0)}`)}` +
    `<rect width="${bgW.toFixed(0)}" height="${bgH.toFixed(0)}" fill="${NAVY}"/>` +
    `<g transform="translate(${(36 + PAD - CB.x0).toFixed(0)} ${(36 + PAD - CB.y0).toFixed(0)})">${lockupArt(WHITE, PINK)}</g></svg>`;

  // Ícone isolado
  const IPAD = 10;
  const ivb = `0 0 ${IB.x1 - IB.x0 + 2 * IPAD} ${IB.y1 - IB.y0 + 2 * IPAD}`;
  const ishift = `translate(${IPAD - IB.x0} ${IPAD - IB.y0})`;
  const iconSvg = (fg, petalFill) =>
    `${svgOpen(ivb)}<g transform="${ishift}"><path d="${iconD}" fill="${fg}"/>` +
    `<path d="${pet.d}" fill="${petalFill}"/></g></svg>`;

  // Quadrado navy + símbolo centralizado (favicon rx 14%, app icon rx 22%)
  const square = (side, rxRatio, iconScaleRatio) => {
    const iw = IB.x1 - IB.x0, ih = IB.y1 - IB.y0;
    const scale = (side * iconScaleRatio) / Math.max(iw, ih);
    const tx = (side - iw * scale) / 2 - IB.x0 * scale;
    const ty = (side - ih * scale) / 2 - IB.y0 * scale;
    return `${svgOpen(`0 0 ${side} ${side}`)}` +
      `<rect width="${side}" height="${side}" rx="${side * rxRatio}" fill="${NAVY}"/>` +
      `<g transform="translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${scale.toFixed(4)})">` +
      `<path d="${iconD}" fill="${WHITE}"/><path d="${pet.d}" fill="${PINK}"/></g></svg>`;
  };
  const faviconSvg = square(512, 0.14, 0.78);
  const appIconSvg = square(1024, 0.22, 0.70);

  // ----- Grid de construção -----
  const gridSvg = (() => {
    const W = 300, H = 260;
    const off = `translate(${(W - (IB.x1 - IB.x0)) / 2 - IB.x0} ${(H - (IB.y1 - IB.y0)) / 2 - IB.y0})`;
    let g = `${svgOpen(`0 0 ${W} ${H}`)}<rect width="${W}" height="${H}" fill="${WHITE}"/>`;
    // malha de 8 un.
    let mesh = '';
    for (let x = 0; x <= W; x += 8) mesh += `M ${x} 0 V ${H} `;
    for (let y = 0; y <= H; y += 8) mesh += `M 0 ${y} H ${W} `;
    g += `<path d="${mesh}" stroke="#E5E9F0" stroke-width="0.5" fill="none"/>`;
    g += `<g transform="${off}">`;
    // guias estruturais
    const { X0, X1, YT, YB, SL, SR, YS_IN, YI_TOP, APX } = ICON_GEO;
    const guides = [
      `M ${X0} ${YT - 14} V ${YB + 14}`, `M ${X0 + SL} ${YT - 14} V ${YB + 14}`,
      `M ${X1 - SR} ${YT - 14} V ${YB + 14}`, `M ${X1} ${YT - 14} V ${YB + 14}`,
      `M ${X0 - 14} ${YT} H ${X1 + 40}`, `M ${X0 - 14} ${YB} H ${X1 + 40}`,
      `M ${X0 - 14} ${YS_IN} H ${X1 + 40}`, `M ${X0 - 14} ${YI_TOP} H ${X1 + 40}`,
    ].join(' ');
    g += `<path d="${guides}" stroke="${PINK2}" stroke-width="0.75" stroke-dasharray="4 3" fill="none"/>`;
    // círculos de raio (arco externo e pétala)
    g += `<circle cx="${APX}" cy="${ICON_GEO.YS_IN}" r="${(X1 - X0) / 2}" stroke="#7C8DB0" stroke-width="0.75" stroke-dasharray="2 3" fill="none"/>`;
    g += `<circle cx="${PETAL_PARAMS[3]}" cy="${PETAL_PARAMS[4]}" r="${PETAL_PARAMS[0] / 2}" stroke="#7C8DB0" stroke-width="0.75" stroke-dasharray="2 3" fill="none"/>`;
    // formas em contorno
    g += `<path d="${iconD}" fill="none" stroke="${NAVY}" stroke-width="1.5"/>`;
    g += `<path d="${pet.d}" fill="none" stroke="${PINK}" stroke-width="1.5"/>`;
    g += '</g></svg>';
    return g;
  })();

  // ----- Área de segurança (clear space = metade da altura do símbolo) -----
  const safeSvg = (() => {
    const clear = (IB.y1 - IB.y0) / 2; // "x" = 65,5 un.
    const W = CB.x1 - CB.x0 + 2 * clear, H = CB.y1 - CB.y0 + 2 * clear;
    let g = `${svgOpen(`0 0 ${W.toFixed(0)} ${H.toFixed(0)}`)}`;
    g += `<rect width="${W.toFixed(0)}" height="${H.toFixed(0)}" fill="${WHITE}"/>`;
    g += `<rect x="1" y="1" width="${(W - 2).toFixed(0)}" height="${(H - 2).toFixed(0)}" fill="none" stroke="${PINK2}" stroke-width="1" stroke-dasharray="6 4"/>`;
    // módulo "x" de referência no canto
    g += `<rect x="1" y="1" width="${clear.toFixed(0)}" height="${clear.toFixed(0)}" fill="${PINK2}" opacity="0.15"/>`;
    g += `<g transform="translate(${(clear - CB.x0).toFixed(0)} ${(clear - CB.y0).toFixed(0)})">${lockupArt(NAVY, PINK)}</g></svg>`;
    return g;
  })();

  return { lockupSvg, lockupBgSvg, iconSvg, faviconSvg, appIconSvg, gridSvg, safeSvg, nexa, beauty, IB };
}

const A = buildAssets();

// 1-5) lockups: dark (branco p/ fundo escuro), light (navy p/ fundo claro), fundo, mono
fs.writeFileSync(path.join(BRAND_DIR, 'nexa-beauty-lockup.svg'), A.lockupSvg(WHITE, PINK));
fs.writeFileSync(path.join(BRAND_DIR, 'nexa-beauty-lockup-light.svg'), A.lockupSvg(NAVY, PINK));
fs.writeFileSync(path.join(BRAND_DIR, 'nexa-beauty-lockup-bg.svg'), A.lockupBgSvg);
fs.writeFileSync(path.join(BRAND_DIR, 'nexa-beauty-lockup-mono-white.svg'), A.lockupSvg(WHITE, WHITE));
fs.writeFileSync(path.join(BRAND_DIR, 'nexa-beauty-lockup-mono-navy.svg'), A.lockupSvg(NAVY, NAVY));
// ícone isolado
fs.writeFileSync(path.join(BRAND_DIR, 'nexa-icon.svg'), A.iconSvg(WHITE, PINK));
fs.writeFileSync(path.join(BRAND_DIR, 'nexa-icon-light.svg'), A.iconSvg(NAVY, PINK));
fs.writeFileSync(path.join(BRAND_DIR, 'nexa-icon-mono-white.svg'), A.iconSvg(WHITE, WHITE));
fs.writeFileSync(path.join(BRAND_DIR, 'nexa-icon-mono-navy.svg'), A.iconSvg(NAVY, NAVY));
// 7-8) favicon e app icon; 9-10) grid e safe area
fs.writeFileSync(path.join(PUBLIC_DIR, 'favicon.svg'), A.faviconSvg);
fs.writeFileSync(path.join(BRAND_DIR, 'nexa-app-icon.svg'), A.appIconSvg);
fs.writeFileSync(path.join(BRAND_DIR, 'nexa-construction-grid.svg'), A.gridSvg);
fs.writeFileSync(path.join(BRAND_DIR, 'nexa-safe-area.svg'), A.safeSvg);

// preview para inspeção
fs.writeFileSync(path.join(OUT, 'lockup-preview.svg'), A.lockupBgSvg.replace(HEADER, ''));

console.log('nexa bbox:', JSON.stringify(A.nexa.bbox));
console.log('beauty bbox:', JSON.stringify(A.beauty.bbox));
console.log('assets svg gravados');

// ---------- Rasterização ----------
(async () => {
  const sharp = require('sharp');
  const pngToIcoMod = require('png-to-ico');
  const pngToIco = pngToIcoMod.default || pngToIcoMod;

  const favBuf = Buffer.from(A.faviconSvg);
  const png = (buf, size) => sharp(buf, { density: 300 }).resize(size, size).png().toBuffer();

  const [p16, p32, p48, p180, p192, p512] = await Promise.all(
    [16, 32, 48, 180, 192, 512].map((s) => png(favBuf, s)),
  );
  fs.writeFileSync(path.join(PUBLIC_DIR, 'favicon.ico'), await pngToIco([p16, p32, p48]));
  fs.writeFileSync(path.join(PUBLIC_DIR, 'apple-touch-icon.png'), p180);
  fs.writeFileSync(path.join(BRAND_DIR, 'nexa-icon-192.png'), p192);
  fs.writeFileSync(path.join(BRAND_DIR, 'nexa-icon-512.png'), p512);
  fs.writeFileSync(path.join(BRAND_DIR, 'nexa-app-icon-1024.png'), await png(Buffer.from(A.appIconSvg), 1024));

  // previews de inspeção
  await sharp(p16).resize(128, 128, { kernel: 'nearest' }).png().toFile(path.join(OUT, 'favicon-16-preview.png'));
  await sharp(p32).resize(128, 128, { kernel: 'nearest' }).png().toFile(path.join(OUT, 'favicon-32-preview.png'));
  await sharp(Buffer.from(A.lockupBgSvg), { density: 150 }).png().toFile(path.join(OUT, 'lockup-preview.png'));
  await sharp(Buffer.from(A.gridSvg), { density: 300 }).png().toFile(path.join(OUT, 'grid-preview.png'));
  await sharp(Buffer.from(A.safeSvg), { density: 150 }).png().toFile(path.join(OUT, 'safe-preview.png'));
  console.log('favicon.ico, app icon e PNGs gerados');
})();
