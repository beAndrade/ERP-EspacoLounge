/**
 * Regras alinhadas a apps-script/Code.gs (createAtendimento_ e auxiliares).
 */
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { Db } from '../db';
import { descricaoParaListaLinha } from '../lib/descricao-lista';
import { normalizeComissaoParaBD } from '../lib/normalize-comissao';
import {
  addMinutesToParts,
  formatSqlLocalDateTime,
  instantEmDateParaSqlLocalBrasil,
  isoInstantParaSqlLocalBrasil,
  normalizeSqlLocalString,
  parseSqlLocalDateTime,
  partesSqlLocalDeTextoSalao,
} from '../lib/sql-local-datetime';
import {
  atendimentoItens,
  atendimentos,
  atendimentosPedido,
  clientes,
  folha,
  pacotes,
  produtos,
  profissionais,
  regrasMega,
  servicos,
} from '../db/schema';
import {
  inserirReceitaConfirmacaoPagamento,
  slugCategoriaReceitaPredominante,
  totalLiquidoConfirmacao,
} from './finance-domain';

export type CreateAtendimentoPayload =
  | {
      tipo: 'Serviço';
      cliente_id: string;
      data: string;
      /** ID em `profissionais` (lista `/api/profissionais`). */
      profissional_id: number;
      servico_id: string;
      tamanho?: string;
      observacao?: string;
      /** Vários serviços no mesmo pedido (`id_atendimento`); cada entrada gera linha em `atendimentos` + item na pivot. */
      itens_servicos?: {
        servico_id: string;
        quantidade: number;
        profissional_id?: number | null;
        tamanho?: string;
      }[];
    }
  | {
      tipo: 'Mega';
      cliente_id: string;
      data: string;
      pacote: string;
      etapas: { etapa: string; profissional_id: number }[];
      observacao?: string;
    }
  | {
      tipo: 'Pacote';
      cliente_id: string;
      data: string;
      /** Linha de cobrança; opcional. */
      profissional_id?: number | null;
      pacote: string;
      etapas: { etapa: string; profissional_id: number }[];
      observacao?: string;
    }
  | {
      tipo: 'Produto';
      cliente_id: string;
      data: string;
      profissional_id?: number | null;
      produto: string;
      quantidade: number;
      observacao?: string;
      /** Quando `produtos.preco` está vazio no catálogo (obrigatório nesse caso). */
      preco_unitario?: number;
      /** Vários produtos no mesmo pedido; cada entrada gera linha em `atendimentos` + item na pivot. */
      itens_produtos?: {
        produto_id: number;
        quantidade: number;
        profissional_id?: number | null;
      }[];
    }
  | {
      tipo: 'Cabelo';
      cliente_id: string;
      data: string;
      profissional_id: number;
      valor: number;
      observacao?: string;
      detalhes_cabelo?: string;
    }
  | {
      servico_id: string;
      cliente_id: string;
      data: string;
      profissional_id?: number | null;
      tamanho?: string;
      observacao?: string;
    };

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function ymdCompactFromDataStr(dataStr: string): string {
  const s = dataStr.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    return s.slice(0, 4) + s.slice(5, 7) + s.slice(8, 10);
  }
  if (/^\d{1,2}\/\d{1,2}\/\d{4}/.test(s)) {
    const p = s.split('/');
    const d = parseInt(p[0], 10);
    const m = parseInt(p[1], 10);
    const y = parseInt(p[2], 10);
    return `${y}${pad2(m)}${pad2(d)}`;
  }
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;
  }
  const n = new Date();
  return ymdCompactFromDataStr(
    `${n.getFullYear()}-${pad2(n.getMonth() + 1)}-${pad2(n.getDate())}`,
  );
}

export function makeIdAtendimento(dataStr: string, clienteId: string): string {
  return `${ymdCompactFromDataStr(dataStr)}-${String(clienteId).trim()}`;
}

function parseDataSql(dataStr: string): string {
  const s = dataStr.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  if (/^\d{1,2}\/\d{1,2}\/\d{4}/.test(s)) {
    const p = s.split('/');
    const d = p[0].length === 1 ? `0${p[0]}` : p[0];
    const m = p[1].length === 1 ? `0${p[1]}` : p[1];
    return `${p[2]}-${m}-${d}`;
  }
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }
  return s.slice(0, 10);
}

function parsePercentCell(cell: unknown): number {
  if (cell === '' || cell == null) return 0;
  if (typeof cell === 'number') {
    if (cell > 1 && cell <= 100) return cell / 100;
    return cell <= 1 ? cell : cell / 100;
  }
  const s = String(cell)
    .replace(/\s/g, '')
    .replace('%', '')
    .replace(',', '.');
  const n = parseFloat(s);
  if (Number.isNaN(n)) return 0;
  if (n > 1 && n <= 100) return n / 100;
  return n;
}

/**
 * Número a partir de células BR (1.234,56) ou só com ponto decimal (358.00).
 * Não remover o ponto antes de saber o formato — "358.00" não pode virar "35800".
 */
