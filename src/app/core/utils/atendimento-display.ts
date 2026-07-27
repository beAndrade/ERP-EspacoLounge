import type { AtendimentoListaItem } from '../models/api.models';
import {
  minutosMeiaNoiteEmBrasilia,
  normalizarHoraHHmm,
} from './brasilia-time';
import {
  addMinutesToParts,
  civilNaiveSalaoParaUtcMs,
  parseSqlLocalDateTime,
  ymdOfParts,
} from './sql-local-datetime';

/** Data API (AAAA-MM-DD) → dd-mm-aaaa para exibição */
export function dataDdMmAaaa(ymd: string): string {
  const s = (ymd || '').trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return s || '';
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/** Data API (AAAA-MM-DD) → dd/mm/aaaa (cards Atendimentos, etc.) */
export function dataDdMmBarraAaaa(ymd: string): string {
  const s = (ymd || '').trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return s || '';
  return `${m[3]}/${m[2]}/${m[1]}`;
}

export function toDdMmYyyy(d: Date): string {
  const day = String(d.getDate()).padStart(2, '0');
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const y = d.getFullYear();
  return `${day}-${mo}-${y}`;
}

/** AAAA-MM-DD para pedidos à API */
export function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** dd-mm-aaaa ou dd/mm/aaaa → AAAA-MM-DD */
export function parseFiltroDataDdMm(s: string): string | null {
  const t = s.trim();
  const m = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/.exec(t);
  if (!m) return null;
  const day = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  const year = parseInt(m[3], 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(year, month - 1, day);
  if (
    d.getFullYear() !== year ||
    d.getMonth() !== month - 1 ||
    d.getDate() !== day
  ) {
    return null;
  }
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Aceita número, texto da planilha (R$, 1.234,56, vírgula decimal) e alguns formatos estranhos do Excel.
 */
export function valorMonetarioParaNumero(v: unknown): number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'boolean') return null;

  let t = String(v).trim();
  if (!t || t === '—' || t === '-') return null;
  if (/^#(REF|N\/A|VALUE|DIV)!?$/i.test(t)) return null;

  t = t.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
  t = t
    .replace(/R\$\s*/gi, '')
    .replace(/\s*BRL\s*/gi, '')
    .replace(/[$€£]/g, '')
    .replace(/\s/g, '');

  const lastComma = t.lastIndexOf(',');
  const lastDot = t.lastIndexOf('.');
  if (lastComma >= 0 && lastComma > lastDot) {
    const intPart = t.slice(0, lastComma).replace(/\./g, '');
    const decPart = t.slice(lastComma + 1).replace(/[^\d]/g, '');
    t = decPart.length > 0 ? `${intPart}.${decPart}` : intPart;
  } else if (lastDot >= 0 && lastDot > lastComma) {
    const parts = t.split('.');
    if (parts.length > 2) {
      const dec = parts.pop() ?? '';
      t = `${parts.join('')}.${dec.replace(/[^\d]/g, '')}`;
    }
  }

  const n = parseFloat(t.replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

/** Prioridade na ordenação (igual aos cards em Atendimentos). */
export function linhaSortPriorityAtendimento(l: AtendimentoListaItem): number {
  const t = (l.tipo || '').trim().toLowerCase();
  const et = (l.etapa || '').trim();
  const pacoteFamilia =
    t === 'pacote' || t === 'mega' || isTipoPacoteQueratinaNorm(t);
  if (pacoteFamilia && !et) return 0;
  if (pacoteFamilia) return 1;
  return 2;
}

/**
 * Tipo Pacote Adesivo+Queratina (rótulo UI, valor legado ou enum do pivot).
 * `atendimentos.tipo` guarda o rótulo; o pivot usa `pacote_queratina`.
 */
export function isTipoPacoteQueratinaNorm(tipoNorm: string): boolean {
  const t = tipoNorm.trim().toLowerCase();
  return (
    t === 'pacote adesivo+queratina' ||
    t === 'pacote queratina' ||
    t === 'pacote_queratina'
  );
}

/** Normaliza nome de etapa para comparação (minúsculas, sem acentos). */
function chaveEtapaFluxoNorm(nome: string): string {
  return nome
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** Ordem fixa das etapas Mega/Pacote (Regras Mega); outras etapas vão depois, A–Z. */
const ORDEM_FLUXO_ETAPAS_MEGA_PACOTE = [
  'retirada',
  'preparo',
  'escova',
  'colocacao',
] as const;

/** Índice 0–3 nas etapas canónicas; 100+ para etapas fora do fluxo (desempate por locale). */
export function prioridadeEtapaFluxoMegaPacote(nome: string): number {
  const k = chaveEtapaFluxoNorm(nome);
  const ix = ORDEM_FLUXO_ETAPAS_MEGA_PACOTE.findIndex((e) => e === k);
  return ix >= 0 ? ix : 100;
}

export function compararEtapasMegaPacoteFluxo(a: string, b: string): number {
  const ea = (a || '').trim();
  const eb = (b || '').trim();
  const pa = prioridadeEtapaFluxoMegaPacote(ea);
  const pb = prioridadeEtapaFluxoMegaPacote(eb);
  if (pa !== pb) return pa - pb;
  return ea.localeCompare(eb, 'pt-BR');
}

/** Lista de nomes de etapa (select, pivots): canónicas na ordem do fluxo; restantes A–Z. */
export function ordenarNomesEtapasMegaPacote(nomes: string[]): string[] {
  const visto = new Set<string>();
  const acc: string[] = [];
  for (const raw of nomes) {
    const t = raw.trim();
    if (!t) continue;
    const kn = chaveEtapaFluxoNorm(t);
    if (visto.has(kn)) continue;
    visto.add(kn);
    acc.push(t);
  }
  acc.sort((x, y) => compararEtapasMegaPacoteFluxo(x, y));
  return acc;
}

/**
 * Ordena linhas do mesmo atendimento in-place (cabeça Pacote/Mega sem etapa primeiro, etc.).
 * Usado nos cards e ao pré-preencher edição em Novo atendimento.
 */
export function ordenarLinhasAtendimentoInPlace(
  linhas: AtendimentoListaItem[],
): void {
  linhas.sort((x, y) => {
    const px = linhaSortPriorityAtendimento(x);
    const py = linhaSortPriorityAtendimento(y);
    if (px !== py) return px - py;
    const ex = (x.etapa || '').trim();
    const ey = (y.etapa || '').trim();
    if (ex && ey) {
      const tx = (x.tipo || '').trim().toLowerCase();
      const ty = (y.tipo || '').trim().toLowerCase();
      const mx =
        tx === 'mega' || tx === 'pacote' || isTipoPacoteQueratinaNorm(tx);
      const my =
        ty === 'mega' || ty === 'pacote' || isTipoPacoteQueratinaNorm(ty);
      if (mx && my) {
        return compararEtapasMegaPacoteFluxo(ex, ey);
      }
      return ex.localeCompare(ey, 'pt-BR');
    }
    return (x.descricao || '').localeCompare(y.descricao || '', 'pt-BR');
  });
}

/** Uma linha de atendimento para listas (cards, modal da agenda, etc.). */
export function linhaResumoAtendimentoLista(l: AtendimentoListaItem): string {
  const t = (l.tipo || '').trim().toLowerCase();
  if (t === 'produto') {
    const nome = (l.produtoNome || '').trim();
    const desc = (l.descricao || '').trim();
    if (nome && desc && desc !== nome) {
      return `${nome} — ${desc}`;
    }
    return nome || desc || '';
  }
  if (t === 'pacote' || isTipoPacoteQueratinaNorm(t)) {
    const pac = (l.pacote || '').trim();
    const et = (l.etapa || '').trim();
    const rotulo =
      t === 'pacote' ? 'Pacote' : 'Pacote Adesivo+Queratina';
    if (!et) {
      return pac ? `${rotulo} • ${pac}` : '';
    }
    /* Com etapa: sempre incluir o pacote (antes só aparecia a etapa). */
    if (pac && et) {
      return `${pac} — ${et}`;
    }
    return et || pac || '';
  }
  if (t === 'mega') {
    const pac = (l.pacote || '').trim();
    const et = (l.etapa || '').trim();
    if (!et) {
      return pac ? `Mega • ${pac}` : '';
    }
    if (pac && et) {
      return `${pac} — ${et}`;
    }
    return et || pac || '';
  }
  if (t === 'serviço') {
    const nome = (l.servicosRef || '').trim();
    const tam = (l.tamanho || '').trim();
    if (nome && tam) {
      return `${nome} — ${tam}`;
    }
    return nome || (l.descricao || '').trim() || '';
  }
  const nomeServ = (l.servicosRef || '').trim();
  const tamServ = (l.tamanho || '').trim();
  if (nomeServ && tamServ) {
    return `${nomeServ} — ${tamServ}`;
  }
  return (l.descricao || '').trim() || '';
}

/**
 * Total preferencial da linha para telas de leitura da comanda.
 * Prioriza `itens_catalogo[].total_linha` (quando a API já enriqueceu a pivot),
 * com fallback para o valor legado (`atendimentos.valor`).
 */
export function totalLinhaPreferencialAtendimento(
  l: AtendimentoListaItem,
): number | null {
  const tipo = (l.tipo || '').trim().toLowerCase();
  /**
   * Mega/Pacote: `itens_catalogo` vem repetido em todas as linhas do pedido;
   * o primeiro `total_linha` não-null costuma ser de outro tipo (ex. Serviço).
   * O valor cobrado por linha está em `atendimentos.valor` (espelho do pacote / etapa).
   */
  if (tipo === 'mega' || tipo === 'pacote' || isTipoPacoteQueratinaNorm(tipo)) {
    const vLinha = valorMonetarioParaNumero(l.valor);
    if (vLinha != null) return Math.max(0, vLinha);
  }
  const itens = l.itens_catalogo ?? l.itens ?? [];
  for (const it of itens) {
    const n =
      typeof it.total_linha === 'number'
        ? it.total_linha
        : valorMonetarioParaNumero(it.total_linha);
    if (n != null) return Math.max(0, n);
  }
  return valorMonetarioParaNumero(l.valor);
}

function horaDeInicioParaDiaAtendimento(
  inicio: string | null | undefined,
  dataYmd: string,
): string {
  const dia = dataYmd.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return '';
  const raw = String(inicio ?? '').trim();
  if (!raw) return '';
  const p = parseSqlLocalDateTime(raw);
  if (p && ymdOfParts(p) === dia) {
    return normalizarHoraHHmm(`${p.hh}:${p.mm}`) ?? '';
  }
  const m = minutosMeiaNoiteEmBrasilia(raw, dia);
  if (m == null) return '';
  const hh = Math.floor(m / 60) % 24;
  const mm = Math.floor(m) % 60;
  return normalizarHoraHHmm(`${hh}:${mm}`) ?? '';
}

/**
 * Quando `inicio` vem vazio (ex.: cabeça Mega/Pacote) mas `fim` existe, estima o início
 * como `fim − duracaoMin` no mesmo dia (padrão 30 min — alinhado ao slot da agenda).
 */
function horaInferidaInicioPorFimMenos(
  fimRaw: string | null | undefined,
  dataYmd: string,
  duracaoMin: number,
): string {
  const dia = dataYmd.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return '';
  const raw = String(fimRaw ?? '').trim();
  if (!raw) return '';
  const p = parseSqlLocalDateTime(raw);
  if (p && ymdOfParts(p) === dia) {
    const q = addMinutesToParts(p, -duracaoMin);
    if (ymdOfParts(q) !== dia) return '';
    return normalizarHoraHHmm(`${q.hh}:${q.mm}`) ?? '';
  }
  const mf = minutosMeiaNoiteEmBrasilia(raw, dia);
  if (mf == null) return '';
  const start = mf - duracaoMin;
  if (start < 0) return '';
  const hh = Math.floor(start / 60) % 24;
  const mm = Math.floor(start) % 60;
  return normalizarHoraHHmm(`${hh}:${mm}`) ?? '';
}

const DUR_PADRAO_INFERIR_INICIO_POR_FIM_MIN = 30;

/**
 * Menor horário (HH:mm) entre linhas do pedido (Serviço, Mega, Pacote, Produto, Cabelo, etc.).
 * Usa `inicio` quando existir; se uma linha não tiver inicio utilizável, tenta `fim − 30 min`.
 */
export function horaInicialMenorDasLinhasAtendimento(
  linhas: AtendimentoListaItem[],
  dataYmd: string,
): string {
  const dia = dataYmd.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return '';
  let best: ReturnType<typeof parseSqlLocalDateTime> = null;
  let bestMs = Infinity;
  for (const row of linhas) {
    const p = parseSqlLocalDateTime(String(row.inicio ?? '').trim());
    if (!p || ymdOfParts(p) !== dia) continue;
    const ms = civilNaiveSalaoParaUtcMs(p);
    if (Number.isFinite(ms) && ms < bestMs) {
      bestMs = ms;
      best = p;
    }
  }
  if (best) {
    return normalizarHoraHHmm(`${best.hh}:${best.mm}`) ?? '';
  }
  let bestMin = Infinity;
  let bestH = '';
  const consider = (candidato: string) => {
    const n = normalizarHoraHHmm(candidato);
    if (!n) return;
    const [hhS, mmS] = n.split(':');
    const mins = parseInt(hhS, 10) * 60 + parseInt(mmS, 10);
    if (!Number.isFinite(mins) || mins < 0) return;
    if (mins < bestMin) {
      bestMin = mins;
      bestH = n;
    }
  };
  for (const row of linhas) {
    const ini = String(row.inicio ?? '').trim();
    let obteveDeInicio = false;
    if (ini) {
      const p = parseSqlLocalDateTime(ini);
      if (p && ymdOfParts(p) === dia) {
        consider(`${p.hh}:${p.mm}`);
        obteveDeInicio = true;
      } else {
        const h = horaDeInicioParaDiaAtendimento(ini, dia);
        if (normalizarHoraHHmm(h)) {
          consider(h);
          obteveDeInicio = true;
        }
      }
    }
    if (!obteveDeInicio) {
      consider(
        horaInferidaInicioPorFimMenos(
          row.fim,
          dia,
          DUR_PADRAO_INFERIR_INICIO_POR_FIM_MIN,
        ),
      );
    }
  }
  return bestH;
}

/** `inicio` preenchido na BD para o dia civil do atendimento (slot agendado). */
export function linhaTemInicioAgendadoNoDia(
  row: AtendimentoListaItem,
  dataYmd: string,
): boolean {
  const dia = dataYmd.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return false;
  const raw = String(row.inicio ?? '').trim();
  if (!raw) return false;
  const p = parseSqlLocalDateTime(raw);
  if (p && ymdOfParts(p) === dia) return true;
  return !!horaDeInicioParaDiaAtendimento(raw, dia);
}

/** Dia civil para resolver horário (coluna Data ou `inicio`/`fim` das linhas). */
export function diaCivilReferenciaHorarioGrupo(
  linhas: AtendimentoListaItem[],
  dataGrupoYmd: string,
): string {
  const d0 = dataGrupoYmd.trim().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(d0)) return d0;
  for (const row of linhas) {
    const p = parseSqlLocalDateTime(String(row.inicio ?? '').trim());
    if (p) return ymdOfParts(p);
    const pf = parseSqlLocalDateTime(String(row.fim ?? '').trim());
    if (pf) return ymdOfParts(pf);
  }
  return d0;
}

/** Pedido com pelo menos uma linha com `atendimentos.inicio` no dia (exclui comanda walk-in). */
export function pedidoTemHorarioAgendadoNasLinhas(
  linhas: AtendimentoListaItem[],
  dataYmd: string,
): boolean {
  const dia = diaCivilReferenciaHorarioGrupo(linhas, dataYmd);
  return linhas.some((row) => linhaTemInicioAgendadoNoDia(row, dia));
}

/**
 * O pedido pode ocupar um cartão na grelha da agenda (hub) neste dia civil.
 * Diferente de contar só pela coluna `Data`: exige horário resolvível (`inicio`/`fim`).
 */
export function pedidoTemPosicaoNaGrelhaAgenda(
  linhas: AtendimentoListaItem[],
  dataYmd: string,
): boolean {
  const dia = diaCivilReferenciaHorarioGrupo(linhas, dataYmd);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return false;
  if (horaInicialMenorDasLinhasAtendimento(linhas, dia)) return true;
  for (const row of linhas) {
    if (minutosMeiaNoiteEmBrasilia(row.inicio, dia) != null) return true;
    if (minutosMeiaNoiteEmBrasilia(row.fim, dia) != null) return true;
  }
  return false;
}

/**
 * Menor HH:mm só com `inicio` explícito (sem inferir por `fim`).
 * Usado no histórico de agendamentos do cliente.
 */
export function horaInicialExplicitaDasLinhasAtendimento(
  linhas: AtendimentoListaItem[],
  dataYmd: string,
): string {
  const dia = dataYmd.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return '';
  let best: ReturnType<typeof parseSqlLocalDateTime> = null;
  let bestMs = Infinity;
  for (const row of linhas) {
    const p = parseSqlLocalDateTime(String(row.inicio ?? '').trim());
    if (!p || ymdOfParts(p) !== dia) continue;
    const ms = civilNaiveSalaoParaUtcMs(p);
    if (Number.isFinite(ms) && ms < bestMs) {
      bestMs = ms;
      best = p;
    }
  }
  if (best) {
    return normalizarHoraHHmm(`${best.hh}:${best.mm}`) ?? '';
  }
  let bestMin = Infinity;
  let bestH = '';
  for (const row of linhas) {
    const ini = String(row.inicio ?? '').trim();
    if (!ini) continue;
    const p = parseSqlLocalDateTime(ini);
    let candidato = '';
    if (p && ymdOfParts(p) === dia) {
      candidato = `${p.hh}:${p.mm}`;
    } else {
      candidato = horaDeInicioParaDiaAtendimento(ini, dia);
    }
    const n = normalizarHoraHHmm(candidato);
    if (!n) continue;
    const [hhS, mmS] = n.split(':');
    const mins = parseInt(hhS, 10) * 60 + parseInt(mmS, 10);
    if (!Number.isFinite(mins) || mins < 0) continue;
    if (mins < bestMin) {
      bestMin = mins;
      bestH = n;
    }
  }
  return bestH;
}

/** Prefer linha Serviço com `profissional_id`; senão primeira linha com profissional. */
export function profissionalIdPreferidoParaServicoExtra(
  linhas: AtendimentoListaItem[],
): number | null {
  for (const l of linhas) {
    const t = (l.tipo || '').trim().toLowerCase();
    const pid = l.profissional_id;
    if (pid != null && pid > 0) {
      if (t === 'serviço' || t === 'servico') return pid;
    }
  }
  for (const l of linhas) {
    const pid = l.profissional_id;
    if (pid != null && pid > 0) return pid;
  }
  return null;
}
