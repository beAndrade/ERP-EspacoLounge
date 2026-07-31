// Valida o favicon em todos os tamanhos exigidos (16..512), ampliados para inspeção.
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const OUT = path.join(__dirname, 'out');

(async () => {
  const svg = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'favicon.svg'));
  const sizes = [16, 24, 32, 48, 64, 128, 512];
  const DISPLAY = 128;
  const tiles = [];
  for (const s of sizes) {
    const r = await sharp(svg, { density: 300 }).resize(s, s).png().toBuffer();
    tiles.push(await sharp(r).resize(DISPLAY, DISPLAY, { kernel: s < DISPLAY ? 'nearest' : 'lanczos3' }).png().toBuffer());
  }
  await sharp({ create: { width: (DISPLAY + 10) * sizes.length + 10, height: DISPLAY + 20, channels: 3, background: '#3a4152' } })
    .composite(tiles.map((t, i) => ({ input: t, left: 10 + i * (DISPLAY + 10), top: 10 })))
    .png().toFile(path.join(OUT, 'sizes-sheet.png'));
  console.log('sizes-sheet.png ok:', sizes.join(', '));
})();