function toNumberPt(v: unknown): number | null {
  if (v === '' || v == null) return null;
  if (typeof v === 'number') {
    return Number.isFinite(v) ? v : null;
  }
  let t = String(v)
    .replace(/R\$/gi, '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s/g, '')
    .trim();
  if (!t) return null;
  if (t.includes(',')) {
    t = t.replace(/\./g, '').replace(',', '.');
  }
  const n = parseFloat(t.replace(/[^\d.-]/g, ''));
  return Number.isNaN(n) ? null : n;
}

/** Texto fixo para coluna Desconto e recibo (pt-BR). */
function formatMoedaReciboPt(n: number): string {
  const r = Math.round(n * 100) / 100;
  return `R$ ${r.toFixed(2).replace('.', ',')}`;
}

function comissaoFromPercentAndValor(
  valorCell: unknown,
  pctCell: unknown,
): string {
  const vNum = toNumberPt(valorCell);
  if (vNum === null) return '';
  const pct = parsePercentCell(pctCell);
  if (pct <= 0) return '';
  return String(vNum * pct);
}

type ServicoRow = typeof servicos.$inferSelect;

function pickValorServico(row: ServicoRow, tamanho: string): string {
  const t = (tamanho || 'Curto').trim();
  const colMap: Record<string, keyof ServicoRow | undefined> = {
    Curto: 'precoCurto',
    Médio: 'precoMedio',
    'M/L': 'precoMedioLongo',
    Longo: 'precoLongo',
  };
  const key = colMap[t] ?? 'precoCurto';
  const v = row[key];
  if (v !== '' && v != null) return String(v);
  const vb = row.valorBase;
  return vb != null && vb !== '' ? String(vb) : '';
}

function tipoServicoCatalogo(srv: ServicoRow): 'Fixo' | 'Tamanho' | 'LegacyServico' | '' {
  const t = String(srv.tipo || '')
    .trim()
    .toLowerCase();
  if (t === 'fixo') return 'Fixo';
  if (t === 'tamanho') return 'Tamanho';
  if (t === 'serviço' || t === 'servico') return 'LegacyServico';
  return '';
}

/** Duração em minutos: Fixo → `duracao_minutos`; Tamanho/Legacy → coluna do tamanho ou padrão. */
function duracaoMinutosServicoCatalogo(
  srv: ServicoRow,
  cat: ReturnType<typeof tipoServicoCatalogo>,
  tamanhoParam: string,
  legacy: boolean,
): number {
  const base = srv.duracaoMinutos ?? 30;
  const fallback = Math.min(Math.max(base, 5), 24 * 60);
  if (legacy && !cat) return fallback;
  if (cat === 'Fixo' || cat === '') return fallback;
  const t = (tamanhoParam || 'Curto').trim();
  const colMap: Partial<Record<string, keyof ServicoRow>> = {
    Curto: 'duracaoCurto',
    Médio: 'duracaoMedio',
    'M/L': 'duracaoMedioLongo',
    Longo: 'duracaoLongo',
  };
  const col = colMap[t];
  if (col) {
    const v = srv[col];
    if (typeof v === 'number' && Number.isFinite(v) && v >= 5 && v <= 24 * 60) {
      return Math.round(v);
    }
  }
  return fallback;
}

function valorEComissaoServico(
  srv: ServicoRow,
  cat: ReturnType<typeof tipoServicoCatalogo>,
  tamanhoParam: string,
  legacy: boolean,
): { valor: string; comissao: string; tamanhoParaPlanilha: string } {
  if (legacy && !cat) {
    const valorL = pickValorServico(srv, tamanhoParam);
    return { valor: valorL, comissao: '', tamanhoParaPlanilha: tamanhoParam };
  }
  if (cat === 'Fixo') {
    const vb = srv.valorBase;
    const cf = srv.comissaoFixa ?? '';
    return {
      valor: vb != null && vb !== '' ? String(vb) : '',
      comissao: cf !== '' && cf != null ? String(cf) : '',
      tamanhoParaPlanilha: '',
    };
  }
  if (cat === 'Tamanho' || cat === 'LegacyServico') {
    const tam = (tamanhoParam || 'Curto').trim();
    const valorT = pickValorServico(srv, tam);
    const pctCol = srv.comissaoPct;
    let comT = '';
    if (pctCol !== undefined && pctCol !== null && pctCol !== '') {
      comT = comissaoFromPercentAndValor(valorT, pctCol);
    }
    return {
      valor: valorT,
      comissao: comT,
      tamanhoParaPlanilha: tam,
    };
  }
  throw new Error(
    `Tipo da linha Serviços não reconhecido (use Fixo ou Tamanho): ${String(srv.tipo || '')}`,
  );
}

async function findClienteNome(db: Db, id: string): Promise<string> {
  const [c] = await db
    .select()
    .from(clientes)
    .where(eq(clientes.idCliente, id))
    .limit(1);
  if (!c) throw new Error('Cliente não encontrado');
  const n = String(c.nomeExibido || '').trim();
  if (!n) throw new Error(`Cliente sem nome exibido: ${id}`);
  return n;
}

async function readServicoRow(db: Db, lineNum: number): Promise<ServicoRow> {
  const [r] = await db
    .select()
    .from(servicos)
    .where(eq(servicos.id, lineNum))
    .limit(1);
  if (!r) throw new Error(`Linha inválida na aba Serviços: ${lineNum}`);
  return r;
}

function duracaoCatalogoMin(d: number | null | undefined): number {
  const n =
    d == null || !Number.isFinite(Number(d)) ? 30 : Math.round(Number(d));
  return Math.max(5, Math.min(24 * 60, n));
}

/** Etapa seguinte começa quando a anterior termina (`fimAnterior` = início desta etapa). */
function slotEncadeadoAposFim(
  fimAnterior: string,
  durMin: number,
): { inicio: string; fim: string } {
  const p = parseSqlLocalDateTime(fimAnterior);
  if (!p) {
    throw new Error('Data/hora inválida ao encadear etapas Mega/Pacote');
  }
  const inicio = fimAnterior;
  const dm = duracaoCatalogoMin(durMin);
  const fim = formatSqlLocalDateTime(addMinutesToParts(p, dm));
  return { inicio, fim };
}

async function findPacoteIdPorNome(
  db: Db,
  nome: string,
): Promise<number | null> {
  const rows = await db
    .select({ id: pacotes.id })
    .from(pacotes)
    .where(eq(pacotes.pacote, nome.trim()))
    .limit(1);
  const id = rows[0]?.id;
  return id != null && Number(id) > 0 ? Number(id) : null;
}

async function findRegraMega(
  db: Db,
  pacote: string,
  etapa: string,
): Promise<{ id: number; valor: string; comissao: string; duracaoMinutos: number }> {
  const sp = pacote.trim();
  const se = etapa.trim();
  const rows = await db
    .select()
    .from(regrasMega)
    .where(
      and(eq(regrasMega.pacote, sp), eq(regrasMega.etapa, se)),
    );
  const r = rows[0];
  if (!r) {
    throw new Error(
      `Combinação Pacote/Etapa não encontrada em Regras Mega: "${sp}" / "${se}"`,
    );
  }
  return {
    id: r.id,
    valor: r.valor != null ? String(r.valor) : '',
    comissao: r.comissao != null ? String(r.comissao) : '',
    duracaoMinutos: duracaoCatalogoMin(r.duracaoMinutos as number | null),
  };
}

async function findPacoteCatalogo(
  db: Db,
  nome: string,
): Promise<{
  id: number;
  preco: string | null;
} | null> {
  const rows = await db
    .select()
    .from(pacotes)
    .where(eq(pacotes.pacote, nome.trim()));
  const r = rows[0];
  if (!r) return null;
  const preco = r.precoPacote;
  return {
    id: r.id,
    preco: preco != null && preco !== '' ? String(preco) : null,
  };
}

async function findProdutoPreco(db: Db, nome: string): Promise<string | null> {
  const rows = await db
    .select()
    .from(produtos)
    .where(eq(produtos.produto, nome.trim()));
  const p = rows[0]?.preco;
  return p != null && p !== '' ? String(p) : null;
}

async function assertProfissionalIdExists(db: Db, id: number): Promise<void> {
  const [r] = await db
    .select({ id: profissionais.id })
    .from(profissionais)
    .where(eq(profissionais.id, id))
    .limit(1);
  if (!r) {
    throw new Error(`profissional_id inválido: ${id} não existe em profissionais`);
  }
}

async function ensurePedidoHeader(
  db: Db,
  idAtendimento: string,
  idCliente: string,
): Promise<void> {
  await db
    .insert(atendimentosPedido)
    .values({
      idAtendimento,
      idCliente: idCliente.trim(),
    })
    .onConflictDoNothing();
}

async function insertPivotServico(
  db: Db,
  o: {
    idAtendimento: string;
    servicoId: number;
    quantidade: number;
    profissionalId: number | null;
    tamanho: string | null;
  },
): Promise<void> {
  const tam = o.tamanho && o.tamanho.trim() ? o.tamanho.trim() : null;
  await db.insert(atendimentoItens).values({
    idAtendimento: o.idAtendimento,
    tipo: 'servico',
    servicoId: o.servicoId,
    produtoId: null,
    quantidade: o.quantidade,
    profissionalId: o.profissionalId,
    tamanho: tam,
    pacote: null,
    etapa: null,
    detalhes: null,
  });
}

async function insertPivotProduto(
  db: Db,
  o: {
    idAtendimento: string;
    produtoId: number;
    quantidade: number;
    profissionalId: number | null;
  },
): Promise<void> {
  await db.insert(atendimentoItens).values({
    idAtendimento: o.idAtendimento,
    tipo: 'produto',
    servicoId: null,
    produtoId: o.produtoId,
    quantidade: o.quantidade,
    profissionalId: o.profissionalId,
    tamanho: null,
    pacote: null,
    etapa: null,
    detalhes: null,
  });
}

async function insertPivotMega(
  db: Db,
  o: {
    idAtendimento: string;
    pacote: string;
    etapa: string;
    profissionalId: number | null;
    regraMegaId: number;
    pacoteCatalogoId?: number | null;
  },
): Promise<void> {
  const pac = o.pacote.trim();
  const et = o.etapa.trim();
  if (!pac || !et) return;
  await db.insert(atendimentoItens).values({
    idAtendimento: o.idAtendimento,
    tipo: 'mega',
    servicoId: null,
    produtoId: null,
    quantidade: 1,
    profissionalId: o.profissionalId,
    tamanho: null,
    pacote: pac,
    etapa: et,
    regraMegaId: o.regraMegaId,
    pacoteId: o.pacoteCatalogoId ?? null,
    detalhes: null,
  });
}

/** Cabeça do pacote (etapa vazia) ou linha de etapa. */
async function insertPivotPacote(
  db: Db,
  o: {
    idAtendimento: string;
    pacote: string;
    etapa: string;
    profissionalId: number | null;
    pacoteCatalogoId: number;
    regraMegaId?: number | null;
  },
): Promise<void> {
  const pac = o.pacote.trim();
  if (!pac) return;
  const et = o.etapa.trim();
  await db.insert(atendimentoItens).values({
    idAtendimento: o.idAtendimento,
    tipo: 'pacote',
    servicoId: null,
    produtoId: null,
    quantidade: 1,
    profissionalId: o.profissionalId,
    tamanho: null,
    pacote: pac,
    etapa: et.length > 0 ? et : null,
    regraMegaId: o.regraMegaId ?? null,
    pacoteId: o.pacoteCatalogoId,
    detalhes: null,
  });
}

async function insertPivotCabelo(
  db: Db,
  o: {
    idAtendimento: string;
    detalhes: string | null;
    profissionalId: number | null;
  },
): Promise<void> {
  const d = (o.detalhes || '').trim();
  await db.insert(atendimentoItens).values({
    idAtendimento: o.idAtendimento,
    tipo: 'cabelo',
    servicoId: null,
    produtoId: null,
    quantidade: 1,
    profissionalId: o.profissionalId,
    tamanho: null,
    pacote: null,
    etapa: null,
    detalhes: d.length > 0 ? d : null,
  });
}

async function findProdutoIdPorNome(db: Db, nome: string): Promise<number> {
  const rows = await db
    .select({ id: produtos.id })
    .from(produtos)
    .where(eq(produtos.produto, nome.trim()))
    .limit(1);
  const id = rows[0]?.id;
  if (id == null) throw new Error(`Produto não encontrado: "${nome}"`);
  return id;
}

async function readProdutoRowPorId(
  db: Db,
  produtoId: number,
): Promise<typeof produtos.$inferSelect> {
  const [r] = await db
    .select()
    .from(produtos)
    .where(eq(produtos.id, produtoId))
    .limit(1);
  if (!r) throw new Error(`produto_id inválido: ${produtoId}`);
  return r;
}

/** Evita violar índice único (`servico_id` + `tamanho` por pedido) ao fundir linhas iguais. */
function mergeItensServicoNorm(
  itens: {
    servicoLine: number;
    quantidade: number;
    profissional_id?: unknown;
    tamanho?: string;
  }[],
): typeof itens {
  const map = new Map<
    string,
    {
      servicoLine: number;
      quantidade: number;
      profissional_id?: unknown;
      tamanho?: string;
    }
  >();
  for (const it of itens) {
    const tam = String(it.tamanho || '').trim();
    const key = `${it.servicoLine}\t${tam}`;
    const cur = map.get(key);
    if (!cur) {
      map.set(key, {
        servicoLine: it.servicoLine,
        quantidade: it.quantidade,
        profissional_id: it.profissional_id,
        tamanho: tam || undefined,
      });
    } else {
      cur.quantidade += it.quantidade;
      if (
        (cur.profissional_id === undefined || cur.profissional_id === null) &&
        it.profissional_id != null &&
        it.profissional_id !== ''
      ) {
        cur.profissional_id = it.profissional_id;
      }
    }
  }
  return [...map.values()];
}

function mergeItensProdutoNorm(
  itens: {
    produtoId: number;
    quantidade: number;
    profissional_id?: unknown;
  }[],
): typeof itens {
  const map = new Map<number, (typeof itens)[0]>();
  for (const it of itens) {
    const cur = map.get(it.produtoId);
    if (!cur) {
      map.set(it.produtoId, { ...it });
    } else {
      cur.quantidade += it.quantidade;
      if (
        (cur.profissional_id === undefined || cur.profissional_id === null) &&
        it.profissional_id != null &&
        it.profissional_id !== ''
      ) {
        cur.profissional_id = it.profissional_id;
      }
    }
  }
  return [...map.values()];
}

/**
 * Resolve `profissionais.id`; aceita legado `folha.id` se `folha.profissional_id` estiver preenchido.
 */
async function resolveProfissionalIdToInt(
  db: Db,
  opts: { profissional_id?: unknown; profissional?: unknown },
  required: boolean,
): Promise<number | null> {
  const rawId = opts.profissional_id;
  if (rawId != null && rawId !== '') {
    const n =
      typeof rawId === 'number' && Number.isFinite(rawId)
        ? Math.trunc(rawId)
        : parseInt(String(rawId).trim(), 10);
    if (!Number.isNaN(n) && n > 0) {
      const [pr] = await db
        .select({ id: profissionais.id })
        .from(profissionais)
        .where(eq(profissionais.id, n))
        .limit(1);
      if (pr) return n;
      const [fh] = await db
        .select({ pid: folha.profissionalId })
        .from(folha)
        .where(eq(folha.id, n))
        .limit(1);
      if (fh?.pid != null) {
        await assertProfissionalIdExists(db, fh.pid);
        return fh.pid;
      }
      if (required) throw new Error('profissional_id inválido');
      return null;
    }
    if (required) throw new Error('profissional_id inválido');
  }
  const nome = String(opts.profissional ?? '').trim();
  if (!nome) {
    if (required) {
      throw new Error('Profissional é obrigatório (profissional_id de /api/profissionais)');
    }
    return null;
  }
  const rows = await db
    .select({ id: profissionais.id, nome: profissionais.nome })
    .from(profissionais);
  for (const row of rows) {
    const t = String(row.nome || '').trim();
    if (t === nome) {
      return row.id;
    }
  }
  if (required) {
    throw new Error(
      `Profissional "${nome}" não encontrado (use profissional_id de /api/profissionais)`,
    );
  }
  return null;
}

function parseInicioFimOpcional(
  inicioRaw: unknown,
  fimRaw: unknown,
  /** Quando só `inicio` vem preenchido (minutos). Padrão 30 = compatível com fluxos antigos. */
  duracaoSeFimAusenteMin = 30,
): { inicio: string | null; fim: string | null } {
  const parseOne = (v: unknown): string | null => {
    if (v === undefined || v === null || v === '') return null;
    if (v instanceof Date) {
      return instantEmDateParaSqlLocalBrasil(v);
    }
    const s = String(v).trim();
    if (!s) return null;
    const norm = normalizeSqlLocalString(s);
    if (norm) return norm;
    if (/T/i.test(s) && (s.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(s))) {
      return isoInstantParaSqlLocalBrasil(s);
    }
    return null;
  };
  let inicio = parseOne(inicioRaw);
  let fim = parseOne(fimRaw);
  if (inicio && !fim) {
    const p = parseSqlLocalDateTime(inicio);
    if (p) {
      const dm = Math.max(
        5,
        Math.min(24 * 60, Math.round(duracaoSeFimAusenteMin)),
      );
      fim = formatSqlLocalDateTime(addMinutesToParts(p, dm));
    }
  }
  return { inicio, fim };
}

async function appendAtendimentoLinha(
  db: Db,
  o: {
    idAt: string;
    dataStr: string;
    clienteId: string;
    nomeCliente: string;
    tipo: string;
    pacote: string;
    etapa: string;
    produto: string;
    servicos: string;
    tamanho: string;
    profissionalId: number | null;
    valor: string;
    valorManual?: string;
    comissao: string;
    descricao: string;
    /** Espelha texto em **Descrição Manual** (planilha) quando distinto de `descricao`. */
    descricaoManual?: string;
    inicio?: string | null;
    fim?: string | null;
  },
): Promise<void> {
  const dataSql = parseDataSql(o.dataStr);
  await db.insert(atendimentos).values({
    idAtendimento: o.idAt,
    data: dataSql,
    inicio: o.inicio ?? null,
    fim: o.fim ?? null,
    idCliente: o.clienteId,
    nomeCliente: o.nomeCliente,
    tipo: o.tipo,
    pacote: o.pacote,
    etapa: o.etapa,
    produto: o.produto,
    servicos: o.servicos,
    tamanho: o.tamanho,
    profissionalId: o.profissionalId,
    valor: o.valor,
    valorManual: o.valorManual ?? '',
    comissao: normalizeComissaoParaBD(o.comissao),
    desconto: '',
    descricao: o.descricao,
    descricaoManual: o.descricaoManual ?? '',
    custo: '',
    lucro: '',
  });
}

export async function createAtendimento(
  db: Db,
  p: CreateAtendimentoPayload,
): Promise<{
  id: string;
  linhas: number;
  data: string;
  cliente_id: string;
  nomeCliente: string;
}> {
  const tipoRaw = 'tipo' in p ? String(p.tipo || '').trim() : '';
  if (!tipoRaw && 'servico_id' in p && p.servico_id) {
    return createAtendimentoServico(db, p, true);
  }
  if (!tipoRaw) {
    throw new Error(
      'tipo é obrigatório (ex.: Serviço, Mega, Pacote, Produto, Cabelo)',
    );
  }
  switch (tipoRaw) {
    case 'Serviço':
      return createAtendimentoServico(db, p as Extract<CreateAtendimentoPayload, { tipo: 'Serviço' }>, false);
    case 'Mega':
      return createAtendimentoMega(db, p as Extract<CreateAtendimentoPayload, { tipo: 'Mega' }>);
    case 'Pacote':
      return createAtendimentoPacote(db, p as Extract<CreateAtendimentoPayload, { tipo: 'Pacote' }>);
    case 'Produto':
      return createAtendimentoProduto(db, p as Extract<CreateAtendimentoPayload, { tipo: 'Produto' }>);
    case 'Cabelo':
      return createAtendimentoCabelo(db, p as Extract<CreateAtendimentoPayload, { tipo: 'Cabelo' }>);
    default:
      throw new Error(`Tipo desconhecido: ${tipoRaw}`);
  }
}

async function createAtendimentoServico(
  db: Db,
  p: CreateAtendimentoPayload & { servico_id?: string },
  legacy: boolean,
): Promise<{
  id: string;
  linhas: number;
  data: string;
  cliente_id: string;
  nomeCliente: string;
}> {
  const clienteId = String(p.cliente_id || '').trim();
  const dataStr = String(p.data || '').trim();
  if (!clienteId || !dataStr) {
    throw new Error('cliente_id e data são obrigatórios');
  }
  const rec = p as Record<string, unknown>;
  const nomeCliente = await findClienteNome(db, clienteId);
  const idAt = makeIdAtendimento(dataStr, clienteId);
  const obs = String('observacao' in p ? p.observacao || '' : '').trim();

  type ItemRec = {
    servico_id?: unknown;
    quantidade?: unknown;
    profissional_id?: unknown;
    tamanho?: unknown;
  };

  const rawItens = rec['itens_servicos'];
  const fromArray = Array.isArray(rawItens) && rawItens.length > 0;

  const itensNorm: {
    servicoLine: number;
    quantidade: number;
    profissional_id?: unknown;
    tamanho?: string;
  }[] = [];

  if (fromArray) {
    for (const it of rawItens as ItemRec[]) {
      const servicoLine = parseInt(String(it.servico_id ?? ''), 10);
      const q = Number(it.quantidade);
      if (!servicoLine || Number.isNaN(q) || q <= 0) {
        throw new Error(
          'Cada item em itens_servicos exige servico_id (id na aba Serviços) e quantidade > 0',
        );
      }
      itensNorm.push({
        servicoLine,
        quantidade: Math.trunc(q),
        profissional_id: it.profissional_id,
        tamanho: it.tamanho != null ? String(it.tamanho) : undefined,
      });
    }
    const merged = mergeItensServicoNorm(itensNorm);
    itensNorm.length = 0;
    itensNorm.push(...merged);
  } else {
    const linhaServico = parseInt(String(p.servico_id || ''), 10);
    if (!linhaServico) {
      throw new Error(
        'cliente_id, servico_id (id na aba Serviços) e data são obrigatórios, ou envie itens_servicos',
      );
    }
    itensNorm.push({
      servicoLine: linhaServico,
      quantidade: 1,
      profissional_id: rec['profissional_id'],
      tamanho: 'tamanho' in p ? String(p.tamanho || '') : undefined,
    });
  }

  const bodyProf = await resolveProfissionalIdToInt(
    db,
    {
      profissional_id: rec['profissional_id'],
      profissional: rec['profissional'],
    },
    false,
  );
  if (!legacy && !fromArray && bodyProf == null) {
    throw new Error('Profissional é obrigatório (profissional_id)');
  }

  await ensurePedidoHeader(db, idAt, clienteId);

  let linhas = 0;
  let primeira = true;

  for (const it of itensNorm) {
    const srv = await readServicoRow(db, it.servicoLine);
    const nomeServico = srv.servico != null ? String(srv.servico) : '';
    const cat = tipoServicoCatalogo(srv);
    if (!legacy && !cat) {
      throw new Error(
        `Tipo da linha Serviços não reconhecido (use Fixo ou Tamanho): ${String(srv.tipo || '')}`,
      );
    }
    let tamanhoParam = String(it.tamanho || '').trim();
    if (!legacy && cat === 'Tamanho' && !tamanhoParam) {
      tamanhoParam = 'Curto';
    }
    const vc = valorEComissaoServico(
      srv,
      cat,
      tamanhoParam || 'Curto',
      legacy,
    );

    const itemProf = await resolveProfissionalIdToInt(
      db,
      { profissional_id: it.profissional_id, profissional: undefined },
      false,
    );
    const profissionalId = itemProf ?? bodyProf;
    if (profissionalId == null && !legacy) {
      throw new Error(
        'Profissional é obrigatório (profissional_id no item ou no corpo)',
      );
    }

    const qtd = it.quantidade;
    const vNum = toNumberPt(vc.valor);
    const cNum = toNumberPt(vc.comissao);
    let valorLinha = vc.valor;
    let comissaoLinha = vc.comissao;
    if (qtd > 1) {
      if (vNum != null) valorLinha = String(vNum * qtd);
      if (cNum != null) comissaoLinha = String(cNum * qtd);
    }

    const durForLine = duracaoMinutosServicoCatalogo(
      srv,
      cat,
      tamanhoParam || 'Curto',
      legacy,
    );
    let inicioLinha: string | null = null;
    let fimLinha: string | null = null;
    if (primeira) {
      const slot = parseInicioFimOpcional(
        rec['inicio'],
        rec['fim'],
        durForLine,
      );
      inicioLinha = slot.inicio;
      if (inicioLinha) {
        const pIni = parseSqlLocalDateTime(inicioLinha);
        fimLinha = pIni
          ? formatSqlLocalDateTime(addMinutesToParts(pIni, durForLine))
          : slot.fim;
      } else {
        fimLinha = slot.fim;
      }
    }

    await appendAtendimentoLinha(db, {
      idAt,
      dataStr,
      clienteId,
      nomeCliente,
      tipo: 'Serviço',
      pacote: '',
      etapa: '',
      produto: '',
      servicos: nomeServico,
      tamanho: vc.tamanhoParaPlanilha,
      profissionalId,
      valor: valorLinha,
      comissao: comissaoLinha,
      descricao: obs,
      inicio: inicioLinha,
      fim: fimLinha,
    });

    await insertPivotServico(db, {
      idAtendimento: idAt,
      servicoId: srv.id,
      quantidade: qtd,
      profissionalId,
      tamanho: vc.tamanhoParaPlanilha || null,
    });

    linhas += 1;
    primeira = false;
  }

  return {
    id: idAt,
    linhas,
    data: dataStr,
    cliente_id: clienteId,
    nomeCliente,
  };
}

async function createAtendimentoMega(
  db: Db,
  p: Extract<CreateAtendimentoPayload, { tipo: 'Mega' }>,
): Promise<{
  id: string;
  linhas: number;
  data: string;
  cliente_id: string;
  nomeCliente: string;
}> {
  const clienteId = String(p.cliente_id || '').trim();
  const dataStr = String(p.data || '').trim();
  const pacote = String(p.pacote || '').trim();
  if (!clienteId || !dataStr || !pacote) {
    throw new Error('cliente_id, data e pacote são obrigatórios para Mega');
  }
  const etapas = p.etapas || [];
  if (!etapas.length) {
    throw new Error('Inclua ao menos uma etapa para Mega');
  }
  const nomeCliente = await findClienteNome(db, clienteId);
  const idAt = makeIdAtendimento(dataStr, clienteId);
  await ensurePedidoHeader(db, idAt, clienteId);
  const obs = String(p.observacao || '').trim();
  const pacoteCatalogoId = await findPacoteIdPorNome(db, pacote);
  const pRec = p as Record<string, unknown>;
  let cursorFim: string | null = null;
  for (let idx = 0; idx < etapas.length; idx++) {
    const st = etapas[idx];
    const etapaNome = String(st.etapa || '').trim();
    const stRec = st as Record<string, unknown>;
    const profId = await resolveProfissionalIdToInt(
      db,
      {
        profissional_id: stRec['profissional_id'],
        profissional: stRec['profissional'],
      },
      true,
    );
    if (!etapaNome || profId == null) {
      throw new Error('Cada etapa exige etapa e profissional_id');
    }
    const regra = await findRegraMega(db, pacote, etapaNome);
    let iniLine: string | null = null;
    let fimLine: string | null = null;
    if (idx === 0) {
      const slot = parseInicioFimOpcional(
        pRec['inicio'],
        pRec['fim'],
        regra.duracaoMinutos,
      );
      iniLine = slot.inicio;
      fimLine = slot.fim;
      /**
       * O cliente costuma mandar `fim` = fim do slot da grelha (30 min), não a
       * duração da etapa em `regras_mega`. Etapas seguintes já usam o catálogo;
       * alinhar a 1.ª etapa ao mesmo critério.
       */
      const dm = duracaoCatalogoMin(regra.duracaoMinutos);
      if (iniLine) {
        const pp = partesSqlLocalDeTextoSalao(iniLine);
        if (pp) {
          fimLine = formatSqlLocalDateTime(addMinutesToParts(pp, dm));
          cursorFim = fimLine;
        }
      } else if (fimLine) {
        cursorFim = fimLine;
      }
    } else if (cursorFim) {
      const enc = slotEncadeadoAposFim(cursorFim, regra.duracaoMinutos);
      iniLine = enc.inicio;
      fimLine = enc.fim;
      cursorFim = fimLine;
    }
    await appendAtendimentoLinha(db, {
      idAt,
      dataStr,
      clienteId,
      nomeCliente,
      tipo: 'Mega',
      pacote,
      etapa: etapaNome,
      produto: '',
      servicos: '',
      tamanho: '',
      profissionalId: profId,
      valor: regra.valor,
      comissao: regra.comissao,
      descricao: obs,
      descricaoManual: obs,
      inicio: iniLine,
      fim: fimLine,
    });
    await insertPivotMega(db, {
      idAtendimento: idAt,
      pacote,
      etapa: etapaNome,
      profissionalId: profId,
      regraMegaId: regra.id,
      pacoteCatalogoId,
    });
  }
  return {
    id: idAt,
    linhas: etapas.length,
    data: dataStr,
    cliente_id: clienteId,
    nomeCliente,
  };
}

async function createAtendimentoPacote(
  db: Db,
  p: Extract<CreateAtendimentoPayload, { tipo: 'Pacote' }>,
): Promise<{
  id: string;
  linhas: number;
  data: string;
  cliente_id: string;
  nomeCliente: string;
}> {
  const clienteId = String(p.cliente_id || '').trim();
  const dataStr = String(p.data || '').trim();
  const pacote = String(p.pacote || '').trim();
  if (!clienteId || !dataStr || !pacote) {
    throw new Error('cliente_id, data e pacote são obrigatórios para Pacote');
  }
  const profCob = await resolveProfissionalIdToInt(
    db,
    {
      profissional_id: p.profissional_id,
      profissional: (p as Record<string, unknown>)['profissional'],
    },
    false,
  );
  const etapas = p.etapas || [];
  if (!etapas.length) {
    throw new Error('Inclua ao menos uma etapa realizada para Pacote');
  }
  const cat = await findPacoteCatalogo(db, pacote);
  if (cat === null || cat.preco === null) {
    throw new Error(`Pacote não encontrado na aba Pacotes: "${pacote}"`);
  }
  const nomeCliente = await findClienteNome(db, clienteId);
  const idAt = makeIdAtendimento(dataStr, clienteId);
  await ensurePedidoHeader(db, idAt, clienteId);
  const obs = String(p.observacao || '').trim();
  const pRec = p as Record<string, unknown>;
  /**
   * Cabeça de cobrança não ocupa o slot na grelha: horário escolhido aplica-se à
   * **primeira etapa** (serviço), como no Mega.
   */
  await appendAtendimentoLinha(db, {
    idAt,
    dataStr,
    clienteId,
    nomeCliente,
    tipo: 'Pacote',
    pacote,
    etapa: '',
    produto: '',
    servicos: '',
    tamanho: '',
    profissionalId: profCob,
    valor: cat.preco,
    comissao: '',
    descricao: obs,
    descricaoManual: obs,
    inicio: null,
    fim: null,
  });
  await insertPivotPacote(db, {
    idAtendimento: idAt,
    pacote,
    etapa: '',
    profissionalId: profCob,
    pacoteCatalogoId: cat.id,
    regraMegaId: null,
  });
  let cursorFim: string | null = null;
  for (let idx = 0; idx < etapas.length; idx++) {
    const st = etapas[idx];
    const etapaNome = String(st.etapa || '').trim();
    const stRec = st as Record<string, unknown>;
    const profId = await resolveProfissionalIdToInt(
      db,
      {
        profissional_id: stRec['profissional_id'],
        profissional: stRec['profissional'],
      },
      true,
    );
    if (!etapaNome || profId == null) {
      throw new Error('Cada etapa exige etapa e profissional_id');
    }
    const regra = await findRegraMega(db, pacote, etapaNome);
    let iniLine: string | null = null;
    let fimLine: string | null = null;
    if (idx === 0) {
      const slot = parseInicioFimOpcional(
        pRec['inicio'],
        pRec['fim'],
        regra.duracaoMinutos,
      );
      iniLine = slot.inicio;
      fimLine = slot.fim;
      const dm = duracaoCatalogoMin(regra.duracaoMinutos);
      if (iniLine) {
        const pp = partesSqlLocalDeTextoSalao(iniLine);
        if (pp) {
          fimLine = formatSqlLocalDateTime(addMinutesToParts(pp, dm));
        }
      }
      cursorFim = fimLine;
    } else if (cursorFim) {
      const enc = slotEncadeadoAposFim(cursorFim, regra.duracaoMinutos);
      iniLine = enc.inicio;
      fimLine = enc.fim;
      cursorFim = fimLine;
    }
    await appendAtendimentoLinha(db, {
      idAt,
      dataStr,
      clienteId,
      nomeCliente,
      tipo: 'Pacote',
      pacote,
      etapa: etapaNome,
      produto: '',
      servicos: '',
      tamanho: '',
      profissionalId: profId,
      valor: '0',
      comissao: regra.comissao,
      descricao: obs,
      descricaoManual: obs,
      inicio: iniLine,
      fim: fimLine,
    });
    await insertPivotPacote(db, {
      idAtendimento: idAt,
      pacote,
      etapa: etapaNome,
      profissionalId: profId,
      pacoteCatalogoId: cat.id,
      regraMegaId: regra.id,
    });
  }
  return {
    id: idAt,
    linhas: 1 + etapas.length,
    data: dataStr,
    cliente_id: clienteId,
    nomeCliente,
  };
}

async function createAtendimentoProduto(
  db: Db,
  p: Extract<CreateAtendimentoPayload, { tipo: 'Produto' }>,
): Promise<{
  id: string;
  linhas: number;
  data: string;
  cliente_id: string;
  nomeCliente: string;
}> {
  const clienteId = String(p.cliente_id || '').trim();
  const dataStr = String(p.data || '').trim();
  const rec = p as Record<string, unknown>;
  const nomeCliente = await findClienteNome(db, clienteId);
  const idAt = makeIdAtendimento(dataStr, clienteId);
  const slot = parseInicioFimOpcional(rec['inicio'], rec['fim']);
  const baseObs = String(p.observacao || '').trim();

  type ProdItem = {
    produtoId: number;
    quantidade: number;
    profissional_id?: unknown;
  };
  const rawProd = rec['itens_produtos'];
  const fromArray = Array.isArray(rawProd) && rawProd.length > 0;
  const itensNorm: ProdItem[] = [];

  if (fromArray) {
    for (const it of rawProd as { produto_id?: unknown; quantidade?: unknown; profissional_id?: unknown }[]) {
      const pid = parseInt(String(it.produto_id ?? ''), 10);
      const q = Number(it.quantidade);
      if (!pid || Number.isNaN(q) || q <= 0) {
        throw new Error(
          'Cada item em itens_produtos exige produto_id e quantidade > 0',
        );
      }
      itensNorm.push({
        produtoId: pid,
        quantidade: Math.trunc(q),
        profissional_id: it.profissional_id,
      });
    }
    const merged = mergeItensProdutoNorm(itensNorm);
    itensNorm.length = 0;
    itensNorm.push(...merged);
  } else {
    const nomeProd = String(p.produto || '').trim();
    if (!clienteId || !dataStr || !nomeProd) {
      throw new Error('cliente_id, data e produto são obrigatórios para Produto');
    }
    const q = Number(p.quantidade);
    if (Number.isNaN(q) || q <= 0) {
      throw new Error('quantidade deve ser um número maior que zero');
    }
    const produtoId = await findProdutoIdPorNome(db, nomeProd);
    itensNorm.push({
      produtoId,
      quantidade: q,
      profissional_id: rec['profissional_id'],
    });
  }

  if (!clienteId || !dataStr) {
    throw new Error('cliente_id e data são obrigatórios para Produto');
  }

  const bodyProf = await resolveProfissionalIdToInt(
    db,
    {
      profissional_id: p.profissional_id,
      profissional: rec['profissional'],
    },
    false,
  );

  await ensurePedidoHeader(db, idAt, clienteId);

  let linhas = 0;
  let primeira = true;
  for (const it of itensNorm) {
    const rowP = await readProdutoRowPorId(db, it.produtoId);
    const nomeProd = String(rowP.produto || '').trim();
    let unitNum = toNumberPt(rowP.preco);
    if (unitNum === null) {
      const mr = rec['preco_unitario'];
      if (mr !== undefined && mr !== null && mr !== '') {
        unitNum =
          typeof mr === 'number' && Number.isFinite(mr)
            ? mr
            : toNumberPt(String(mr));
      }
    }
    if (unitNum === null || unitNum < 0) {
      throw new Error(
        `Preço não disponível para o produto "${nomeProd}". Cadastre o preço na aba Produtos ou informe o preço unitário no agendamento.`,
      );
    }
    const qtd = it.quantidade;
    const valorTotal = unitNum * qtd;

    const itemProf = await resolveProfissionalIdToInt(
      db,
      { profissional_id: it.profissional_id, profissional: undefined },
      false,
    );
    const profissionalId = itemProf ?? bodyProf;

    const obsParts: string[] = [];
    if (baseObs) obsParts.push(baseObs);
    obsParts.push(`Qtd: ${String(qtd).replace('.', ',')}`);
    const obs = obsParts.join(' — ');

    await appendAtendimentoLinha(db, {
      idAt,
      dataStr,
      clienteId,
      nomeCliente,
      tipo: 'Produto',
      pacote: '',
      etapa: '',
      produto: nomeProd,
      servicos: '',
      tamanho: '',
      profissionalId,
      valor: String(valorTotal),
      comissao: '',
      descricao: obs,
      inicio: primeira ? slot.inicio : null,
      fim: primeira ? slot.fim : null,
    });
    await insertPivotProduto(db, {
      idAtendimento: idAt,
      produtoId: it.produtoId,
      quantidade: qtd,
      profissionalId,
    });
    linhas += 1;
    primeira = false;
  }

  return {
    id: idAt,
    linhas,
    data: dataStr,
    cliente_id: clienteId,
    nomeCliente,
  };
}

async function createAtendimentoCabelo(
  db: Db,
  p: Extract<CreateAtendimentoPayload, { tipo: 'Cabelo' }>,
): Promise<{
  id: string;
  linhas: number;
  data: string;
  cliente_id: string;
  nomeCliente: string;
}> {
  const clienteId = String(p.cliente_id || '').trim();
  const dataStr = String(p.data || '').trim();
  const profissionalId = await resolveProfissionalIdToInt(
    db,
    {
      profissional_id: p.profissional_id,
      profissional: (p as Record<string, unknown>)['profissional'],
    },
    true,
  );
  if (profissionalId == null) throw new Error('Profissional é obrigatório');
  if (!clienteId || !dataStr) {
    throw new Error('cliente_id e data são obrigatórios para Cabelo');
  }
  const valorNum = parseFloat(String(p.valor).replace(',', '.'));
  if (Number.isNaN(valorNum)) {
    throw new Error('valor é obrigatório e deve ser numérico para Cabelo');
  }
  const nomeCliente = await findClienteNome(db, clienteId);
  const idAt = makeIdAtendimento(dataStr, clienteId);
  await ensurePedidoHeader(db, idAt, clienteId);
  const det = String(p.detalhes_cabelo || '').trim();
  const baseObs = String(p.observacao || '').trim();
  const obsParts: string[] = [];
  if (det) obsParts.push(det);
  if (baseObs) obsParts.push(baseObs);
  const obs = obsParts.join(' — ');
  const slot = parseInicioFimOpcional(
    (p as Record<string, unknown>)['inicio'],
    (p as Record<string, unknown>)['fim'],
  );
  await appendAtendimentoLinha(db, {
    idAt,
    dataStr,
    clienteId,
    nomeCliente,
    tipo: 'Cabelo',
    pacote: '',
    etapa: '',
    produto: '',
    servicos: '',
    tamanho: '',
    profissionalId,
    valor: String(valorNum),
    comissao: '',
    descricao: obs,
    inicio: slot.inicio,
    fim: slot.fim,
  });
  await insertPivotCabelo(db, {
    idAtendimento: idAt,
    detalhes: obs,
    profissionalId,
  });
  return {
    id: idAt,
    linhas: 1,
    data: dataStr,
    cliente_id: clienteId,
    nomeCliente,
  };
}

function ymdFromAtendimentoDate(d: string | Date | null | undefined): string {
  if (d == null) return '';
  if (typeof d === 'string') return d.slice(0, 10);
  if (d instanceof Date) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }
  return '';
}

