# Identidade vetorial Nexa

Gera a marca **Nexa** (produto atual: Nexa Beauty) como assets vetoriais de produção.
O símbolo é um "n" minúsculo custom (desenhado à mão com Béziers paramétricas) com uma
pétala abstrata no pé direito — pensado para escalar a futuros produtos
(Nexa Sports, Nexa Clinic, Nexa Pet, Nexa Finance) sem remeter diretamente à estética de beleza.

## Entregáveis

| Arquivo | Conteúdo |
|---|---|
| `public/brand/nexa-beauty-lockup.svg` | Lockup horizontal, branco (fundos escuros) |
| `public/brand/nexa-beauty-lockup-light.svg` | Lockup, navy (fundos claros) |
| `public/brand/nexa-beauty-lockup-bg.svg` | Lockup sobre fundo navy |
| `public/brand/nexa-beauty-lockup-mono-white.svg` / `-mono-navy.svg` | Monocromático (1 cor) |
| `public/brand/nexa-icon.svg` / `-light` / `-mono-white` / `-mono-navy` | Símbolo isolado |
| `public/brand/nexa-icon-192.png` / `-512.png` | Rasters p/ PWA/manifest |
| `public/brand/nexa-app-icon.svg` / `-1024.png` | App icon (rx 22%) |
| `public/brand/nexa-construction-grid.svg` | Grid de construção (malha 8un + guias + raios) |
| `public/brand/nexa-safe-area.svg` | Área de segurança (clear space = ½ altura do símbolo) |
| `public/favicon.svg`, `public/favicon.ico` (16/32/48), `public/apple-touch-icon.png` | Favicons |

## Paleta

| Cor | Hex |
|---|---|
| Navy (fundo / light) | `#101828` |
| Rosa (pétala) | `#F43F7A` |
| Rosa secundário (guias) | `#FF5C9D` |
| Branco | `#FFFFFF` |

## Construção

- **Símbolo "n"**: Béziers paramétricas; haste esquerda 31 un. e direita 27 un.
  (esquerda levemente mais larga, por peso óptico); terminais arredondados r=10;
  corte diagonal na perna direita acomodando a pétala.
- **Pétala**: lente de dois arcos circulares (76 x 33 un., eixo a -45°).
- **"nexa"**: Space Grotesk Bold (OFL) em contornos, x-height 76 un., tracking -0.012em
  e kerning óptico em `ex`/`xa`.
- **"BEAUTY"**: Inter Medium (OFL) em contornos, cap height 26 un., tracking 0.34em,
  alinhado começando sob o "e" de nexa.
- **Composição**: gap ícone-texto de 16 un. (8px no tamanho base).

Nenhum asset final depende de fonte instalada — tudo é contorno (path).

## Regenerar

```powershell
cd scripts/brand
npm install
curl.exe -sL -o SpaceGrotesk-Bold.ttf https://github.com/floriankarsten/space-grotesk/raw/master/fonts/ttf/static/SpaceGrotesk-Bold.ttf
# Inter-Medium.ttf: extrair de https://github.com/rsms/inter/releases (extras/ttf)
node generate.js
```

Scripts de apoio: `measure.js`, `compare.js`, `overlay.js`, `zoom.js` (validação contra
`reference.png`, a arte aprovada original). Saídas de inspeção em `out/`.
