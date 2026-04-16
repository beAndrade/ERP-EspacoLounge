import type { AtendimentoListaItem } from '../models/api.models';
import {
  minutosMeiaNoiteEmBrasilia,
  normalizarHoraHHmm,
} from './brasilia-time';
import {
  civilNaiveSalaoParaUtcMs,
  parseSqlLocalDateTime,
  ymdOfParts,
} from './sql-local-datetime';

/** Data API (AAAA-MM-DD) → dd-mm-aaaa para exibição */
export function dataDdMmAaaa(ymd: string): string {
  const s = (ymd || '').trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return s || '—';
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/** Data API (AAAA-MM-DD) → dd/mm/aaaa (cards Atendimentos, etc.) */
export function dataDdMmBarraAaaa(ymd: string): string {
  const s = (ymd || '').trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return s || '—';
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
  if ((t === 'pacote' || t === 'mega') && !et) return 0;
  if (t === 'pacote' || t === 'mega') return 1;
  return 2;
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
    if (ex && ey) return ex.localeCompare(ey, 'pt-BR');
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
    return nome || desc || '—';
  }
  if (t === 'pacote') {
    const pac = (l.pacote || '').trim();
    const et = (l.etapa || '').trim();
    if (!et) {
      return pac ? `Pacote • ${pac}` : '—';
    }
    /* Com etapa: sempre incluir o pacote (antes só aparecia a etapa). */
    if (pac && et) {
      return `${pac} — ${et}`;
    }
    return et || pac || '—';
  }
  if (t === 'mega') {
    const pac = (l.pacote || '').trim();
    const et = (l.etapa || '').trim();
    if (!et) {
      return pac ? `Mega • ${pac}` : '—';
    }
    if (pac && et) {
      return `${pac} — ${et}`;
    }
    return et || pac || '—';
  }
  if (t === 'serviço') {
    const nome = (l.servicosRef || '').trim();
    const tam = (l.tamanho || '').trim();
    if (nome && tam) {
      return `${nome} — ${tam}`;
    }
    return nome || (l.descricao || '').trim() || '—';
  }
  const nomeServ = (l.servicosRef || '').trim();
  const tamServ = (l.tamanho || '').trim();
  if (nomeServ && tamServ) {
    return `${nomeServ} — ${tamServ}`;
  }
  return (l.descricao || '').trim() || '—';
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
 * Menor horário (HH:mm) entre linhas com `inicio` no dia — mesmo critério que edição em agenda-novo.
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
  for (const row of linhas) {
    const h = horaDeInicioParaDiaAtendimento(row.inicio, dia);
    const n = normalizarHoraHHmm(h);
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
