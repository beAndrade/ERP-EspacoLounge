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
  if (tipo === 'fixo') {
    const v = valorMonetarioParaNumero(s['Valor Base']);
    return v != null && v > 0 ? v : null;
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
  return v != null && v > 0 ? v : null;
}
