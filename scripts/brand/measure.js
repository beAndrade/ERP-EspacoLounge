// Mede a arte de referência pixel a pixel para extrair proporções exatas.
const sharp = require('sharp');

const SRC = require('path').join(__dirname, 'reference.png');

(async () => {
  const { data, info } = await sharp(SRC).raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels: C } = info;
  const px = (x, y) => {
    const i = (y * W + x) * C;
    return [data[i], data[i + 1], data[i + 2]];
  };
  const isWhite = ([r, g, b]) => r > 180 && g > 180 && b > 180;
  const isPink = ([r, g, b]) => r > 140 && (r - g) > 50 && (r - b) > 20;

  const bbox = (pred) => {
    let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (pred(px(x, y), x, y)) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    }
    return { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  };

  console.log('imagem', W, 'x', H);
  const pink = bbox((c) => isPink(c));
  console.log('petala:', JSON.stringify(pink));

  // ícone = pixels brancos à esquerda do início do wordmark; achar separação: colunas sem branco
  const colHasWhite = [];
  for (let x = 0; x < W; x++) {
    let has = false;
    for (let y = 0; y < H; y++) if (isWhite(px(x, y))) { has = true; break; }
    colHasWhite.push(has);
  }
  // grupos de colunas
  const groups = [];
  let start = null;
  for (let x = 0; x < W; x++) {
    if (colHasWhite[x] && start === null) start = x;
    if (!colHasWhite[x] && start !== null) { groups.push([start, x - 1]); start = null; }
  }
  if (start !== null) groups.push([start, W - 1]);
  console.log('grupos de colunas com branco:', JSON.stringify(groups));

  const iconEnd = groups[0][1];
  const icon = bbox((c, x) => isWhite(c) && x <= iconEnd);
  console.log('icone-n:', JSON.stringify(icon));

  // wordmark região: x > iconEnd. Separar nexa (em cima) de BEAUTY (embaixo) por linha vazia
  const rowHasWhite = [];
  for (let y = 0; y < H; y++) {
    let has = false;
    for (let x = iconEnd + 1; x < W; x++) if (isWhite(px(x, y))) { has = true; break; }
    rowHasWhite.push(has);
  }
  const rowGroups = [];
  start = null;
  for (let y = 0; y < H; y++) {
    if (rowHasWhite[y] && start === null) start = y;
    if (!rowHasWhite[y] && start !== null) { rowGroups.push([start, y - 1]); start = null; }
  }
  if (start !== null) rowGroups.push([start, H - 1]);
  console.log('grupos de linhas (wordmark):', JSON.stringify(rowGroups));

  const [nexaRows, beautyRows] = rowGroups;
  const nexa = bbox((c, x, y) => isWhite(c) && x > iconEnd && y >= nexaRows[0] && y <= nexaRows[1]);
  const beauty = bbox((c, x, y) => isWhite(c) && x > iconEnd && y >= beautyRows[0] && y <= beautyRows[1]);
  console.log('nexa:', JSON.stringify(nexa));
  console.log('beauty:', JSON.stringify(beauty));

  // hastes do ícone: varrer linha no meio do corpo do n
  const midY = Math.round((icon.y0 + icon.y1) / 2);
  let runs = [], run = null;
  for (let x = icon.x0 - 2; x <= iconEnd + 4; x++) {
    const w = isWhite(px(x, midY));
    if (w && run === null) run = x;
    if (!w && run !== null) { runs.push([run, x - 1]); run = null; }
  }
  console.log('linha y=' + midY + ' hastes:', JSON.stringify(runs));

  // corte da perna direita: para cada linha, última coluna branca da perna direita
  for (let y = icon.y0; y <= icon.y1 + 8 && y < H; y += 3) {
    let first = -1, last = -1;
    for (let x = 55; x <= 110; x++) if (isWhite(px(x, y))) { if (first < 0) first = x; last = x; }
    if (first >= 0) console.log('y=' + y, 'perna-direita branca x:', first, '->', last);
  }
})();
