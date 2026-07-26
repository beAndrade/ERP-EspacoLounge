/**
 * Texto do tooltip nos cabeçalhos com setas de ordenação.
 * Indica a direcção do *próximo* clique (igual Clientes / Transações).
 */
export function tooltipOrdenacaoProximoClique(
  colunaAtiva: string,
  dir: 'asc' | 'desc',
  coluna: string,
): string {
  if (colunaAtiva !== coluna) {
    return 'Clique organiza por ascendente';
  }
  return dir === 'asc'
    ? 'Clique organiza por descendente'
    : 'Clique organiza por ascendente';
}
