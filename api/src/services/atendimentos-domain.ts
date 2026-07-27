/**
 * Regras alinhadas a apps-script/Code.gs (createAtendimento_ e auxiliares).
 */
import { and, asc, eq, inArray, max, sql } from 'drizzle-orm';
import type { Db } from '../db';
import { descricaoParaListaLinha } from '../lib/descricao-lista';
import { normalizeComissaoParaBD } from '../lib/normalize-comissao';
import { aplicarComissaoProfissionalNoValorServico } from './profissional-comissao-domain.js';
import { profissionalRecebeComissao } from './profissionais-domain';
import {
  addMinutesToParts,
  civilNaiveSalaoParaUtcMs,
  formatSqlLocalDateTime,
  instantEmDateParaSqlLocalBrasil,
  isoInstantParaSqlLocalBrasil,
  normalizeSqlLocalString,
  parseSqlLocalDateTime,
  partesSqlLocalDeTextoSalao,
  type SqlLocalParts,
} from '../lib/sql-local-datetime';
import {
  atendimentoItens,
  atendimentos,
  atendimentosPedido,
  clientes,
  comandaPagamentos,
  movimentacoes,
  folha,
  pacotes,
  pacotesQueratina,
  produtos,
  profissionais,
  regrasMega,
  regrasMegaQueratina,
  servicos,
} from '../db/schema';
import { darBaixaEstoqueDoPedido } from './estoque-domain';
import {
  formatMoedaReciboPt,
  inserirReceitaConfirmacaoPagamento,
  slugCategoriaReceitaPredominante,
  toNumberPt,
  totalLiquidoConfirmacao,
} from './finance-domain';
import {
  criarPagamentoComanda,
  getResumoComanda,
  getResumosPorAtendimento,
  sincronizarPagamentoStatusAtendimento,
} from './comanda-pagamentos-domain';
import { resolverPrecoUnitarioProduto } from './produtos-preco';
import { recalcularFolhaAposMudancaAtendimento } from './folha-domain';
import { registrarCreditoMovimentoClienteEmTx } from './clientes-credito-movimentos';

type RecorrenciaCriacaoOpcional = {
  id_recorrencia?: string;
  ordem_recorrencia?: number;
};
type AtendimentoIdCriacaoOpcional = {
  id_atendimento?: string;
};
type DescontoCriacaoOpcional = {
  desconto?: string;
};

export type CreateAtendimentoPayload = (
  | {
      tipo: 'Serviço';
      cliente_id: string;
      data: string;
      /** ID em `profissionais` (lista `/api/profissionais`). */
      profissional_id: number;
      servico_id: string;
      tamanho?: string;
      observacao?: string;
      /** Override do valor unitário (R$). Quando ausente, usa o catálogo. */
      valor_unitario?: number | string | null;
      /** Desconto aplicado ao item (R$). */
      desconto_item?: number | string | null;
      /** Vários serviços no mesmo pedido (`id_atendimento`); cada entrada gera linha em `atendimentos` + item na pivot. */
      itens_servicos?: {
        servico_id: string;
        quantidade: number;
        profissional_id?: number | null;
        tamanho?: string;
        /** Override do valor unitário (R$). Quando ausente, usa o catálogo. */
        valor_unitario?: number | string | null;
        /** Desconto aplicado ao item (R$). */
        desconto?: number | string | null;
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
      tipo: 'Pacote Adesivo+Queratina';
      cliente_id: string;
      data: string;
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
      /** Override do valor unitário do produto (R$). */
      valor_unitario?: number | string | null;
      /** Desconto aplicado ao item (R$). */
      desconto_item?: number | string | null;
      /** Vários produtos no mesmo pedido; cada entrada gera linha em `atendimentos` + item na pivot. */
      itens_produtos?: {
        produto_id: number;
        quantidade: number;
        profissional_id?: number | null;
        valor_unitario?: number | string | null;
        desconto?: number | string | null;
      }[];
    }
  | {
      tipo: 'Cabelo';
      cliente_id: string;
      data: string;
      profissional_id?: number | null;
      valor: number;
      observacao?: string;
      detalhes_cabelo?: string;
      /** Desconto aplicado ao item Cabelo (R$). */
      desconto_item?: number | string | null;
    }
  | {
      servico_id: string;
      cliente_id: string;
      data: string;
      profissional_id?: number | null;
      tamanho?: string;
      observacao?: string;
    }
) &
  RecorrenciaCriacaoOpcional &
  AtendimentoIdCriacaoOpcional &
  DescontoCriacaoOpcional;

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/**
 * Converte um valor monetário (número, string `"40,00"` ou `"40.00"`) em texto numérico
 * adequado para colunas `numeric(14,2)` no Drizzle, ou `null` quando vazio/inválido.
 * Valores negativos/NaN são tratados como `null`.
 */
function numericOrNull(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') {
    if (!Number.isFinite(v) || v < 0) return null;
    return v.toFixed(2);
  }
  let s = String(v).trim();
  /** Texto monetário opcional vindos do cliente (ex.: "R$ 10,50"). */
  s = s.replace(/^\s*R\$\s*/i, '').trim();
  if (!s) return null;
  const n = parseFloat(s.replace(/\./g, '').replace(',', '.'));
  if (Number.isNaN(n) || n < 0) {
    const direto = parseFloat(s);
    if (Number.isNaN(direto) || direto < 0) return null;
    return direto.toFixed(2);
  }
  return n.toFixed(2);
}

