import type {
  AtendimentoItemCatalogo,
  AtendimentoListaItem,
} from '../models/api.models';

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
    return et || pac || '—';
  }
  if (t === 'mega') {
    const pac = (l.pacote || '').trim();
    const et = (l.etapa || '').trim();
    if (!et) {
      return pac || '—';
    }
    return et || pac || '—';
  }
  if (t === 'serviço' || t === 'servico') {
    const nome = (l.servicosRef || '').trim();
    const tam = (l.tamanho || '').trim();
    if (nome && tam) {
      return `${nome} — ${tam}`;
    }
    return nome || (l.descricao || '').trim() || '—';
  }
  if (t === 'cabelo') {
    const nome = (l.servicosRef || '').trim();
    const tam = (l.tamanho || '').trim();
    if (nome && tam) return `${nome} — ${tam}`;
    return nome || (l.descricao || '').trim() || '—';
  }
  const nomeServ = (l.servicosRef || '').trim();
  const tamServ = (l.tamanho || '').trim();
  if (nomeServ && tamServ) {
    return `${nomeServ} — ${tamServ}`;
  }
  return (l.descricao || '').trim() || '—';
}

/** Texto para um item da pivot `atendimento_itens` (ex.: lista em cards da agenda). */
export function resumoItemCatalogo(c: AtendimentoItemCatalogo): string {
  const q = Math.max(1, Number(c.quantidade) || 1);
  const qSuf = q > 1 ? ` ×${q}` : '';
  if (c.tipo === 'produto') {
    const nome = (c.produto_nome || '').trim();
    if (nome) return `${nome}${qSuf}`;
    const id = c.produto_id != null && Number(c.produto_id) > 0 ? c.produto_id : null;
    return id != null ? `Produto #${id}${qSuf}` : `Produto${qSuf}`;
  }
  const nome = (c.servico_nome || '').trim();
  const tam = (c.tamanho || '').trim();
  const base =
    nome ||
    (c.servico_id != null && Number(c.servico_id) > 0
      ? `Serviço #${c.servico_id}`
      : 'Serviço');
  const mid = tam ? `${base} — ${tam}` : base;
  return `${mid}${qSuf}`;
}

/** Entradas únicas da pivot do pedido (evita repetir o mesmo bloco em várias linhas). */
export function resumosItensCatalogoUnicos(
  itens: AtendimentoItemCatalogo[] | undefined | null,
): string[] {
  if (!itens?.length) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const it of itens) {
    const t = resumoItemCatalogo(it).trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}
