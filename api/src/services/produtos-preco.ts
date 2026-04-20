import { toNumberPt } from './finance-domain';

/**
 * Preço unitário para venda de produto: catálogo (`produtos.preco`) ou override
 * explícito no corpo (ex.: `preco_unitario` no agendamento quando o catálogo está vazio).
 * Retorna `null` se não houver valor válido.
 */
export function resolverPrecoUnitarioProduto(
  precoCatalogo: string | null,
  override: unknown,
): number | null {
  let unitNum = toNumberPt(precoCatalogo);
  if (
    unitNum === null &&
    override !== undefined &&
    override !== null &&
    override !== ''
  ) {
    unitNum =
      typeof override === 'number' && Number.isFinite(override)
        ? override
        : toNumberPt(String(override));
  }
  if (unitNum !== null && unitNum < 0) return null;
  return unitNum;
}
