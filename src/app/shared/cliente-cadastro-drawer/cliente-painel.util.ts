import type { AtendimentoListaItem } from '../../core/models/api.models';
import { normalizarAgendaStatusId } from '../../core/utils/agenda-status-card';
import { linhaResumoAtendimentoLista } from '../../core/utils/atendimento-display';
import {
  agruparAtendimentosEmComandas,
  cobrancaFinalizadaItem,
  idClienteDoGrupo,
  painelDebitosClienteFromAtendimentos,
  totalDebitosCliente,
  type ComandaGrupoResumo,
} from '../../core/utils/comanda-status.util';

export type ClientePainelUltimoServico = {
  idAtendimento: string;
  descricao: string;
  profissional: string;
  dataYmd: string;
  dataExibicao: string;
  numeroComanda: number | null;
};

export type ClientePainelResumo = {
  /** Soma das comandas faturadas do cliente (reais). */
  faturamento: number;
  /** Débitos em aberto do cliente (reais). */
  debitosTotal: number;
  /** Dias desde a última visita faturada (null se nunca veio). */
  diasSemVir: number | null;
  /** Dias desde o primeiro registo do cliente (null se sem histórico). */
  tempoComoClienteDias: number | null;
  /** Percentagem de agendamentos cancelados sobre o total. */
  taxaCancelamentoPct: number;
  /** Intervalo médio (dias) entre visitas (null se < 1 visita). */
  taxaRetornoDias: number | null;
  /** Pacotes em aberto (sem suporte no backend por agora). */
  pacotesAberto: number;
  ultimosServicos: ClientePainelUltimoServico[];
};

function ymdParaExibicaoDdMmYyyy(ymd: string): string {
  const y = String(ymd ?? '').trim().slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(y);
  if (!m) return y || '—';
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function parseYmd(ymd: string | null | undefined): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd ?? '').slice(0, 10));
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

function hojeLocal(): Date {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}

function diffDias(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / 86_400_000);
}

function descricaoGrupo(g: ComandaGrupoResumo): string {
  const counts = new Map<string, number>();
  for (const l of g.linhas) {
    const label = linhaResumoAtendimentoLista(l).trim();
    if (!label || label === '—') continue;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  if (counts.size === 0) return '—';
  return [...counts.entries()]
    .map(([label, n]) => (n > 1 ? `(${n}x) ${label}` : label))
    .join(', ');
}

function profissionalGrupo(g: ComandaGrupoResumo): string {
  for (const l of g.linhas) {
    const p = String(l.profissional ?? '').trim();
    if (p) return p;
  }
  return '—';
}

function valorGrupo(g: ComandaGrupoResumo): number {
  const v = g.valorTotal;
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0;
}

/**
 * Consolida as métricas da aba «Painel» do cliente a partir da lista de
 * atendimentos (agrupados por comanda) e dos saldos já conhecidos.
 */
export function calcularPainelCliente(
  clienteId: string,
  items: AtendimentoListaItem[],
  opts?: { nomeCliente?: string; maxUltimosServicos?: number },
): ClientePainelResumo {
  const cid = String(clienteId ?? '').trim();
  const grupos = agruparAtendimentosEmComandas(items).filter(
    (g) => idClienteDoGrupo(g) === cid,
  );

  let faturamento = 0;
  const faturados: ComandaGrupoResumo[] = [];
  for (const g of grupos) {
    const l0 = g.linhas[0];
    if (l0 && cobrancaFinalizadaItem(l0)) {
      faturamento += valorGrupo(g);
      faturados.push(g);
    }
  }
  faturamento = Math.round(faturamento * 100) / 100;

  const painelDeb = painelDebitosClienteFromAtendimentos(cid, items, {
    nomeCliente: opts?.nomeCliente,
  });
  const debitosTotal = totalDebitosCliente(painelDeb.debitos);

  const datasVisita = faturados
    .map((g) => parseYmd(g.data))
    .filter((d): d is Date => d != null)
    .sort((a, b) => a.getTime() - b.getTime());
  const datasTodas = grupos
    .map((g) => parseYmd(g.data))
    .filter((d): d is Date => d != null)
    .sort((a, b) => a.getTime() - b.getTime());

  const hj = hojeLocal();
  const ultimaVisita = datasVisita.at(-1) ?? null;
  const primeiraData = datasTodas[0] ?? null;

  const diasSemVir = ultimaVisita ? Math.max(0, diffDias(hj, ultimaVisita)) : null;
  const tempoComoClienteDias = primeiraData
    ? Math.max(0, diffDias(hj, primeiraData))
    : null;

  let cancelados = 0;
  for (const g of grupos) {
    if (normalizarAgendaStatusId(g.linhas[0]?.agenda_status) === 'cancelado') {
      cancelados++;
    }
  }
  const taxaCancelamentoPct = grupos.length
    ? Math.round((cancelados / grupos.length) * 1000) / 10
    : 0;

  let taxaRetornoDias: number | null = null;
  if (datasVisita.length >= 2) {
    let soma = 0;
    for (let i = 1; i < datasVisita.length; i++) {
      soma += diffDias(datasVisita[i], datasVisita[i - 1]);
    }
    taxaRetornoDias = Math.round(soma / (datasVisita.length - 1));
  } else if (ultimaVisita) {
    taxaRetornoDias = Math.max(0, diffDias(hj, ultimaVisita));
  }

  const max = opts?.maxUltimosServicos ?? 5;
  const ultimosServicos: ClientePainelUltimoServico[] = faturados
    .map((g) => ({ g, d: parseYmd(g.data) }))
    .filter((x): x is { g: ComandaGrupoResumo; d: Date } => x.d != null)
    .sort((a, b) => b.d.getTime() - a.d.getTime())
    .slice(0, max)
    .map(({ g }) => {
      const l0 = g.linhas[0];
      const n = l0?.numeroComanda;
      return {
        idAtendimento: String(l0?.id ?? '').trim(),
        descricao: descricaoGrupo(g),
        profissional: profissionalGrupo(g),
        dataYmd: (g.data || '').slice(0, 10),
        dataExibicao: ymdParaExibicaoDdMmYyyy(g.data),
        numeroComanda:
          typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null,
      };
    })
    .filter((r) => r.idAtendimento.length > 0);

  return {
    faturamento,
    debitosTotal,
    diasSemVir,
    tempoComoClienteDias,
    taxaCancelamentoPct,
    taxaRetornoDias,
    pacotesAberto: 0,
    ultimosServicos,
  };
}
