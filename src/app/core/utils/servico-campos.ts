import type { Servico } from '../models/api.models';

/**
 * Lê um campo do catálogo de serviços, aceitando rótulos legados (planilha)
 * e aliases ASCII/snake_case da API.
 */
export function lerServicoCampo(
  item: Servico | Record<string, unknown>,
  ...keys: string[]
): unknown {
  const rec = item as Record<string, unknown>;
  for (const k of keys) {
    if (!(k in rec)) continue;
    const v = rec[k];
    if (v == null) continue;
    const s = String(v).trim();
    if (!s || s === '-' || s === '—') continue;
    return v;
  }
  return null;
}

export function lerServicoTexto(
  item: Servico | Record<string, unknown>,
  ...keys: string[]
): string {
  const v = lerServicoCampo(item, ...keys);
  return v == null ? '' : String(v).trim();
}