/** Mesma lógica de `numericOrNull`, devolvendo número (ou null). */
function parseMonetarioParaNumero(v: unknown): number | null {
  const txt = numericOrNull(v);
  if (txt === null) return null;
  const n = Number(txt);
  return Number.isFinite(n) ? n : null;
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

/**
 * ID alternativo quando já existe comanda **encerrada** com o id canónico
 * `data+cliente` no mesmo dia (evita colidir com o Caso B do plano).
 */
function makeIdAtendimentoOcorrencia(dataStr: string, clienteId: string): string {
  const ymd = ymdCompactFromDataStr(dataStr);
  const cli = String(clienteId || '')
    .trim()
    .replace(/\s+/g, '');
  const stamp = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${ymd}-${cli}-${stamp}${rand}`;
}

/**
 * Comparar `atendimentos.data` (date) com `YYYY-MM-DD` sem ambiguidades de driver.
 */
function sqlDataAtendimentoIgual(dataSql: string) {
  return sql`(${atendimentos.data})::text = ${dataSql}`;
}

/**
 * Novo id sem sufixo aleatório: `YYYYMMDD-idCliente` (ex.: `20260514-CL0005`).
 * Só gera sufixo se esse id canónico já existir no dia para o cliente (comanda
 * anterior já encerrada — ver {@link makeIdAtendimentoOcorrencia}).
 */
async function novoIdAtendimentoFallbackSemSufixoDesnecessario(
  db: Db,
  dataStr: string,
  clienteId: string,
): Promise<string> {
  const cid = String(clienteId ?? '').trim();
  if (!cid) {
    return makeIdAtendimentoOcorrencia(dataStr, clienteId);
  }
  const baseId = makeIdAtendimento(dataStr, cid);
  const dataSql = parseDataSql(dataStr);

  const [row] = await db
    .select({ one: atendimentos.id })
    .from(atendimentos)
    .where(
      and(
        eq(atendimentos.idCliente, cid),
        sqlDataAtendimentoIgual(dataSql),
        eq(atendimentos.idAtendimento, baseId),
      ),
    )
    .limit(1);

  if (!row) return baseId;
  return makeIdAtendimentoOcorrencia(dataStr, clienteId);
}

function readRecorrenciaMeta(
  p: CreateAtendimentoPayload,
): {
  idRecorrencia: string | null;
  ordemRecorrencia: number | null;
  modo: 'producao' | 'orcamento';
} {
  const rec = p as Record<string, unknown>;
  const idBruto = String(rec['id_recorrencia'] ?? '').trim();
  const ordemRaw = Number(rec['ordem_recorrencia']);
  const ordem =
    Number.isFinite(ordemRaw) && ordemRaw >= 1
      ? Math.trunc(ordemRaw)
      : null;
  const modoRaw = String(rec['modo'] ?? '')
    .trim()
    .toLowerCase();
  return {
    idRecorrencia: idBruto || null,
    ordemRecorrencia: ordem,
    modo: modoRaw === 'orcamento' ? 'orcamento' : 'producao',
  };
}

/**
 * Comanda ainda aberta (não finalizada) do mesmo cliente no mesmo dia.
 * Preferimos o id canónico `YYYYMMDD-cliente`; senão o menor id aberto.
 * Orçamentos não entram (e produção não reutiliza orçamento).
 */
async function idAtendimentoComandaAbertaMesmoDia(
  db: Db,
  dataStr: string,
  clienteId: string,
): Promise<string | null> {
  const cid = String(clienteId ?? '').trim();
  if (!cid) return null;
  const dataSql = parseDataSql(dataStr);

  const rows = await db
    .select({
      idAtendimento: atendimentos.idAtendimento,
      cobrancaStatus: atendimentos.cobrancaStatus,
    })
    .from(atendimentos)
    .where(
      and(
        eq(atendimentos.idCliente, cid),
        sqlDataAtendimentoIgual(dataSql),
      ),
    );

  /** id → true se existir pelo menos uma linha não finalizada. */
  const abertoPorId = new Map<string, boolean>();
  for (const r of rows) {
    const id = String(r.idAtendimento ?? '').trim();
    if (!id) continue;
    const finalizada =
      String(r.cobrancaStatus ?? '')
        .trim()
        .toLowerCase() === 'finalizada';
    if (!finalizada) abertoPorId.set(id, true);
    else if (!abertoPorId.has(id)) abertoPorId.set(id, false);
  }

  let abertos = [...abertoPorId.entries()]
    .filter(([, aberto]) => aberto)
    .map(([id]) => id);
  if (abertos.length === 0) return null;

  /** Exclui pedidos em modo orçamento. */
  const pedModos = await db
    .select({
      id: atendimentosPedido.idAtendimento,
      modo: atendimentosPedido.modo,
    })
    .from(atendimentosPedido)
    .where(inArray(atendimentosPedido.idAtendimento, abertos));
  const orcamentoIds = new Set(
    pedModos
      .filter((p) => String(p.modo) === 'orcamento')
      .map((p) => String(p.id).trim()),
  );
  abertos = abertos.filter((id) => !orcamentoIds.has(id));
  if (abertos.length === 0) return null;

  const baseId = makeIdAtendimento(dataStr, cid);
  if (abertos.includes(baseId)) return baseId;
  abertos.sort((a, b) => a.localeCompare(b));
  return abertos[0] ?? null;
}

async function resolveIdAtendimentoCriacao(
  db: Db,
  p: CreateAtendimentoPayload,
  dataStr: string,
  clienteId: string,
): Promise<string> {
  /**
   * 1) `id_atendimento` explícito (edição / «adicionar à comanda» / multi-POST).
   * 2) Comanda aberta do mesmo cliente no mesmo dia → reutiliza (vários
   *    profissionais / horários na grelha, um só `numero_comanda`).
   *    Orçamentos sempre geram id novo (salvo id explícito).
   * 3) Caso contrário, id canónico ou ocorrência se a canónica já estiver
   *    encerrada.
   */
  const idExpl = String((p as Record<string, unknown>)['id_atendimento'] ?? '').trim();
  if (idExpl) return idExpl;

  const modoMeta = readRecorrenciaMeta(p);
  if (modoMeta.modo === 'orcamento') {
    return makeIdAtendimentoOcorrencia(dataStr, clienteId);
  }

  const aberto = await idAtendimentoComandaAbertaMesmoDia(
    db,
    dataStr,
    clienteId,
  );
  if (aberto) return aberto;

  return novoIdAtendimentoFallbackSemSufixoDesnecessario(db, dataStr, clienteId);
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

/** Comissão R$ por faixa (`curto` / `medio` / `m_l` / `longo`); ignora `-`. */
function pickComissaoPorTamanho(row: ServicoRow, tamanho: string): string {
  const t = (tamanho || 'Curto').trim();
  const colMap: Record<string, keyof ServicoRow | undefined> = {
    Curto: 'curto',
    Médio: 'medio',
    'M/L': 'mL',
    Longo: 'longo',
  };
  const key = colMap[t] ?? 'curto';
  const v = row[key];
  if (v == null) return '';
  const s = String(v).trim();
  if (!s || s === '-' || s === '—') return '';
  return s;
}

function tipoServicoCatalogo(srv: ServicoRow): 'Fixo' | 'Tamanho' | 'LegacyServico' | '' {
  const t = String(srv.tipo || '')
    .trim()
    .toLowerCase();
  if (t === 'fixo') return 'Fixo';
  if (t === 'tamanho') return 'Tamanho';
  if (t === 'serviço' || t === 'servico') return 'LegacyServico';
  /** Legado sem `tipo`: inferir pelo preço preenchido. */
  if (!t) {
    const vb = srv.valorBase;
    if (vb != null && String(vb).trim() !== '') return 'Fixo';
    if (srv.precoCurto != null && String(srv.precoCurto).trim() !== '') {
      return 'Tamanho';
    }
  }
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
    let comT = pickComissaoPorTamanho(srv, tam);
    if (!comT) {
      const pctCol = srv.comissaoPct;
      if (pctCol !== undefined && pctCol !== null && pctCol !== '') {
        comT = comissaoFromPercentAndValor(valorT, pctCol);
      }
    }
    if (!comT) {
      const cf = srv.comissaoFixa;
      if (cf != null && String(cf).trim() !== '') comT = String(cf);
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

async function findRegraMegaQueratina(
  db: Db,
  pacote: string,
  etapa: string,
): Promise<{ id: number; valor: string; comissao: string; duracaoMinutos: number }> {
  const sp = pacote.trim();
  const se = etapa.trim();
  const rows = await db
    .select()
    .from(regrasMegaQueratina)
    .where(
      and(eq(regrasMegaQueratina.pacote, sp), eq(regrasMegaQueratina.etapa, se)),
    );
  const r = rows[0];
  if (!r) {
    throw new Error(
      `Combinação Pacote/Etapa não encontrada em Regras Mega Queratina: "${sp}" / "${se}"`,
    );
  }
  return {
    id: r.id,
    valor: r.valor != null ? String(r.valor) : '',
    comissao: r.comissao != null ? String(r.comissao) : '',
    duracaoMinutos: duracaoCatalogoMin(r.duracaoMinutos as number | null),
  };
}

async function findPacoteQueratinaCatalogo(
  db: Db,
  nome: string,
): Promise<{
  id: number;
  preco: string | null;
} | null> {
  const rows = await db
    .select()
    .from(pacotesQueratina)
    .where(eq(pacotesQueratina.pacote, nome.trim()));
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

async function assertProfissionalIdExists(
  db: Db,
  id: number,
  exigirAtivo = true,
): Promise<void> {
  const [r] = await db
    .select({ id: profissionais.id, ativo: profissionais.ativo })
    .from(profissionais)
    .where(eq(profissionais.id, id))
    .limit(1);
  if (!r) {
    throw new Error(`profissional_id inválido: ${id} não existe em profissionais`);
  }
  if (exigirAtivo && !r.ativo) {
    throw new Error(
      'Profissional está inativo; não pode ser usado em novos atendimentos',
    );
  }
}

/**
 * Próximo `#comanda` = MAX(existentes) + 1 (tabela vazia → 1).
 * Evita a sequência Postgres continuar a crescer após exclusões.
 */
async function allocNextNumeroComanda(db: Db): Promise<number> {
  const [row] = await db
    .select({ m: max(atendimentosPedido.numeroComanda) })
    .from(atendimentosPedido);
  const m = Number(row?.m ?? 0);
  return (Number.isFinite(m) && m > 0 ? m : 0) + 1;
}

/** Alinha a sequência ao MAX actual (próximo `nextval` = max+1; tabela vazia → 1). */
async function syncNumeroComandaSequence(db: Db): Promise<void> {
  /**
   * Postgres rejeita `setval(..., 0)` (MINVALUE da sequência é 1).
   * Vazia: setval(1, false) → próximo nextval = 1.
   * Com MAX=N: setval(N, true) → próximo nextval = N+1.
   */
  try {
    await db.execute(sql`
      SELECT setval(
        'atendimentos_pedido_numero_comanda_seq'::regclass,
        GREATEST(
          1,
          COALESCE((SELECT MAX(numero_comanda) FROM atendimentos_pedido), 0)
        ),
        (SELECT EXISTS (SELECT 1 FROM atendimentos_pedido LIMIT 1))
      )
    `);
  } catch (e) {
    console.error('[syncNumeroComandaSequence]', e);
  }
}

async function ensurePedidoHeader(
  db: Db,
  idAtendimento: string,
  idCliente: string,
  meta?: {
    idRecorrencia: string | null;
    ordemRecorrencia: number | null;
    modo?: 'producao' | 'orcamento';
  },
): Promise<void> {
  const [exist] = await db
    .select({ id: atendimentosPedido.idAtendimento })
    .from(atendimentosPedido)
    .where(eq(atendimentosPedido.idAtendimento, idAtendimento))
    .limit(1);
  if (exist) return;

  const modo = meta?.modo === 'orcamento' ? 'orcamento' : 'producao';
  const numeroComanda = await allocNextNumeroComanda(db);
  await db.insert(atendimentosPedido).values({
    idAtendimento,
    idCliente: idCliente.trim(),
    idRecorrencia: meta?.idRecorrencia ?? null,
    ordemRecorrencia: meta?.ordemRecorrencia ?? null,
    numeroComanda,
    modo,
    orcamentoStatus: modo === 'orcamento' ? 'rascunho' : null,
  });
  await syncNumeroComandaSequence(db);
}

async function insertPivotServico(
  db: Db,
  o: {
    idAtendimento: string;
    servicoId: number;
    quantidade: number;
    profissionalId: number | null;
    tamanho: string | null;
    valorUnitario?: number | null;
    desconto?: number | null;
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
    valorUnitario: numericOrNull(o.valorUnitario),
    desconto: numericOrNull(o.desconto),
  });
}

async function insertPivotProduto(
  db: Db,
  o: {
    idAtendimento: string;
    produtoId: number;
    quantidade: number;
    profissionalId: number | null;
    valorUnitario?: number | null;
    desconto?: number | null;
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
    valorUnitario: numericOrNull(o.valorUnitario),
    desconto: numericOrNull(o.desconto),
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

async function insertPivotPacoteQueratina(
  db: Db,
  o: {
    idAtendimento: string;
    pacote: string;
    etapa: string;
    profissionalId: number | null;
    pacoteQueratinaId: number;
    regraMegaQueratinaId?: number | null;
  },
): Promise<void> {
  const pac = o.pacote.trim();
  if (!pac) return;
  const et = o.etapa.trim();
  await db.insert(atendimentoItens).values({
    idAtendimento: o.idAtendimento,
    tipo: 'pacote_queratina',
    servicoId: null,
    produtoId: null,
    quantidade: 1,
    profissionalId: o.profissionalId,
    tamanho: null,
    pacote: pac,
    etapa: et.length > 0 ? et : null,
    regraMegaQueratinaId: o.regraMegaQueratinaId ?? null,
    pacoteQueratinaId: o.pacoteQueratinaId,
    detalhes: null,
  });
}

async function insertPivotCabelo(
  db: Db,
  o: {
    idAtendimento: string;
    detalhes: string | null;
    profissionalId: number | null;
    valorUnitario?: number | null;
    desconto?: number | null;
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
    valorUnitario: numericOrNull(o.valorUnitario),
    desconto: numericOrNull(o.desconto),
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
    valorUnitario: number | null;
    desconto: number | null;
  }[],
): typeof itens {
  const map = new Map<
    string,
    {
      servicoLine: number;
      quantidade: number;
      profissional_id?: unknown;
      tamanho?: string;
      valorUnitario: number | null;
      desconto: number | null;
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
        valorUnitario: it.valorUnitario ?? null,
        desconto: it.desconto ?? null,
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
      if ((cur.valorUnitario == null) && it.valorUnitario != null) {
        cur.valorUnitario = it.valorUnitario;
      }
      if (cur.desconto == null && it.desconto != null) {
        cur.desconto = it.desconto;
      } else if (cur.desconto != null && it.desconto != null) {
        cur.desconto = cur.desconto + it.desconto;
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
    valorUnitario: number | null;
    desconto: number | null;
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
      if (cur.valorUnitario == null && it.valorUnitario != null) {
        cur.valorUnitario = it.valorUnitario;
      }
      if (cur.desconto == null && it.desconto != null) {
        cur.desconto = it.desconto;
      } else if (cur.desconto != null && it.desconto != null) {
        cur.desconto = cur.desconto + it.desconto;
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
  exigirAtivo = true,
): Promise<number | null> {
  const rawId = opts.profissional_id;
  if (rawId != null && rawId !== '') {
    const n =
      typeof rawId === 'number' && Number.isFinite(rawId)
        ? Math.trunc(rawId)
        : parseInt(String(rawId).trim(), 10);
    if (!Number.isNaN(n) && n > 0) {
      const [pr] = await db
        .select({ id: profissionais.id, ativo: profissionais.ativo })
        .from(profissionais)
        .where(eq(profissionais.id, n))
        .limit(1);
      if (pr) {
        if (exigirAtivo && !pr.ativo) {
          throw new Error(
            'Profissional está inativo; não pode ser usado em novos atendimentos',
          );
        }
        return pr.id;
      }
      const [fh] = await db
        .select({ pid: folha.profissionalId })
        .from(folha)
        .where(eq(folha.id, n))
        .limit(1);
      if (fh?.pid != null) {
        await assertProfissionalIdExists(db, fh.pid, exigirAtivo);
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
    .select({ id: profissionais.id, nome: profissionais.nome, ativo: profissionais.ativo })
    .from(profissionais);
  for (const row of rows) {
    const t = String(row.nome || '').trim();
    if (t === nome) {
      if (exigirAtivo && !row.ativo) {
        throw new Error(
          `Profissional "${nome}" está inativo; não pode ser usado em novos atendimentos`,
        );
      }
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

function readAgendaCartaoMeta(p: unknown): {
  agendaStatus: string | null;
  agendaCor: string | null;
} {
  const rec = p as Record<string, unknown>;
  const st = rec['agenda_status'];
  const cr = rec['agenda_cor'];
  const agendaStatus =
    st != null && String(st).trim() ? String(st).trim() : null;
  const agendaCor =
    cr != null && String(cr).trim() ? String(cr).trim() : null;
  return { agendaStatus, agendaCor };
}

/**
 * Comanda walk-in (sem cartão na agenda) pode omitir `agenda_status` no payload;
 * a coluna na BD pode ser NOT NULL — usamos valor neutro (sem `inicio`/`fim` não aparece no hub).
 */
function agendaStatusParaGravacao(status: string | null | undefined): string {
  const s = status != null ? String(status).trim() : '';
  return s || 'confirmado';
}

function descontoCriacaoParaBD(v: unknown): string {
  const bruto = String(v ?? '').trim();
  if (!bruto) return '';
  const n = toNumberPt(bruto);
  if (n == null || n <= 0) return '';
  return formatMoedaReciboPt(n);
}

/**
 * Cliente Angular envia sobretudo `desconto_item` (número); `desconto` em texto é opcional.
 * A coluna planilha `atendimentos.desconto` deve refletir qualquer dos dois quando > 0.
 */
function descontoNumericoCabecaPayload(rec: Record<string, unknown>): number | null {
  const di = parseMonetarioParaNumero(rec['desconto_item']);
  if (di != null && di > 0) return di;
  const ds = parseMonetarioParaNumero(rec['desconto']);
  if (ds != null && ds > 0) return ds;
  return null;
}

function textoDescontoColunaAtendimento(
  itemDescontoNum: number | null,
  rec: Record<string, unknown>,
  fromArr: boolean,
): string {
  if (itemDescontoNum != null && itemDescontoNum > 0) {
    return formatMoedaReciboPt(itemDescontoNum);
  }
  if (!fromArr) {
    const cab = descontoNumericoCabecaPayload(rec);
    if (cab != null && cab > 0) return formatMoedaReciboPt(cab);
  }
  return '';
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
    /** Quantidade da linha (produto/serviço); omissão = 1. */
    quantidade?: number;
    descricao: string;
    /** Espelha texto em **Descrição Manual** (planilha) quando distinto de `descricao`. */
    descricaoManual?: string;
    inicio?: string | null;
    fim?: string | null;
    agendaStatus?: string | null;
    agendaCor?: string | null;
    desconto?: string;
  },
): Promise<void> {
  const dataSql = parseDataSql(o.dataStr);
  const qtdLinha =
    o.quantidade != null && Number.isFinite(o.quantidade) && o.quantidade > 0
      ? Math.trunc(o.quantidade)
      : 1;
  let comissaoLinha = o.comissao;
  if (o.profissionalId != null) {
    const recebe = await profissionalRecebeComissao(db, o.profissionalId);
    if (!recebe) comissaoLinha = '';
  }
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
    comissao: normalizeComissaoParaBD(comissaoLinha),
    quantidade: qtdLinha,
    desconto: descontoCriacaoParaBD(o.desconto),
    descricao: o.descricao,
    descricaoManual: o.descricaoManual ?? '',
    custo: '',
    lucro: '',
    agendaStatus: agendaStatusParaGravacao(o.agendaStatus),
    agendaCor: o.agendaCor?.trim() ? o.agendaCor.trim() : null,
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
    case 'Pacote Adesivo+Queratina':
    case 'Pacote Queratina':
      return createAtendimentoPacoteQueratina(
        db,
        p as Extract<CreateAtendimentoPayload, { tipo: 'Pacote Adesivo+Queratina' }>,
      );
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
  const idAt = await resolveIdAtendimentoCriacao(db, p, dataStr, clienteId);
  const recorrenciaMeta = readRecorrenciaMeta(p);
  const obs = String('observacao' in p ? p.observacao || '' : '').trim();

  type ItemRec = {
    servico_id?: unknown;
    quantidade?: unknown;
    profissional_id?: unknown;
    tamanho?: unknown;
    valor_unitario?: unknown;
    desconto?: unknown;
  };

  const rawItens = rec['itens_servicos'];
  const fromArray = Array.isArray(rawItens) && rawItens.length > 0;

  const itensNorm: {
    servicoLine: number;
    quantidade: number;
    profissional_id?: unknown;
    tamanho?: string;
    valorUnitario: number | null;
    desconto: number | null;
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
        valorUnitario: parseMonetarioParaNumero(it.valor_unitario),
        desconto: parseMonetarioParaNumero(it.desconto),
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
      valorUnitario: parseMonetarioParaNumero(rec['valor_unitario']),
      desconto:
        parseMonetarioParaNumero(rec['desconto_item']) ??
        parseMonetarioParaNumero(rec['desconto']),
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

  await ensurePedidoHeader(db, idAt, clienteId, recorrenciaMeta);

  const agCartao = readAgendaCartaoMeta(p);

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
    let vc = valorEComissaoServico(
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

    const comissaoOv = await aplicarComissaoProfissionalNoValorServico(
      db,
      profissionalId,
      srv.id,
      { valor: vc.valor, comissao: vc.comissao },
    );
    vc = { ...vc, valor: comissaoOv.valor, comissao: comissaoOv.comissao };

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
    const slotPedido = parseInicioFimOpcional(
      rec['inicio'],
      rec['fim'],
      durForLine,
    );
    if (primeira) {
      inicioLinha = slotPedido.inicio;
      if (inicioLinha) {
        const pIni = parseSqlLocalDateTime(inicioLinha);
        fimLinha = pIni
          ? formatSqlLocalDateTime(addMinutesToParts(pIni, durForLine))
          : slotPedido.fim;
      } else {
        fimLinha = slotPedido.fim;
      }
    } else if (slotPedido.inicio) {
      /** Mesmo slot do pedido em todas as linhas Serviço (ex.: vários itens no mesmo agendamento). */
      inicioLinha = slotPedido.inicio;
      const pIni = parseSqlLocalDateTime(inicioLinha);
      fimLinha = pIni
        ? formatSqlLocalDateTime(addMinutesToParts(pIni, durForLine))
        : slotPedido.fim;
    }

    /**
     * Quando o utilizador deixa o V.Unit em branco, persistimos o preço-base do
     * catálogo para esta linha (preserva a fonte exibida na comanda quando o
     * catálogo muda mais tarde).
     */
    const valorUnitarioParaPivot =
      it.valorUnitario != null
        ? it.valorUnitario
        : vNum != null
          ? vNum
          : null;
    const descontoPivotNum =
      it.desconto != null && it.desconto > 0
        ? it.desconto
        : !fromArray
          ? descontoNumericoCabecaPayload(rec)
          : null;
    const textoDescontoAtendimento =
      descontoPivotNum != null && descontoPivotNum > 0
        ? formatMoedaReciboPt(descontoPivotNum)
        : textoDescontoColunaAtendimento(it.desconto, rec, fromArray);

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
      quantidade: qtd,
      desconto: textoDescontoAtendimento,
      descricao: obs,
      inicio: inicioLinha,
      fim: fimLinha,
      ...agCartao,
    });

    await insertPivotServico(db, {
      idAtendimento: idAt,
      servicoId: srv.id,
      quantidade: qtd,
      profissionalId,
      tamanho: vc.tamanhoParaPlanilha || null,
      valorUnitario: valorUnitarioParaPivot,
      desconto: descontoPivotNum,
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
  const idAt = await resolveIdAtendimentoCriacao(db, p, dataStr, clienteId);
  const recorrenciaMeta = readRecorrenciaMeta(p);
  /** Mega: sem desconto por linha (apenas Serviço/Produto; desconto global na finalização da comanda). */
  const descontoLinha = '';
  await ensurePedidoHeader(db, idAt, clienteId, recorrenciaMeta);
  const obs = String(p.observacao || '').trim();
  const agCartao = readAgendaCartaoMeta(p);
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
      quantidade: 1,
      desconto: descontoLinha,
      descricao: obs,
      descricaoManual: obs,
      inicio: iniLine,
      fim: fimLine,
      ...agCartao,
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
  const idAt = await resolveIdAtendimentoCriacao(db, p, dataStr, clienteId);
  const recorrenciaMeta = readRecorrenciaMeta(p);
  /** Pacote: sem desconto por linha (igual Mega). */
  const descontoLinha = '';
  await ensurePedidoHeader(db, idAt, clienteId, recorrenciaMeta);
  const obs = String(p.observacao || '').trim();
  const agCartao = readAgendaCartaoMeta(p);
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
    quantidade: 1,
    desconto: descontoLinha,
    descricao: obs,
    descricaoManual: obs,
    inicio: null,
    fim: null,
    ...agCartao,
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
      quantidade: 1,
      desconto: descontoLinha,
      descricao: obs,
      descricaoManual: obs,
      inicio: iniLine,
      fim: fimLine,
      ...agCartao,
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

async function createAtendimentoPacoteQueratina(
  db: Db,
  p: Extract<CreateAtendimentoPayload, { tipo: 'Pacote Adesivo+Queratina' }>,
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
    throw new Error(
      'cliente_id, data e pacote são obrigatórios para Pacote Adesivo+Queratina',
    );
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
    throw new Error('Inclua ao menos uma etapa realizada para Pacote Adesivo+Queratina');
  }
  const cat = await findPacoteQueratinaCatalogo(db, pacote);
  if (cat === null || cat.preco === null) {
    throw new Error(`Pacote Adesivo+Queratina não encontrado: "${pacote}"`);
  }
  const nomeCliente = await findClienteNome(db, clienteId);
  const idAt = await resolveIdAtendimentoCriacao(db, p, dataStr, clienteId);
  const recorrenciaMeta = readRecorrenciaMeta(p);
  const descontoLinha = '';
  await ensurePedidoHeader(db, idAt, clienteId, recorrenciaMeta);
  const obs = String(p.observacao || '').trim();
  const agCartao = readAgendaCartaoMeta(p);
  const pRec = p as Record<string, unknown>;
  await appendAtendimentoLinha(db, {
    idAt,
    dataStr,
    clienteId,
    nomeCliente,
    tipo: 'Pacote Adesivo+Queratina',
    pacote,
    etapa: '',
    produto: '',
    servicos: '',
    tamanho: '',
    profissionalId: profCob,
    valor: cat.preco,
    comissao: '',
    quantidade: 1,
    desconto: descontoLinha,
    descricao: obs,
    descricaoManual: obs,
    inicio: null,
    fim: null,
    ...agCartao,
  });
  await insertPivotPacoteQueratina(db, {
    idAtendimento: idAt,
    pacote,
    etapa: '',
    profissionalId: profCob,
    pacoteQueratinaId: cat.id,
    regraMegaQueratinaId: null,
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
    const regra = await findRegraMegaQueratina(db, pacote, etapaNome);
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
      tipo: 'Pacote Adesivo+Queratina',
      pacote,
      etapa: etapaNome,
      produto: '',
      servicos: '',
      tamanho: '',
      profissionalId: profId,
      valor: '0',
      comissao: regra.comissao,
      quantidade: 1,
      desconto: descontoLinha,
      descricao: obs,
      descricaoManual: obs,
      inicio: iniLine,
      fim: fimLine,
      ...agCartao,
    });
    await insertPivotPacoteQueratina(db, {
      idAtendimento: idAt,
      pacote,
      etapa: etapaNome,
      profissionalId: profId,
      pacoteQueratinaId: cat.id,
      regraMegaQueratinaId: regra.id,
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
  const idAt = await resolveIdAtendimentoCriacao(db, p, dataStr, clienteId);
  const recorrenciaMeta = readRecorrenciaMeta(p);
  const slot = parseInicioFimOpcional(rec['inicio'], rec['fim']);
  const baseObs = String(p.observacao || '').trim();

  type ProdItem = {
    produtoId: number;
    quantidade: number;
    profissional_id?: unknown;
    valorUnitario: number | null;
    desconto: number | null;
  };
  const rawProd = rec['itens_produtos'];
  const fromArray = Array.isArray(rawProd) && rawProd.length > 0;
  const itensNorm: ProdItem[] = [];

  if (fromArray) {
    for (const it of rawProd as {
      produto_id?: unknown;
      quantidade?: unknown;
      profissional_id?: unknown;
      valor_unitario?: unknown;
      desconto?: unknown;
    }[]) {
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
        valorUnitario: parseMonetarioParaNumero(it.valor_unitario),
        desconto: parseMonetarioParaNumero(it.desconto),
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
      valorUnitario:
        parseMonetarioParaNumero(rec['valor_unitario']) ??
        parseMonetarioParaNumero(rec['preco_unitario']),
      desconto:
        parseMonetarioParaNumero(rec['desconto_item']) ??
        parseMonetarioParaNumero(rec['desconto']),
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

  await ensurePedidoHeader(db, idAt, clienteId, recorrenciaMeta);

  const agCartao = readAgendaCartaoMeta(p);

  let linhas = 0;
  for (const it of itensNorm) {
    const rowP = await readProdutoRowPorId(db, it.produtoId);
    const nomeProd = String(rowP.produto || '').trim();
    /**
     * Override por linha tem prioridade; senão fallback ao `preco_unitario` global
     * (compat. com criações antigas) ou ao catálogo (`produtos.preco`).
     */
    const unitNum =
      it.valorUnitario != null
        ? it.valorUnitario
        : resolverPrecoUnitarioProduto(rowP.preco, rec['preco_unitario']);
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

    const descontoPivotProd =
      it.desconto != null && it.desconto > 0
        ? it.desconto
        : !fromArray
          ? descontoNumericoCabecaPayload(rec)
          : null;
    const textoDescontoProd =
      descontoPivotProd != null && descontoPivotProd > 0
        ? formatMoedaReciboPt(descontoPivotProd)
        : textoDescontoColunaAtendimento(it.desconto, rec, fromArray);

    const obs = baseObs;

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
      quantidade: qtd,
      desconto: textoDescontoProd,
      descricao: obs,
      inicio: slot.inicio,
      fim: slot.fim,
      ...agCartao,
    });
    await insertPivotProduto(db, {
      idAtendimento: idAt,
      produtoId: it.produtoId,
      quantidade: qtd,
      profissionalId,
      valorUnitario: unitNum,
      desconto: descontoPivotProd,
    });
    linhas += 1;
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
    false,
  );
  if (!clienteId || !dataStr) {
    throw new Error('cliente_id e data são obrigatórios para Cabelo');
  }
  const valorNum = parseFloat(String(p.valor).replace(',', '.'));
  if (Number.isNaN(valorNum)) {
    throw new Error('valor é obrigatório e deve ser numérico para Cabelo');
  }
  const nomeCliente = await findClienteNome(db, clienteId);
  const idAt = await resolveIdAtendimentoCriacao(db, p, dataStr, clienteId);
  const recorrenciaMeta = readRecorrenciaMeta(p);
  const recP = p as Record<string, unknown>;
  const descontoCabeloNum = descontoNumericoCabecaPayload(recP);
  const descontoLinha =
    descontoCabeloNum != null && descontoCabeloNum > 0
      ? formatMoedaReciboPt(descontoCabeloNum)
      : '';
  await ensurePedidoHeader(db, idAt, clienteId, recorrenciaMeta);
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
  const agCartao = readAgendaCartaoMeta(p);
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
    quantidade: 1,
    desconto: descontoLinha,
    descricao: obs,
    inicio: slot.inicio,
    fim: slot.fim,
    ...agCartao,
  });
  await insertPivotCabelo(db, {
    idAtendimento: idAt,
    detalhes: obs,
    profissionalId,
    valorUnitario: valorNum,
    desconto: descontoCabeloNum,
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
  somenteComHorario = false,
  /** `producao` (default) exclui orçamentos; `orcamento` só orçamentos; `todos` sem filtro. */
  modoPedido: 'producao' | 'orcamento' | 'todos' = 'producao',
): Promise<Record<string, unknown>[]> {
  const rows = await db
    .select()
    .from(atendimentos)
    .orderBy(asc(atendimentos.data), asc(atendimentos.id));

  const idF = String(idAtendimento || '').trim();

  let filtered = rows.filter((a) => {
    if (idF && String(a.idAtendimento).trim() !== idF) return false;
    const ymd = ymdFromAtendimentoDate(a.data as string | Date | null);
    if (idF) return true;
    if (!dataInicio && !dataFim) return true;
    if (!ymd) return false;
    if (dataInicio && ymd < dataInicio) return false;
    if (dataFim && ymd > dataFim) return false;
    return true;
  });

  /**
   * Isolamento orçamento ↔ produção: filtra cedo pelos ids do pedido.
   * Sem isto, a lista de Orçamentos misturava tickets da agenda.
   */
  if (!idF && modoPedido !== 'todos') {
    const idsCandidatos = Array.from(
      new Set(
        filtered
          .map((a) => String(a.idAtendimento || '').trim())
          .filter((x) => x.length > 0),
      ),
    );
    if (idsCandidatos.length === 0) {
      return [];
    }
    const pedModos = await db
      .select({
        id: atendimentosPedido.idAtendimento,
        modo: atendimentosPedido.modo,
      })
      .from(atendimentosPedido)
      .where(inArray(atendimentosPedido.idAtendimento, idsCandidatos));
    const idsPermitidos = new Set<string>();
    for (const p of pedModos) {
      const id = String(p.id || '').trim();
      const m = String(p.modo ?? 'producao').trim().toLowerCase();
      if (!id) continue;
      if (modoPedido === 'orcamento') {
        if (m === 'orcamento') idsPermitidos.add(id);
      } else if (m !== 'orcamento') {
        idsPermitidos.add(id);
      }
    }
    /** Pedidos sem cabeçalho: só entram em listagens de produção. */
    if (modoPedido === 'producao') {
      for (const id of idsCandidatos) {
        if (!pedModos.some((p) => String(p.id).trim() === id)) {
          idsPermitidos.add(id);
        }
      }
    }
    filtered = filtered.filter((a) =>
      idsPermitidos.has(String(a.idAtendimento || '').trim()),
    );
  }

  if (somenteComHorario && !idF) {
    const idsComHorario = new Set<string>();
    for (const a of filtered) {
      const ini = a.inicio;
      if (ini != null && String(ini).trim() !== '') {
        idsComHorario.add(String(a.idAtendimento).trim());
      }
    }
    filtered = filtered.filter((a) =>
      idsComHorario.has(String(a.idAtendimento).trim()),
    );
  }

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

  /** Nome actual do cadastro (não a cópia antiga em `atendimentos.nome_cliente`). */
  const clienteIds = Array.from(
    new Set(
      filtered
        .map((a) => String(a.idCliente || '').trim())
        .filter((x) => x.length > 0),
    ),
  );
  const nomeClienteAtualPorId = new Map<string, string>();
  if (clienteIds.length > 0) {
    const cliRows = await db
      .select({
        id: clientes.idCliente,
        nome: clientes.nomeExibido,
      })
      .from(clientes)
      .where(inArray(clientes.idCliente, clienteIds));
    for (const r of cliRows) {
      const id = String(r.id || '').trim();
      const nome = String(r.nome || '').trim();
      if (id && nome) nomeClienteAtualPorId.set(id, nome);
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
      .where(inArray(atendimentoItens.idAtendimento, idsAt))
      .orderBy(asc(atendimentoItens.id));
    for (const row of itensRows) {
      const k = String(row.idAtendimento || '').trim();
      const arr = itensPorPedido.get(k) ?? [];
      const valorUnitarioStr =
        row.valorUnitario != null ? String(row.valorUnitario) : null;
      const descontoStr = row.desconto != null ? String(row.desconto) : null;
      const valorUnitarioNum =
        valorUnitarioStr != null ? Number(valorUnitarioStr) : null;
      const descontoNum = descontoStr != null ? Number(descontoStr) : 0;
      const qtd = Number(row.quantidade ?? 0);
      const totalLinha =
        valorUnitarioNum != null && Number.isFinite(valorUnitarioNum)
          ? Math.max(
              0,
              Math.round((qtd * valorUnitarioNum - descontoNum) * 100) / 100,
            )
          : null;
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
        regra_mega_queratina_id: row.regraMegaQueratinaId ?? null,
        pacote_queratina_id: row.pacoteQueratinaId ?? null,
        valor_unitario: valorUnitarioStr,
        desconto: descontoStr,
        total_linha: totalLinha,
      });
      itensPorPedido.set(k, arr);
    }
  }

  /** Resumo financeiro consolidado (total / total_pago / saldo / status) por pedido. */
  const resumosPorId = await getResumosPorAtendimento(db, idsAt);

  /** Prestações fiado (`pendente`) em `comanda_pagamentos` — atraso na recepção. */
  const prestacaoPendentePorId = new Map<
    string,
    { atrasada: boolean; menorDataYmd: string | null }
  >();
  if (idsAt.length > 0) {
    const prestRows = await db
      .select({
        idAtendimento: comandaPagamentos.idAtendimento,
        temAtrasada: sql<boolean>`
          bool_or(
            ${comandaPagamentos.metodo} = 'pendente'
            AND ${comandaPagamentos.dataPagamento} < CURRENT_DATE
          )`,
        menorData: sql<string | null>`
          min(
            CASE
              WHEN ${comandaPagamentos.metodo} = 'pendente'
              THEN ${comandaPagamentos.dataPagamento}::text
            END
          )
        `,
      })
      .from(comandaPagamentos)
      .where(inArray(comandaPagamentos.idAtendimento, idsAt))
      .groupBy(comandaPagamentos.idAtendimento);
    for (const row of prestRows) {
      const k = String(row.idAtendimento || '').trim();
      if (!k) continue;
      let menor: string | null =
        row.menorData != null ? String(row.menorData).slice(0, 10) : null;
      if (menor && !/^\d{4}-\d{2}-\d{2}$/.test(menor)) menor = null;
      prestacaoPendentePorId.set(k, {
        atrasada: Boolean(row.temAtrasada),
        menorDataYmd: menor,
      });
    }
  }

  const numerosPorIdAt = new Map<string, number>();
  const modoPorIdAt = new Map<
    string,
    {
      modo: string;
      orcamento_status: string | null;
      orcamento_enviado_em: string | null;
      orcamento_convertido_em: string | null;
    }
  >();
  if (idsAt.length > 0) {
    const pedNum = await db
      .select({
        id: atendimentosPedido.idAtendimento,
        n: atendimentosPedido.numeroComanda,
        modo: atendimentosPedido.modo,
        orcamentoStatus: atendimentosPedido.orcamentoStatus,
        orcamentoEnviadoEm: atendimentosPedido.orcamentoEnviadoEm,
        orcamentoConvertidoEm: atendimentosPedido.orcamentoConvertidoEm,
      })
      .from(atendimentosPedido)
      .where(inArray(atendimentosPedido.idAtendimento, idsAt));
    for (const r of pedNum) {
      const k = String(r.id || '').trim();
      const nv = r.n != null ? Number(r.n) : NaN;
      if (k && Number.isFinite(nv) && nv > 0) {
        numerosPorIdAt.set(k, nv);
      }
      if (k) {
        modoPorIdAt.set(k, {
          modo: String(r.modo ?? 'producao'),
          orcamento_status:
            r.orcamentoStatus != null ? String(r.orcamentoStatus) : null,
          orcamento_enviado_em:
            r.orcamentoEnviadoEm != null
              ? String(r.orcamentoEnviadoEm)
              : null,
          orcamento_convertido_em:
            r.orcamentoConvertidoEm != null
              ? String(r.orcamentoConvertidoEm)
              : null,
        });
      }
    }
  }

  /**
   * Corrige `pagamento_status` persistido como «parcial» quando o resumo já
   * indica «pago» (ex.: desconto global não entrava no total da pivot antes do fix).
   */
  for (const id of idsAt) {
    const r = resumosPorId.get(id);
    if (!r || r.status !== 'pago') continue;
    const linha = filtered.find(
      (x) =>
        String(x.idAtendimento || '').trim() === id &&
        String(x.cobrancaStatus || '').trim().toLowerCase() === 'finalizada',
    );
    if (!linha) continue;
    const ps = String(linha.pagamentoStatus ?? '').trim().toLowerCase();
    if (ps === 'confirmado') continue;
    await sincronizarPagamentoStatusAtendimento(db, id).catch(() => {});
    const [ref] = await db
      .select({ ps: atendimentos.pagamentoStatus })
      .from(atendimentos)
      .where(
        and(
          eq(atendimentos.idAtendimento, id),
          eq(atendimentos.cobrancaStatus, 'finalizada'),
        ),
      )
      .limit(1);
    const novoPs = ref?.ps ?? linha.pagamentoStatus;
    for (const row of filtered) {
      if (String(row.idAtendimento || '').trim() !== id) continue;
      if (
        String(row.cobrancaStatus || '').trim().toLowerCase() === 'finalizada'
      ) {
        row.pagamentoStatus = novoPs;
      }
    }
  }

  return filtered.map((a) => {
    const dataStr = ymdFromAtendimentoDate(a.data as string | Date | null);
    const pid =
      a.profissionalId != null && Number(a.profissionalId) > 0
        ? Number(a.profissionalId)
        : null;
    const profNome = pid != null ? nomePorProfId.get(pid) ?? '' : '';
    const idAtKey = String(a.idAtendimento || '').trim();
    const idCliKey = String(a.idCliente || '').trim();
    const nomeClienteAtual =
      (idCliKey ? nomeClienteAtualPorId.get(idCliKey) : null) ||
      String(a.nomeCliente ?? '').trim() ||
      null;
    /** Catálogo completo em todas as linhas do mesmo pedido (a UI relaciona valores por linha). */
    const catalogoLista = idAtKey ? (itensPorPedido.get(idAtKey) ?? []) : [];
    return {
      linha_id: a.id,
      'ID Atendimento': a.idAtendimento,
      Data: dataStr,
      inicio: tsParaRespostaListagem(a.inicio as Date | string | null),
      fim: tsParaRespostaListagem(a.fim as Date | string | null),
      'ID Cliente': a.idCliente,
      'Nome Cliente': nomeClienteAtual,
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
      Quantidade: a.quantidade ?? 1,
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
      agenda_status: a.agendaStatus ?? null,
      agenda_cor: a.agendaCor ?? null,
      id: a.idAtendimento,
      ...(idAtKey
        ? (() => {
            const r = resumosPorId.get(idAtKey);
            if (!r) return {};
            return {
              total_bruto: r.total_bruto,
              total: r.total,
              desconto_num: r.desconto,
              total_pago: r.total_pago,
              saldo: r.saldo,
              status_cobranca: r.status,
            };
          })()
        : {}),
      ...(catalogoLista.length > 0
        ? {
            itens_catalogo: catalogoLista,
            itens: catalogoLista,
          }
        : {}),
      numero_comanda: numerosPorIdAt.get(idAtKey) ?? null,
      ...(idAtKey
        ? (() => {
            const mo = modoPorIdAt.get(idAtKey);
            return {
              modo: mo?.modo ?? 'producao',
              orcamento_status: mo?.orcamento_status ?? null,
              orcamento_enviado_em: mo?.orcamento_enviado_em ?? null,
              orcamento_convertido_em: mo?.orcamento_convertido_em ?? null,
            };
          })()
        : {
            modo: 'producao',
            orcamento_status: null,
            orcamento_enviado_em: null,
            orcamento_convertido_em: null,
          }),
      ...(idAtKey
        ? (() => {
            const pr = prestacaoPendentePorId.get(idAtKey);
            return {
              pagamento_prestacao_pendente_atrasada: pr?.atrasada ?? false,
              pagamento_prestacao_menor_data: pr?.menorDataYmd ?? null,
            };
          })()
        : {
            pagamento_prestacao_pendente_atrasada: false,
            pagamento_prestacao_menor_data: null,
          }),
    };
  });
}

export async function assertPedidoNaoOrcamento(
  db: Db,
  idAtendimento: string,
): Promise<void> {
  const { assertPedidoNaoOrcamento: assert } = await import(
    './orcamentos-domain'
  );
  await assert(db, idAtendimento);
}

/** Marca todas as linhas com o mesmo `ID Atendimento` como finalizadas; pagamento fica pendente. */
export async function finalizarCobrancaPorIdAtendimento(
  db: Db,
  idAtendimento: string,
  descontoRaw?: unknown,
): Promise<number> {
  const id = String(idAtendimento || '').trim();
  if (!id) throw new Error('id_atendimento é obrigatório');
  await assertPedidoNaoOrcamento(db, id);

  const rows = await db
    .select()
    .from(atendimentos)
    .where(eq(atendimentos.idAtendimento, id))
    .orderBy(asc(atendimentos.id));

  if (rows.length === 0) return 0;

  await aplicarDescontoComandaPorIdAtendimento(db, id, descontoRaw);

  /** Baixa estoque antes de marcar finalizada — se falhar, a cobrança permanece aberta. */
  await darBaixaEstoqueDoPedido(db, id);

  const resumoAntes = await getResumoComanda(db, id);
  let atualizadas = 0;
  for (const r of rows) {
    const patch: {
      cobrancaStatus: string;
      pagamentoStatus: string;
    } = {
      cobrancaStatus: 'finalizada',
      pagamentoStatus: resumoAntes.total_pago > 0 ? 'parcial' : 'pendente',
    };

    await db.update(atendimentos).set(patch).where(eq(atendimentos.id, r.id));
    atualizadas += 1;
  }

  if (atualizadas > 0) {
    await recalcularFolhaAposMudancaAtendimento(db, id);
  }

  return atualizadas;
}

/**
 * Remove sufixo «Desconto: R$ …» deixado pelo fluxo antigo (desconto da comanda
 * gravado em `atendimentos.descricao` / `.desconto`).
 */
function stripSufixoDescontoComandaDescricao(descricao: string): string {
  return String(descricao ?? '')
    .replace(/\s*—\s*Desconto:\s*R\$\s*[\d.,]+/gi, '')
    .replace(/Desconto:\s*R\$\s*[\d.,]+/gi, '')
    .replace(/\s*—\s*$/g, '')
    .trim();
}

function descontoLinhaEquivale(
  raw: unknown,
  alvo: number,
): boolean {
  if (!(alvo > 0.005)) return false;
  const n = toNumberPt(raw);
  return n != null && Math.abs(n - alvo) <= 0.005;
}

/**
 * Grava o desconto «da comanda» em `atendimentos_pedido.desconto_comanda`
 * (não em `atendimentos.desconto` / pivot, que são desconto por item).
 *
 * Também remove contaminação do fluxo antigo nas linhas (`atendimentos`):
 * o mesmo valor ia para a 1.ª linha e o sufixo na descrição. A pivot
 * (`atendimento_itens.desconto`) fica intacta — é desconto por item.
 */
export async function aplicarDescontoComandaPorIdAtendimento(
  db: Db,
  idAtendimento: string,
  descontoRaw?: unknown,
): Promise<number> {
  const id = String(idAtendimento || '').trim();
  if (!id) throw new Error('id_atendimento é obrigatório');
  await assertPedidoNaoOrcamento(db, id);

  const [pedido] = await db
    .select({ id: atendimentosPedido.idAtendimento })
    .from(atendimentosPedido)
    .where(eq(atendimentosPedido.idAtendimento, id))
    .limit(1);
  if (!pedido) return 0;

  let descontoStr: string | null = null;
  let descontoNum = 0;
  const trimmed = String(descontoRaw ?? '').trim();
  if (trimmed) {
    const n = toNumberPt(trimmed);
    if (n === null || n < 0) {
      throw new Error(
        'Desconto inválido. Use valor em reais (ex.: 10 ou 10,50 ou R$ 10,00).',
      );
    }
    if (n > 0) {
      descontoNum = Math.round(n * 100) / 100;
      descontoStr = formatMoedaReciboPt(descontoNum);
    }
  }

  await db
    .update(atendimentosPedido)
    .set({ descontoComanda: descontoStr })
    .where(eq(atendimentosPedido.idAtendimento, id));

  await limparContaminacaoDescontoComanda(db, id, descontoNum);

  return 1;
}

/**
 * Limpa vestígios do desconto da comanda em linhas (`atendimentos`).
 * Nunca toca em `atendimento_itens.desconto` — esse é desconto **por item**
 * legítimo; apagá-lo quando coincidia com `desconto_comanda` fazia o «Desc.»
 * do item desaparecer após Salvar na comanda.
 */
async function limparContaminacaoDescontoComanda(
  db: Db,
  idAtendimento: string,
  descontoComandaNum: number,
): Promise<void> {
  const linhas = await db
    .select({
      id: atendimentos.id,
      desconto: atendimentos.desconto,
      descricao: atendimentos.descricao,
    })
    .from(atendimentos)
    .where(eq(atendimentos.idAtendimento, idAtendimento));

  for (const row of linhas) {
    const descTxt = String(row.descricao ?? '');
    const novaDesc = stripSufixoDescontoComandaDescricao(descTxt);
    const tinhaSufixo = novaDesc !== descTxt;
    const mesmoValorComanda = descontoLinhaEquivale(
      row.desconto,
      descontoComandaNum,
    );
    const patch: { desconto?: string; descricao?: string } = {};
    if (tinhaSufixo) {
      patch.descricao = novaDesc;
    }
    /** Sufixo antigo ou eco do valor da comanda na coluna legado da linha. */
    if (tinhaSufixo || mesmoValorComanda) {
      if (String(row.desconto ?? '').trim()) {
        patch.desconto = '';
      }
    }
    if (Object.keys(patch).length > 0) {
      await db
        .update(atendimentos)
        .set(patch)
        .where(eq(atendimentos.id, row.id));
    }
  }
}

/**
 * Remove todas as linhas com o mesmo `ID Atendimento`.
 *
 * @param opts.manterCabecalhoPedido — Quando `true`, não apaga `atendimentos_pedido`
 * (mantém `numero_comanda`). Usado no fluxo «excluir + recriar» do editor de agendamento,
 * para não consumir um novo número da sequência a cada gravação.
 */
export async function excluirAtendimentoPorIdAtendimento(
  db: Db,
  idAtendimento: string,
  opts?: { manterCabecalhoPedido?: boolean },
): Promise<number> {
  const id = String(idAtendimento || '').trim();
  if (!id) throw new Error('id_atendimento é obrigatório');
  const manterPedido = Boolean(opts?.manterCabecalhoPedido);
  /**
   * Edição (manter cabeçalho) recria linhas — não é exclusão de comanda.
   * Exclusão real: bloquear se já houver pagamentos (opção A).
   */
  if (!manterPedido) {
    await assertComandaSemPagamentosParaExclusao(db, id);
  }
  return await db.transaction(async (tx) => {
    await tx
      .delete(atendimentoItens)
      .where(eq(atendimentoItens.idAtendimento, id));
    const rows = await tx
      .delete(atendimentos)
      .where(eq(atendimentos.idAtendimento, id))
      .returning({ id: atendimentos.id });
    if (!manterPedido) {
      await tx
        .delete(atendimentosPedido)
        .where(eq(atendimentosPedido.idAtendimento, id));
    }
    return rows.length;
  }).then(async (n) => {
    if (!manterPedido) {
      await syncNumeroComandaSequence(db);
    }
    return n;
  });
}

export type ModoExclusaoComanda = 'somente_comanda' | 'completo';

/** Mensagem estável para a UI (VALIDAÇÃO). */
export const MSG_EXCLUIR_COMANDA_COM_PAGAMENTOS =
  'Não é possível excluir uma comanda com pagamentos registados. Remova os pagamentos em «Ver pagamentos» / Faturar e tente de novo.';

/**
 * Opção A: comanda com dinheiro recebido (pago ou parcial) não pode ser excluída
 * até o utilizador estornar/remover os pagamentos.
 */
export async function assertComandaSemPagamentosParaExclusao(
  db: Db,
  idAtendimento: string,
): Promise<void> {
  const id = String(idAtendimento || '').trim();
  if (!id) return;
  const resumo = await getResumoComanda(db, id);
  const pago = Number(resumo.total_pago ?? 0);
  if (
    (Number.isFinite(pago) && pago > 0.005) ||
    resumo.status === 'pago' ||
    resumo.status === 'parcial'
  ) {
    throw new Error(MSG_EXCLUIR_COMANDA_COM_PAGAMENTOS);
  }
}

function ymdHojeLocal(): string {
  return new Date().toISOString().slice(0, 10);
}

function pagamentoEhCreditoCliente(obs: string | null | undefined): boolean {
  const o = String(obs ?? '').toLowerCase();
  return o.includes('crédito') || o.includes('credito');
}

/**
 * - `completo`: remove linhas de agenda, pedido e pagamentos.
 * - `somente_comanda`: remove pedido/pagamentos/movimentações e repõe crédito usado;
 *   mantém `atendimentos` na grelha (cobrança reposta a «sem comanda»).
 */
export async function excluirComandaPorIdAtendimento(
  db: Db,
  idAtendimento: string,
  modo: ModoExclusaoComanda,
): Promise<number> {
  const id = String(idAtendimento || '').trim();
  if (!id) throw new Error('id_atendimento é obrigatório');
  await assertComandaSemPagamentosParaExclusao(db, id);
  if (modo === 'completo') {
    return excluirAtendimentoPorIdAtendimento(db, id);
  }

  return await db.transaction(async (tx) => {
    const [ped] = await tx
      .select({ idCliente: atendimentosPedido.idCliente })
      .from(atendimentosPedido)
      .where(eq(atendimentosPedido.idAtendimento, id))
      .limit(1);

    const pagRows = await tx
      .select({
        valor: comandaPagamentos.valor,
        metodo: comandaPagamentos.metodo,
        observacao: comandaPagamentos.observacao,
        dataPagamento: comandaPagamentos.dataPagamento,
      })
      .from(comandaPagamentos)
      .where(eq(comandaPagamentos.idAtendimento, id));

    const cid = String(ped?.idCliente ?? '').trim();
    if (cid) {
      for (const p of pagRows) {
        if (String(p.metodo) !== 'outros') continue;
        if (!pagamentoEhCreditoCliente(p.observacao)) continue;
        const v =
          Math.round((parseFloat(String(p.valor ?? '0')) || 0) * 100) / 100;
        if (v <= 0) continue;
        await tx
          .update(clientes)
          .set({
            creditoSaldo: sql`${clientes.creditoSaldo}::numeric + ${v.toFixed(2)}::numeric`,
          })
          .where(eq(clientes.idCliente, cid));
        const dataMov = String(p.dataPagamento ?? '').trim().slice(0, 10);
        await registrarCreditoMovimentoClienteEmTx(tx, cid, {
          idAtendimento: id,
          dataMov: /^\d{4}-\d{2}-\d{2}$/.test(dataMov) ? dataMov : ymdHojeLocal(),
          valor: v,
          tipo: 'entrada',
          motivo: 'Estorno — exclusão somente da comanda',
        });
      }
    }

    await tx
      .delete(movimentacoes)
      .where(eq(movimentacoes.idAtendimento, id));
    await tx
      .delete(atendimentoItens)
      .where(eq(atendimentoItens.idAtendimento, id));
    await tx
      .delete(atendimentosPedido)
      .where(eq(atendimentosPedido.idAtendimento, id));

    const rows = await tx
      .update(atendimentos)
      .set({
        cobrancaStatus: null,
        pagamentoStatus: null,
        pagamentoMetodo: null,
        desconto: null,
      })
      .where(eq(atendimentos.idAtendimento, id))
      .returning({ id: atendimentos.id });

    return rows.length;
  }).then(async (n) => {
    await syncNumeroComandaSequence(db);
    return n;
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

  const candidatas = await db
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

  await darBaixaEstoqueDoPedido(db, id);
  const total = totalLiquidoConfirmacao(candidatas);
  if (total <= 0) {
    return { linhasAtualizadas: 0, movimentacaoId: null };
  }
  const metodoComanda =
    metodo === 'Dinheiro'
      ? 'dinheiro'
      : metodo === 'Pix'
        ? 'pix'
        : 'cartao_credito';
  const criado = await criarPagamentoComanda(db, id, {
    valor: total,
    metodo: metodoComanda,
    parcelas: metodoComanda === 'cartao_credito' ? 1 : 1,
    data_pagamento: ymdFromAtendimentoDate(
      candidatas[0]!.data as string | Date | null,
    ) || undefined,
    observacao: 'Confirmação via fluxo legado',
  });
  const movId = criado.pagamento.movimentacao_id ?? null;
  const updated = await db
    .update(atendimentos)
    .set({
      pagamentoMetodo: metodo,
    })
    .where(
      and(
        eq(atendimentos.idAtendimento, id),
        eq(atendimentos.cobrancaStatus, 'finalizada'),
      ),
    )
    .returning({ id: atendimentos.id });

  const result = {
    linhasAtualizadas: updated.length,
    movimentacaoId: movId,
  };

  if (result.linhasAtualizadas > 0) {
    await recalcularFolhaAposMudancaAtendimento(db, id);
  }

  return result;
}

export type RemarcarAgendamentoPayload = {
  id_atendimento: string;
  profissional_origem_id: number;
  profissional_destino_id: number;
  /** YYYY-MM-DD do novo início do bloco. */
  data: string;
  /** HH:mm do novo início do bloco. */
  hora_inicio: string;
};

const AGENDA_GRID_START_MIN = 8 * 60;
const AGENDA_GRID_LAST_SLOT_START_MIN = 23 * 60;

/**
 * Desloca no tempo (e opcionalmente de profissional) as linhas de um bloco na grelha.
 * Só afeta linhas com o mesmo `id_atendimento` e `profissional_origem_id`.
 */
export async function remarcarBlocoAgendamento(
  db: Db,
  payload: RemarcarAgendamentoPayload,
): Promise<{ linhasAtualizadas: number }> {
  const id = String(payload.id_atendimento || '').trim();
  if (!id) throw new Error('id_atendimento é obrigatório');

  const profOrig = Number(payload.profissional_origem_id);
  const profDest = Number(payload.profissional_destino_id);
  if (!Number.isFinite(profOrig) || profOrig <= 0) {
    throw new Error('profissional_origem_id inválido');
  }
  if (!Number.isFinite(profDest) || profDest <= 0) {
    throw new Error('profissional_destino_id inválido');
  }

  const data = String(payload.data || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    throw new Error('data inválida (use YYYY-MM-DD)');
  }

  const hora = String(payload.hora_inicio || '').trim();
  const hm = /^(\d{1,2}):(\d{2})$/.exec(hora);
  if (!hm) throw new Error('hora_inicio inválida (use HH:mm)');
  const hh = parseInt(hm[1], 10);
  const mm = parseInt(hm[2], 10);
  if (!Number.isFinite(hh) || !Number.isFinite(mm) || hh > 23 || mm > 59) {
    throw new Error('hora_inicio inválida');
  }
  const startMin = hh * 60 + mm;
  if (
    startMin < AGENDA_GRID_START_MIN ||
    startMin > AGENDA_GRID_LAST_SLOT_START_MIN
  ) {
    throw new Error('Horário fora do expediente da agenda (08:00–23:00)');
  }

  await assertProfissionalIdExists(db, profDest, true);

  const rows = await db
    .select()
    .from(atendimentos)
    .where(
      and(
        eq(atendimentos.idAtendimento, id),
        eq(atendimentos.profissionalId, profOrig),
      ),
    )
    .orderBy(asc(atendimentos.id));

  if (rows.length === 0) {
    throw new Error('Nenhuma linha encontrada para remarcar');
  }

  for (const r of rows) {
    if (String(r.cobrancaStatus || '').trim() === 'finalizada') {
      throw new Error('Não é possível remarcar uma comanda já finalizada');
    }
  }

  let anchorParts: SqlLocalParts | null = null;
  for (const r of rows) {
    const p = partesSqlLocalDeTextoSalao(r.inicio);
    if (!p) continue;
    if (
      !anchorParts ||
      civilNaiveSalaoParaUtcMs(p) < civilNaiveSalaoParaUtcMs(anchorParts)
    ) {
      anchorParts = p;
    }
  }
  if (!anchorParts) {
    throw new Error('Agendamento sem horário definido');
  }

  const newStart: SqlLocalParts = {
    y: parseInt(data.slice(0, 4), 10),
    mo: parseInt(data.slice(5, 7), 10),
    d: parseInt(data.slice(8, 10), 10),
    hh,
    mm,
    ss: 0,
  };

  const deltaMin = Math.round(
    (civilNaiveSalaoParaUtcMs(newStart) -
      civilNaiveSalaoParaUtcMs(anchorParts)) /
      60000,
  );

  let atualizadas = 0;
  for (const r of rows) {
    const patch: {
      profissionalId?: number;
      inicio?: string | null;
      fim?: string | null;
      data?: string;
    } = {};

    if (profDest !== profOrig) {
      patch.profissionalId = profDest;
    }

    const pIni = partesSqlLocalDeTextoSalao(r.inicio);
    if (pIni) {
      const newIni = formatSqlLocalDateTime(addMinutesToParts(pIni, deltaMin));
      patch.inicio = newIni;
      patch.data = newIni.slice(0, 10);
    }

    const pFim = partesSqlLocalDeTextoSalao(r.fim);
    if (pFim) {
      patch.fim = formatSqlLocalDateTime(addMinutesToParts(pFim, deltaMin));
    } else if (patch.inicio) {
      const pOldIni = partesSqlLocalDeTextoSalao(r.inicio);
      const pOldFim = partesSqlLocalDeTextoSalao(r.fim);
      let durMin = 30;
      if (pOldIni && pOldFim) {
        durMin = Math.max(
          5,
          Math.round(
            (civilNaiveSalaoParaUtcMs(pOldFim) -
              civilNaiveSalaoParaUtcMs(pOldIni)) /
              60000,
          ),
        );
      }
      const pNewIni = parseSqlLocalDateTime(patch.inicio);
      if (pNewIni) {
        patch.fim = formatSqlLocalDateTime(addMinutesToParts(pNewIni, durMin));
      }
    }

    if (Object.keys(patch).length === 0) continue;

    await db.update(atendimentos).set(patch).where(eq(atendimentos.id, r.id));
    atualizadas += 1;
  }

  if (profDest !== profOrig) {
    await db
      .update(atendimentoItens)
      .set({ profissionalId: profDest })
      .where(
        and(
          eq(atendimentoItens.idAtendimento, id),
          eq(atendimentoItens.profissionalId, profOrig),
        ),
      );
  }

  if (atualizadas > 0) {
    await recalcularFolhaAposMudancaAtendimento(db, id);
  }

  return { linhasAtualizadas: atualizadas };
}

const AGENDA_STATUS_IDS_VALIDOS = new Set([
  'confirmado',
  'nao_confirmado',
  'aguardando',
  'cancelado',
]);

/**
 * Atualiza `agenda_status` em todas as linhas do mesmo `id_atendimento`.
 * Limpa `agenda_cor` para o cartão passar a usar a cor do status.
 */
export async function atualizarAgendaStatusBloco(
  db: Db,
  payload: { id_atendimento: string; agenda_status: string },
): Promise<{ linhasAtualizadas: number }> {
  const id = String(payload.id_atendimento || '').trim();
  if (!id) throw new Error('id_atendimento é obrigatório');

  const status = String(payload.agenda_status || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
  if (!AGENDA_STATUS_IDS_VALIDOS.has(status)) {
    throw new Error('agenda_status inválido');
  }

  const rows = await db
    .select({ id: atendimentos.id })
    .from(atendimentos)
    .where(eq(atendimentos.idAtendimento, id));

  if (rows.length === 0) {
    throw new Error('Nenhuma linha encontrada para atualizar o status');
  }

  let atualizadas = 0;
  for (const r of rows) {
    await db
      .update(atendimentos)
      .set({ agendaStatus: status, agendaCor: null })
      .where(eq(atendimentos.id, r.id));
    atualizadas += 1;
  }
  return { linhasAtualizadas: atualizadas };
}

/**
 * Atualiza `agenda_cor` em todas as linhas do mesmo `id_atendimento`.
 * Hex vazio / null → remove a cor nomeada (volta ao padrão do status).
 */
export async function atualizarAgendaCorBloco(
  db: Db,
  payload: { id_atendimento: string; agenda_cor: string | null },
): Promise<{ linhasAtualizadas: number }> {
  const id = String(payload.id_atendimento || '').trim();
  if (!id) throw new Error('id_atendimento é obrigatório');

  let cor: string | null = null;
  if (payload.agenda_cor != null) {
    const raw = String(payload.agenda_cor).trim();
    if (raw) {
      if (!/^#[0-9A-Fa-f]{6}$/.test(raw)) {
        throw new Error('agenda_cor inválida (use #RRGGBB)');
      }
      cor = raw;
    }
  }

  const rows = await db
    .select({ id: atendimentos.id })
    .from(atendimentos)
    .where(eq(atendimentos.idAtendimento, id));

  if (rows.length === 0) {
    throw new Error('Nenhuma linha encontrada para atualizar a cor');
  }

  let atualizadas = 0;
  for (const r of rows) {
    await db
      .update(atendimentos)
      .set({ agendaCor: cor })
      .where(eq(atendimentos.id, r.id));
    atualizadas += 1;
  }
  return { linhasAtualizadas: atualizadas };
}
