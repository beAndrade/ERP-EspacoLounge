/**
 * Unidades de registro de saída do produto (labels Belasis + código no BD).
 * `produtos.unidade` grava o `codigo`; a UI mostra o `label`.
 */

export type ProdutoUnidadeDef = {
  /** Valor do select / label exibida. */
  label: string;
  /** Valor persistido em `produtos.unidade`. */
  codigo: string;
  /**
   * Medida contínua (ml, g, …): mostra “Uma unidade equivale a”
   * e entrada por frasco × equivalência.
   */
  medidaContinua: boolean;
  /** Sufixo curto na UI (ml, g, unidade…). */
  sufixo: string;
};

export const PRODUTO_UNIDADES: readonly ProdutoUnidadeDef[] = [
  { label: 'em unidade', codigo: 'unidade', medidaContinua: false, sufixo: 'unidade' },
  { label: 'em mililitros (ml)', codigo: 'ml', medidaContinua: true, sufixo: 'ml' },
  { label: 'em gramas (g)', codigo: 'g', medidaContinua: true, sufixo: 'g' },
  { label: 'em dosagem', codigo: 'dosagem', medidaContinua: false, sufixo: 'dosagem' },
  { label: 'em litros (l)', codigo: 'l', medidaContinua: true, sufixo: 'l' },
  { label: 'em caixa', codigo: 'caixa', medidaContinua: false, sufixo: 'caixa' },
  { label: 'em pacote', codigo: 'pacote', medidaContinua: false, sufixo: 'pacote' },
  { label: 'em miligramas (mg)', codigo: 'mg', medidaContinua: true, sufixo: 'mg' },
  { label: 'em centímetros (cm)', codigo: 'cm', medidaContinua: true, sufixo: 'cm' },
  { label: 'em horas (h)', codigo: 'h', medidaContinua: false, sufixo: 'h' },
  { label: 'em quilogramas (kg)', codigo: 'kg', medidaContinua: true, sufixo: 'kg' },
  { label: 'em pote', codigo: 'pote', medidaContinua: false, sufixo: 'pote' },
  { label: 'em frasco', codigo: 'frasco', medidaContinua: false, sufixo: 'frasco' },
  { label: 'em peça', codigo: 'peca', medidaContinua: false, sufixo: 'peça' },
  { label: 'em rolo', codigo: 'rolo', medidaContinua: false, sufixo: 'rolo' },
  { label: 'em aplicação', codigo: 'aplicacao', medidaContinua: false, sufixo: 'aplicação' },
  { label: 'em saco', codigo: 'saco', medidaContinua: false, sufixo: 'saco' },
  { label: 'em ampola', codigo: 'ampola', medidaContinua: false, sufixo: 'ampola' },
  { label: 'em galão', codigo: 'galao', medidaContinua: false, sufixo: 'galão' },
  { label: 'em bisnaga', codigo: 'bisnaga', medidaContinua: false, sufixo: 'bisnaga' },
  { label: 'em cápsula', codigo: 'capsula', medidaContinua: false, sufixo: 'cápsula' },
  { label: 'em cartela', codigo: 'cartela', medidaContinua: false, sufixo: 'cartela' },
  { label: 'em comprimido', codigo: 'comprimido', medidaContinua: false, sufixo: 'comprimido' },
  { label: 'em sachê', codigo: 'sache', medidaContinua: false, sufixo: 'sachê' },
  { label: 'em metros (m)', codigo: 'm', medidaContinua: true, sufixo: 'm' },
] as const;

const byCodigo = new Map(
  PRODUTO_UNIDADES.map((u) => [u.codigo, u] as const),
);
const byLabel = new Map(
  PRODUTO_UNIDADES.map((u) => [u.label, u] as const),
);

/** Labels legados do select antigo → código. */
const LABEL_LEGADO_PARA_CODIGO: Record<string, string> = {
  'em unidade': 'unidade',
  'em ml': 'ml',
  'em mililitros (ml)': 'ml',
  'em gramas': 'g',
  'em gramas (g)': 'g',
};

/** Códigos legados soltos. */
const CODIGO_LEGADO: Record<string, string> = {
  gramas: 'g',
  mililitros: 'ml',
  unidade: 'unidade',
};

export function normalizarCodigoUnidadeProduto(
  raw: string | null | undefined,
): string {
  const s = String(raw ?? '').trim();
  if (!s) return 'unidade';
  if (byCodigo.has(s)) return s;
  const lower = s.toLowerCase();
  if (byCodigo.has(lower)) return lower;
  if (CODIGO_LEGADO[lower]) return CODIGO_LEGADO[lower];
  if (LABEL_LEGADO_PARA_CODIGO[s]) return LABEL_LEGADO_PARA_CODIGO[s];
  if (LABEL_LEGADO_PARA_CODIGO[lower]) return LABEL_LEGADO_PARA_CODIGO[lower];
  const porLabel = byLabel.get(s) ?? byLabel.get(lower);
  if (porLabel) return porLabel.codigo;
  return 'unidade';
}

export function labelUnidadeProduto(codigoOuLabel: string | null | undefined): string {
  const codigo = normalizarCodigoUnidadeProduto(codigoOuLabel);
  return byCodigo.get(codigo)?.label ?? 'em unidade';
}

export function defUnidadeProduto(
  codigoOuLabel: string | null | undefined,
): ProdutoUnidadeDef {
  const codigo = normalizarCodigoUnidadeProduto(codigoOuLabel);
  return (
    byCodigo.get(codigo) ??
    PRODUTO_UNIDADES[0]!
  );
}

export function unidadeProdutoUsaEquivalente(
  codigoOuLabel: string | null | undefined,
): boolean {
  return defUnidadeProduto(codigoOuLabel).medidaContinua;
}

export function sufixoUnidadeProduto(
  codigoOuLabel: string | null | undefined,
  quantidade?: number | null,
): string {
  const def = defUnidadeProduto(codigoOuLabel);
  if (def.codigo === 'unidade') {
    const q = quantidade == null ? 1 : Math.abs(quantidade);
    return q > 1 ? 'unidades' : 'unidade';
  }
  return def.sufixo;
}

/**
 * Nome por extenso para sufixo de campos (sem “em” e sem abreviação).
 * Ex.: "em mililitros (ml)" → "mililitros"
 */
export function nomeCompletoUnidadeProduto(
  codigoOuLabel: string | null | undefined,
  quantidade?: number | null,
): string {
  const def = defUnidadeProduto(codigoOuLabel);
  if (def.codigo === 'unidade') {
    return sufixoUnidadeProduto(def.codigo, quantidade);
  }
  return def.label
    .replace(/^em\s+/i, '')
    .replace(/\s*\([^)]*\)\s*$/, '')
    .trim();
}

export function codigoUnidadeAPartirDoLabelSelect(label: string): string {
  const s = String(label ?? '').trim();
  if (LABEL_LEGADO_PARA_CODIGO[s]) return LABEL_LEGADO_PARA_CODIGO[s];
  return byLabel.get(s)?.codigo ?? normalizarCodigoUnidadeProduto(s);
}
