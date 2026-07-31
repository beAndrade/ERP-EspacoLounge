# Identidade vetorial Nexa

Gera a marca **Nexa** (produto atual: Nexa Beauty) como assets vetoriais de produção.
Direção aprovada: **Geométrica** (construção por arcos perfeitos, estilo Linear/Vercel) —
um "n" minúsculo custom com pétala abstrata, pensado para escalar a futuros produtos
(Nexa Sports, Clinic, Pet, Finance) sem remeter diretamente à estética de beleza.

## Entregáveis

| Arquivo | Conteúdo |
|---|---|
| `public/brand/logo.svg` | Lockup horizontal, branco (primário — UI escura) |
| `public/brand/logo-dark.svg` | Lockup com fundo `#101828` baked |
| `public/brand/logo-light.svg` | Lockup navy (fundos claros) |
| `public/brand/logo-mono-white.svg` / `logo-mono-navy.svg` | Monocromático (1 cor) |
| `public/brand/logo-icon.svg` / `logo-icon-light.svg` | Símbolo isolado |
| `public/brand/app-icon.svg` / `app-icon-1024.png` | App icon (rx 22%) |
| `public/brand/construction-grid.svg` | Grid de construção (malha + círculos geradores) |
| `public/brand/safe-area.svg` | Área de segurança (clear space = ½ altura do símbolo) |
| `public/favicon.svg` / `favicon.ico` / `favicon-16/32/48.png` | Favicons |
| `public/apple-touch-icon.png` / `android-chrome-192/512.png` | Ícones mobile |

## Paleta

| Cor | Hex |
|---|---|
| Navy (fundo / light) | `#101828` |
| Rosa (pétala) | `#F43F7A` |
| Rosa secundário (guias) | `#FF5C9D` |
| Branco | `#FFFFFF` |

## Construção do símbolo (13 âncoras)

- Domo externo: **semicírculo perfeito** r=52 (centro 116,94).
- Contra-forma: **semicírculo perfeito** r=23 (centro 118,94).
- Hastes: esquerda 31 un., direita 27 un. (compensação óptica de peso).
- Corte da perna direita: **exatamente 45°**, de (168,123) a (141,150), cantos r=10.
- Pétala: lente de dois arcos circulares 76×33 un., eixo **paralelo ao corte** (-45°),
  folga perpendicular constante ≈6 un. (legível em 16px).
- Terminais das hastes: r=10.

## Tipografia (tudo convertido em contornos — sem dependência de fontes)

- **"nexa"**: Space Grotesk Bold (OFL), x-height 76 un., tracking -0.012em,
  kerning óptico em `ex`/`xa` (-0.006em).
- **"BEAUTY"**: Inter Medium (OFL), cap height 26 un., tracking 0.34em,
  alinhado começando sob o "e" de nexa.
- Composição: gap ícone-texto 16 un. (8px no tamanho base); baselines 123/169.

## Regenerar

```powershell
cd scripts/brand
npm install
curl.exe -sL -o SpaceGrotesk-Bold.ttf https://github.com/floriankarsten/space-grotesk/raw/master/fonts/ttf/static/SpaceGrotesk-Bold.ttf
# Inter-Medium.ttf: extrair de https://github.com/rsms/inter/releases (extras/ttf)
node generate.js
```

Apoio: `directions.js` (estudo das 3 direções criativas), `sizes.js` (valida 16..512px),
`measure.js` / `compare.js` / `overlay.js` / `zoom.js` (fidelidade vs. `reference.png`).
Saídas de inspeção em `out/`.
