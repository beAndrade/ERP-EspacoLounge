import type { Servico } from '../models/api.models';
import { valorMonetarioParaNumero } from './atendimento-display';

/**
 * Preço unitário no catálogo (aba Serviços), alinhado à API `listServicosForApi`.
 */
export function precoUnitarioServicoCatalogo(
  s: Servico | undefined,
  tamanho: string,
): number | null {
  if (!s) return null;
  const tipo = String(s['Tipo'] ?? '')
    .trim()
    .toLowerCase();
  const valorBase = valorMonetarioParaNumero(s['Valor Base']);
  const temValorBase = valorBase != null && valorBase > 0;
  /** Fixo, ou legado sem tipo com Valor Base preenchido. */
  const comoFixo = tipo === 'fixo' || (!tipo && temValorBase);
  if (comoFixo) {
    return temValorBase ? valorBase : null;
  }
  const tam = (tamanho || 'Curto').trim();
  const keyMap: Record<string, string> = {
    Curto: 'Preço Curto',
    Médio: 'Preço Médio',
    'M/L': 'Preço Médio/Longo',
    Longo: 'Preço Longo',
  };
  const col = keyMap[tam] ?? 'Preço Curto';
  const raw = (s as Record<string, unknown>)[col];
  const v = valorMonetarioParaNumero(raw);
  if (v != null && v > 0) return v;
  /** Último recurso: Valor Base se os preços por tamanho estiverem vazios. */
  return temValorBase ? valorBase : null;
}
