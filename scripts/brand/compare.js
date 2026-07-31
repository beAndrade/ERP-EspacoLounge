// Rasteriza as variantes e empilha com a referência para comparação visual.
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const OUT = path.join(__dirname, 'out');

(async () => {
  const names = process.argv.slice(2);
  const files = names.length ? names : fs.readdirSync(OUT).filter((f) => f.startsWith('lockup-') && f.endsWith('.svg'));
  const W = 642, H = 224;

  const ref = await sharp(path.join(__dirname, 'reference.png')).resize(W, null).png().toBuffer();
  const refMeta = await sharp(ref).metadata();

  const rendered = [];
  for (const f of files) {
    const buf = await sharp(path.join(OUT, f), { density: 96 }).resize(W, H).png().toBuffer();
    rendered.push({ f, buf });
  }

  const label = 8;
  const totalH = refMeta.height + rendered.length * (H + label) + label;
  const composites = [{ input: ref, left: 0, top: label }];
  let y = refMeta.height + 2 * label;
  for (const r of rendered) {
    composites.push({ input: r.buf, left: 0, top: y });
    y += H + label;
  }
  await sharp({ create: { width: W, height: totalH, channels: 3, background: '#444444' } })
    .composite(composites).png().toFile(path.join(OUT, 'compare.png'));
  console.log('ordem:', ['reference', ...rendered.map((r) => r.f)].join(' | '));
})();
