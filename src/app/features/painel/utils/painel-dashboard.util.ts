import type { AtendimentoListaItem, CaixaDiaResumo } from '../../../core/models/api.models';
import {
  horaInicialMenorDasLinhasAtendimento,
  pedidoTemPosicaoNaGrelhaAgenda,
  valorMonetarioParaNumero,
} from '../../../core/utils/atendimento-display';
import { normalizarAgendaStatusId } from '../../../core/utils/agenda-status-card';
import type {
  PainelAgendaCardVm,
  PainelAgendaProximoItem,
  PainelFaturamentoCardVm,
  PainelFaturamentoMetodoLinha,
} from '../models/painel-dashboard.models';

/** Agrupa linhas de atendimento pelo id do pedido. */
export function agruparAtendimentosPorPedido(
  linhas: AtendimentoListaItem[],
): Map<string, AtendimentoListaItem[]> {
  const map = new Map<string, AtendimentoListaItem[]>();
  for (const row of linhas) {
    const id = String(row.id ?? '').trim();
    if (!id) continue;
    const list = map.get(id);
    if (list) list.push(row);
    else map.set(id, [row]);
  }
  return map;
}

/**
 * Monta o VM do card Agenda de hoje a partir dos atendimentos do dia.
 * Mostra até 4 próximos (ordenados por hora).
 */
export function mapAtendimentosParaAgendaCardVm(
  linhas: AtendimentoListaItem[],
  dataYmd: string,
): PainelAgendaCardVm {
  const dia = dataYmd.trim().slice(0, 10);
  const grupos = agruparAtendimentosPorPedido(linhas);
  const proximos: PainelAgendaProximoItem[] = [];

  for (const [, rows] of grupos) {
    if (!pedidoTemPosicaoNaGrelhaAgenda(rows, dia)) continue;
    const hora = horaInicialMenorDasLinhasAtendimento(rows, dia);
    if (!hora) continue;
    const nome =
      rows.map((r) => String(r.nomeCliente ?? '').trim()).find(Boolean) ||
      'Cliente';
    const statusRaw = rows
      .map((r) => r.agenda_status)
      .find((s) => s != null && String(s).trim());
    const status = normalizarAgendaStatusId(statusRaw);
    proximos.push({
      hora,
      nome,
      confirmado: status === 'confirmado',
    });
  }

  proximos.sort((a, b) => a.hora.localeCompare(b.hora));

  return {
    total: proximos.length,
    proximos: proximos.slice(0, 4),
    spark: [],
  };
}

function rotuloMetodoPagamento(metodo: string): string {
  const m = metodo.trim().toLowerCase().replace(/\s+/g, '_');
  if (m === 'pix') return 'PIX';
  if (m === 'dinheiro') return 'Dinheiro';
  if (
    m.includes('cartao') ||
    m.includes('cartão') ||
    m === 'credito' ||
    m === 'debito'
  ) {
    return 'Cartão';
  }
  if (m === 'transferencia' || m === 'transferência') return 'Transferência';
  if (m === 'outros') return 'Outros';
  if (!m) return 'Outros';
  return metodo.trim() || 'Outros';
}

/** Receitas do dia via resumo de caixa (métodos reais, sem inventar). */
export function mapCaixaDiaParaFaturamentoCardVm(
  caixa: CaixaDiaResumo,
): PainelFaturamentoCardVm {
  const total = valorMonetarioParaNumero(caixa.total_receitas) ?? 0;
  const despesas = valorMonetarioParaNumero(caixa.total_despesas) ?? 0;
  const lucro = valorMonetarioParaNumero(caixa.saldo_dia);
  const porRotulo = new Map<string, number>();

  for (const row of caixa.receitas_por_metodo ?? []) {
    const rotulo = rotuloMetodoPagamento(String(row.metodo ?? ''));
    const valor = valorMonetarioParaNumero(row.total) ?? 0;
    porRotulo.set(rotulo, (porRotulo.get(rotulo) ?? 0) + valor);
  }

  const metodos: PainelFaturamentoMetodoLinha[] = [...porRotulo.entries()]
    .filter(([, v]) => v > 0)
    .map(([rotulo, valor]) => ({ rotulo, valor }))
    .sort((a, b) => b.valor - a.valor);

  return {
    total: Number.isFinite(total) ? total : null,
    despesas: Number.isFinite(despesas) ? despesas : null,
    lucro: lucro != null && Number.isFinite(lucro) ? lucro : total - despesas,
    qtdVendas: null,
    ticketMedio: null,
    vsOntemPct: null,
    metodos,
    spark: [],
  };
}
