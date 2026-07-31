// Sobrepõe referência (vermelho) e vetor (verde): amarelo = coincidência.
const path = require('path');
const sharp = require('sharp');
const OUT = path.join(__dirname, 'out');

(async () => {
  const W = 456, H = 480;
  const refCrop = await sharp(path.join(__dirname, 'reference.png'))
    .extract({ left: 28, top: 16, width: 76, height: 80 })
    .resize(W, H, { kernel: 'lanczos3', fit: 'fill' })
    .greyscale().raw().toBuffer();

  const big = await sharp(path.join(OUT, 'lockup-bold-medium.svg')).resize(3852, 1344).png().toBuffer();
  const renCrop = await sharp(big)
    .extract({ left: 336, top: 192, width: 912, height: 960 })
    .resize(W, H, { fit: 'fill' })
    .greyscale().raw().toBuffer();

  const out = Buffer.alloc(W * H * 3);
  for (let i = 0; i < W * H; i++) {
    out[i * 3] = refCrop[i];     // R = referência
    out[i * 3 + 1] = renCrop[i]; // G = vetor
    out[i * 3 + 2] = 30;
  }
  await sharp(out, { raw: { width: W, height: H, channels: 3 } })
    .png().toFile(path.join(OUT, 'overlay.png'));
  console.log('overlay.png ok (vermelho=ref, verde=vetor, amarelo=match)');
})();