/** Resposta da lista: sempre `YYYY-MM-DD HH:mm:ss` (ou null), sem `Z`. */
function tsParaRespostaListagem(v: string | Date | null | undefined): string | null {
  if (v == null || v === '') return null;
  if (typeof v === 'string') {
    const t = v.trim();
    if (!t) return null;
    const norm = normalizeSqlLocalString(t);
    if (norm) return norm;
    return isoInstantParaSqlLocalBrasil(t);
  }
  if (v instanceof Date) {
    return instantEmDateParaSqlLocalBrasil(v);
  }
  return null;
}

export async function listAtendimentosRaw(
  db: Db,
  dataInicio?: string,
  dataFim?: string,
  idAtendimento?: string,
): Promise<Record<string, unknown>[]> {
  const rows = await db
    .select()
    .from(atendimentos)
    .orderBy(asc(atendimentos.data), asc(atendimentos.id));

  const idF = String(idAtendimento || '').trim();

  const filtered = rows.filter((a) => {
    if (idF && String(a.idAtendimento).trim() !== idF) return false;
    const ymd = ymdFromAtendimentoDate(a.data as string | Date | null);
    if (idF) return true;
    if (!dataInicio && !dataFim) return true;
    if (!ymd) return false;
    if (dataInicio && ymd < dataInicio) return false;
    if (dataFim && ymd > dataFim) return false;
    return true;
  });

  const profIds = Array.from(
    new Set(
      filtered
        .map((a) => a.profissionalId)
        .filter((x): x is number => x != null && Number(x) > 0),
    ),
  );
  const nomePorProfId = new Map<number, string>();
  if (profIds.length > 0) {
    const pr = await db
      .select({ id: profissionais.id, nome: profissionais.nome })
      .from(profissionais)
      .where(inArray(profissionais.id, profIds));
    for (const r of pr) {
      nomePorProfId.set(r.id, String(r.nome || '').trim());
    }
  }

  const idsAt = Array.from(
    new Set(
      filtered
        .map((a) => String(a.idAtendimento || '').trim())
        .filter((x) => x.length > 0),
    ),
  );
  const itensPorPedido = new Map<string, Record<string, unknown>[]>();
  if (idsAt.length > 0) {
    const itensRows = await db
      .select()
      .from(atendimentoItens)
      .where(inArray(atendimentoItens.idAtendimento, idsAt));
    for (const row of itensRows) {
      const k = String(row.idAtendimento || '').trim();
      const arr = itensPorPedido.get(k) ?? [];
      arr.push({
        tipo: row.tipo,
        servico_id: row.servicoId,
        produto_id: row.produtoId,
        quantidade: row.quantidade,
        profissional_id: row.profissionalId,
        tamanho: row.tamanho,
        pacote: row.pacote ?? null,
        etapa: row.etapa ?? null,
        detalhes: row.detalhes ?? null,
        regra_mega_id: row.regraMegaId ?? null,
        pacote_id: row.pacoteId ?? null,
      });
      itensPorPedido.set(k, arr);
    }
  }

  const primeiroRegistoPorIdAt = new Set<string>();

  return filtered.map((a) => {
    const dataStr = ymdFromAtendimentoDate(a.data as string | Date | null);
    const pid =
      a.profissionalId != null && Number(a.profissionalId) > 0
        ? Number(a.profissionalId)
        : null;
    const profNome = pid != null ? nomePorProfId.get(pid) ?? '' : '';
    const idAtKey = String(a.idAtendimento || '').trim();
    const catalogo =
      idAtKey && !primeiroRegistoPorIdAt.has(idAtKey)
        ? (primeiroRegistoPorIdAt.add(idAtKey),
          itensPorPedido.get(idAtKey) ?? [])
        : undefined;
    return {
      linha_id: a.id,
      'ID Atendimento': a.idAtendimento,
      Data: dataStr,
      inicio: tsParaRespostaListagem(a.inicio as Date | string | null),
      fim: tsParaRespostaListagem(a.fim as Date | string | null),
      'ID Cliente': a.idCliente,
      'Nome Cliente': a.nomeCliente,
      Tipo: a.tipo,
      Pacote: a.pacote,
      Etapa: a.etapa,
      Produto: a.produto,
      Serviços: a.servicos,
      Tamanho: a.tamanho,
      Profissional: profNome,
      profissional_id: pid,
      Valor: a.valor,
      'Valor Manual': a.valorManual,
      Comissão: a.comissao,
      Desconto: a.desconto,
      Descrição: descricaoParaListaLinha(a),
      'Descrição Manual': a.descricaoManual,
      Custo: a.custo,
      Lucro: a.lucro,
      cobranca_status: a.cobrancaStatus ?? null,
      pagamento_status: a.pagamentoStatus ?? null,
      /** Duplicado em camelCase para clientes que serializam JSON sem chaves com underscore. */
      pagamento_metodo: a.pagamentoMetodo ?? null,
      pagamentoMetodo: a.pagamentoMetodo ?? null,
      id: a.idAtendimento,
      ...(catalogo !== undefined
        ? {
            itens_catalogo: catalogo,
            itens: catalogo,
          }
        : {}),
    };
  });
}

