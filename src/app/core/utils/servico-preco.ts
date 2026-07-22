import type { Servico } from '../models/api.models';
import { valorMonetarioParaNumero } from './atendimento-display';
import { lerServicoTexto } from './servico-campos';

/**
 * Preço unitário no catálogo (aba Serviços), alinhado à API `listServicosForApi`.
 */
export function precoUnitarioServicoCatalogo(
  s: Servico | undefined,
  tamanho: string,
): number | null {
  if (!s) return null;
  const tipo = lerServicoTexto(s, 'Tipo', 'tipo').toLowerCase();
  const valorBase = valorMonetarioParaNumero(
    lerServicoTexto(s, 'Valor Base', 'valor_base'),
  );
  const temValorBase = valorBase != null && valorBase > 0;
  /** Fixo, ou legado sem tipo com Valor Base preenchido. */
  const comoFixo = tipo === 'fixo' || (!tipo && temValorBase);
  if (comoFixo) {
    return temValorBase ? valorBase : null;
  }
  const tam = (tamanho || 'Curto').trim();
  const keyMap: Record<string, [string, string]> = {
    Curto: ['Preço Curto', 'preco_curto'],
    Médio: ['Preço Médio', 'preco_medio'],
    'M/L': ['Preço Médio/Longo', 'preco_medio_longo'],
    Longo: ['Preço Longo', 'preco_longo'],
  };
  const keys = keyMap[tam] ?? keyMap['Curto'];
  const v = valorMonetarioParaNumero(lerServicoTexto(s, ...keys));
  if (v != null && v > 0) return v;
  /** Último recurso: Valor Base se os preços por tamanho estiverem vazios. */
  return temValorBase ? valorBase : null;
}
