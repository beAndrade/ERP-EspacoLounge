// Compara região do ícone: referência ampliada vs. render vetorial
const path = require('path');
const sharp = require('sharp');
const OUT = path.join(__dirname, 'out');

(async () => {
  // referência: ícone em x 28..102, y 16..92 (1x de 321x112)
  const refCrop = await sharp(path.join(__dirname, 'reference.png'))
    .extract({ left: 28, top: 16, width: 76, height: 80 })
    .resize(456, null, { kernel: 'lanczos3' })
    .png().toBuffer();

  // render: SVG 642x224 rasterizado a 6x -> 3852x1344; ícone 2x coords x 56..204, y 32..192 -> 6x: 336..1224, 192..1152
  const big = await sharp(path.join(OUT, 'lockup-bold-medium.svg')).resize(3852, 1344).png().toBuffer();
  // 1x da referência = 2 unidades de viewBox = 12 px no render 6x
  const renCrop = await sharp(big)
    .extract({ left: 336, top: 192, width: 912, height: 960 })
    .resize(456, null)
    .png().toBuffer();

  const refMeta = await sharp(refCrop).metadata();
  const H = Math.max(refMeta.height, 480);
  await sharp({ create: { width: 456 * 2 + 12, height: H, channels: 3, background: '#666' } })
    .composite([
      { input: refCrop, left: 0, top: 0 },
      { input: renCrop, left: 456 + 12, top: 0 },
    ])
    .png().toFile(path.join(OUT, 'zoom-icon.png'));
  console.log('zoom-icon.png ok (esq=referencia, dir=vetor)');
})();