/** Marca todas as linhas com o mesmo `ID Atendimento` como finalizadas; pagamento fica pendente. */
export async function finalizarCobrancaPorIdAtendimento(
  db: Db,
  idAtendimento: string,
  descontoRaw?: unknown,
): Promise<number> {
  const id = String(idAtendimento || '').trim();
  if (!id) throw new Error('id_atendimento é obrigatório');

  const rows = await db
    .select()
    .from(atendimentos)
    .where(eq(atendimentos.idAtendimento, id))
    .orderBy(asc(atendimentos.id));

  if (rows.length === 0) return 0;

  let descontoStr = '';
  const trimmed = String(descontoRaw ?? '').trim();
  if (trimmed) {
    const n = toNumberPt(trimmed);
    if (n === null || n < 0) {
      throw new Error(
        'Desconto inválido. Use valor em reais (ex.: 10 ou 10,50 ou R$ 10,00).',
      );
    }
    if (n > 0) {
      descontoStr = formatMoedaReciboPt(n);
    }
  }

  let atualizadas = 0;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const patch: {
      cobrancaStatus: string;
      pagamentoStatus: string;
      desconto: string;
      descricao?: string;
    } = {
      cobrancaStatus: 'finalizada',
      pagamentoStatus: 'pendente',
      desconto: descontoStr,
    };

    if (descontoStr && i === 0) {
      const baseDesc = String(r.descricao ?? '').trim();
      const suffix = `Desconto: ${descontoStr}`;
      if (!baseDesc.includes('Desconto:')) {
        patch.descricao = baseDesc ? `${baseDesc} — ${suffix}` : suffix;
      }
    }

    await db.update(atendimentos).set(patch).where(eq(atendimentos.id, r.id));
    atualizadas += 1;
  }

  return atualizadas;
}

