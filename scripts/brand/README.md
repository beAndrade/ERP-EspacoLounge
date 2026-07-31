# Gerador da identidade vetorial Nexa Beauty

Recria fielmente o logo aprovado (`reference.png`) como assets vetoriais de produção:

- `public/brand/nexa-beauty-lockup.svg` — lockup horizontal, texto branco (fundos escuros)
- `public/brand/nexa-beauty-lockup-navy.svg` — lockup, texto navy (fundos claros)
- `public/brand/nexa-beauty-lockup-bg.svg` — lockup com fundo navy (enquadramento da arte original)
- `public/brand/nexa-beauty-icon.svg` / `-icon-navy.svg` — símbolo isolado (n + pétala)
- `public/brand/nexa-beauty-icon-192.png` / `-512.png` — rasters para PWA/manifest
- `public/favicon.svg`, `public/favicon.ico` (16/32/48), `public/apple-touch-icon.png`

## Paleta (amostrada da arte aprovada)

| Cor | Hex |
|---|---|
| Navy (fundo) | `#030E1B` |
| Rosa (pétala) | `#F4497C` |
| Branco | `#FFFFFF` |

## Construção

- **Símbolo "n"**: desenhado à mão com Béziers paramétricas (terminais arredondados r=10,
  corte diagonal na perna direita), medidas extraídas pixel a pixel da referência (2x).
- **Pétala**: lente de dois arcos circulares (76 x 33 un., eixo a -45°).
- **"nexa"**: Poppins Bold (OFL) convertida em contornos, x-height 76 un., tracking ajustado
  para casar com a largura da referência.
- **"BEAUTY"**: Poppins Medium em contornos, cap height 26 un., tracking largo (~0.57 em).

Nenhum asset final depende de fonte instalada — tudo é contorno (path).

## Regenerar

```powershell
cd scripts/brand
npm install
curl.exe -sL -o Poppins-Bold.ttf   https://github.com/google/fonts/raw/main/ofl/poppins/Poppins-Bold.ttf
curl.exe -sL -o Poppins-Medium.ttf https://github.com/google/fonts/raw/main/ofl/poppins/Poppins-Medium.ttf
node generate.js
```

Scripts de apoio: `measure.js` (medidas da referência), `compare.js` (lado a lado com a
referência), `overlay.js` (sobreposição vermelho/verde), `zoom.js` (zoom do símbolo).
Saídas de inspeção ficam em `out/`.