/** Remove todas as linhas com o mesmo `ID Atendimento`. */
export async function excluirAtendimentoPorIdAtendimento(
  db: Db,
  idAtendimento: string,
): Promise<number> {
  const id = String(idAtendimento || '').trim();
  if (!id) throw new Error('id_atendimento é obrigatório');
  return await db.transaction(async (tx) => {
    await tx
      .delete(atendimentoItens)
      .where(eq(atendimentoItens.idAtendimento, id));
    const rows = await tx
      .delete(atendimentos)
      .where(eq(atendimentos.idAtendimento, id))
      .returning({ id: atendimentos.id });
    await tx
      .delete(atendimentosPedido)
      .where(eq(atendimentosPedido.idAtendimento, id));
    return rows.length;
  });
}

const METODOS_PAGAMENTO_OK = new Set(['Dinheiro', 'Pix', 'Cartão']);

export type ConfirmarPagamentoResult = {
  linhasAtualizadas: number;
  movimentacaoId: number | null;
};

/** Confirma pagamento em todas as linhas já finalizadas com o mesmo `ID Atendimento`. */
export async function confirmarPagamentoPorIdAtendimento(
  db: Db,
  idAtendimento: string,
  metodoPagamento?: string,
): Promise<ConfirmarPagamentoResult> {
  const id = String(idAtendimento || '').trim();
  if (!id) throw new Error('id_atendimento é obrigatório');
  const metodo = String(metodoPagamento || '').trim();
  if (!metodo) {
    throw new Error(
      'Método de pagamento é obrigatório (Dinheiro, Pix ou Cartão).',
    );
  }
  if (!METODOS_PAGAMENTO_OK.has(metodo)) {
    throw new Error('Método de pagamento inválido. Use Dinheiro, Pix ou Cartão.');
  }

  return await db.transaction(async (tx) => {
    const candidatas = await tx
      .select()
      .from(atendimentos)
      .where(
        and(
          eq(atendimentos.idAtendimento, id),
          eq(atendimentos.cobrancaStatus, 'finalizada'),
        ),
      )
      .orderBy(asc(atendimentos.id));

    if (candidatas.length === 0) {
      return { linhasAtualizadas: 0, movimentacaoId: null };
    }

    const updated = await tx
      .update(atendimentos)
      .set({
        pagamentoStatus: 'confirmado',
        pagamentoMetodo: metodo,
      })
      .where(
        and(
          eq(atendimentos.idAtendimento, id),
          eq(atendimentos.cobrancaStatus, 'finalizada'),
        ),
      )
      .returning({ id: atendimentos.id });

    let dataMov = ymdFromAtendimentoDate(
      candidatas[0]!.data as string | Date | null,
    );
    if (!dataMov) {
      const n = new Date();
      dataMov = `${n.getFullYear()}-${pad2(n.getMonth() + 1)}-${pad2(n.getDate())}`;
    }

    const total = totalLiquidoConfirmacao(candidatas);
    const slug = slugCategoriaReceitaPredominante(candidatas);
    const nomeCliente = String(candidatas[0]?.nomeCliente || '').trim();
    const descricao = `Confirmação pagamento ${id}${nomeCliente ? ` — ${nomeCliente}` : ''}`;

    let movimentacaoId: number | null = null;
    if (updated.length > 0 && total > 0) {
      movimentacaoId = await inserirReceitaConfirmacaoPagamento(
        tx as unknown as Db,
        {
          idAtendimento: id,
          dataMov,
          valorTotal: total,
          categoriaSlug: slug,
          metodoPagamento: metodo,
          descricao,
        },
      );
    }

    return {
      linhasAtualizadas: updated.length,
      movimentacaoId,
    };
  });
}
