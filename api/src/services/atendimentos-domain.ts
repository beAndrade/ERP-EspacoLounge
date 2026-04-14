/**
 * Regras alinhadas a apps-script/Code.gs (createAtendimento_ e auxiliares).
 */
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { Db } from '../db';
import { descricaoParaListaLinha } from '../lib/descricao-lista';
import { normalizeComissaoParaBD } from '../lib/normalize-comissao';
import {
  atendimentos,
  clientes,
  folha,
  pacotes,
  produtos,
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
      /** ID da linha na tabela `folha` (aba Folha). */
      profissional_id: number;
      servico_id: string;
      tamanho?: string;
      observacao?: string;
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
  return ymdCompactFromDataStr(new Date().toISOString().slice(0, 10));
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
    .where(eq(servicos.linha, lineNum))
    .limit(1);
  if (!r) throw new Error(`Linha inválida na aba Serviços: ${lineNum}`);
  return r;
}

async function findRegraMega(
  db: Db,
  pacote: string,
  etapa: string,
): Promise<{ valor: string; comissao: string }> {
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
    valor: r.valor != null ? String(r.valor) : '',
    comissao: r.comissao != null ? String(r.comissao) : '',
  };
}

async function findPrecoPacote(db: Db, nome: string): Promise<string | null> {
  const rows = await db
    .select()
    .from(pacotes)
    .where(eq(pacotes.pacote, nome.trim()));
  const p = rows[0]?.precoPacote;
  return p != null && p !== '' ? String(p) : null;
}

async function findProdutoPreco(db: Db, nome: string): Promise<string | null> {
  const rows = await db
    .select()
    .from(produtos)
    .where(eq(produtos.produto, nome.trim()));
  const p = rows[0]?.preco;
  return p != null && p !== '' ? String(p) : null;
}

async function assertFolhaIdExists(db: Db, id: number): Promise<void> {
  const [r] = await db
    .select({ id: folha.id })
    .from(folha)
    .where(eq(folha.id, id))
    .limit(1);
  if (!r) {
    throw new Error(`profissional_id inválido: ${id} não existe na Folha`);
  }
}

/**
 * Resolve `folha.id` a partir de `profissional_id` ou, em legado, do nome em `profissional`.
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
      await assertFolhaIdExists(db, n);
      return n;
    }
    if (required) throw new Error('profissional_id inválido');
  }
  const nome = String(opts.profissional ?? '').trim();
  if (!nome) {
    if (required) {
      throw new Error('Profissional é obrigatório (profissional_id da Folha)');
    }
    return null;
  }
  const rows = await db
    .select({ id: folha.id, nome: folha.profissional })
    .from(folha);
  for (const row of rows) {
    const t = String(row.nome || '').trim();
    if (t === nome) {
      return row.id;
    }
  }
  if (required) {
    throw new Error(
      `Profissional "${nome}" não encontrado na Folha (use profissional_id)`,
    );
  }
  return null;
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
  },
): Promise<void> {
  const dataSql = parseDataSql(o.dataStr);
  await db.insert(atendimentos).values({
    idAtendimento: o.idAt,
    data: dataSql,
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
  const linhaServico = parseInt(String(p.servico_id || ''), 10);
  const dataStr = String(p.data || '').trim();
  if (!clienteId || !linhaServico || !dataStr) {
    throw new Error(
      'cliente_id, servico_id (linha na aba Serviços) e data são obrigatórios',
    );
  }
  const rec = p as Record<string, unknown>;
  const profissionalId = await resolveProfissionalIdToInt(
    db,
    {
      profissional_id: rec['profissional_id'],
      profissional: rec['profissional'],
    },
    !legacy,
  );
  if (profissionalId == null && !legacy) {
    throw new Error('Profissional é obrigatório (profissional_id)');
  }
  let tamanhoParam = String('tamanho' in p ? p.tamanho || '' : '').trim();
  const nomeCliente = await findClienteNome(db, clienteId);
  const srv = await readServicoRow(db, linhaServico);
  const nomeServico = srv.servico != null ? String(srv.servico) : '';
  const cat = tipoServicoCatalogo(srv);
  if (!legacy && !cat) {
    throw new Error(
      `Tipo da linha Serviços não reconhecido (use Fixo ou Tamanho): ${String(srv.tipo || '')}`,
    );
  }
  if (!legacy && cat === 'Tamanho' && !tamanhoParam) {
    tamanhoParam = 'Curto';
  }
  const vc = valorEComissaoServico(srv, cat, tamanhoParam || 'Curto', legacy);
  const idAt = makeIdAtendimento(dataStr, clienteId);
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
    valor: vc.valor,
    comissao: vc.comissao,
    descricao: String('observacao' in p ? p.observacao || '' : '').trim(),
  });
  return {
    id: idAt,
    linhas: 1,
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
  const obs = String(p.observacao || '').trim();
  for (const st of etapas) {
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
  const preco = await findPrecoPacote(db, pacote);
  if (preco === null) {
    throw new Error(`Pacote não encontrado na aba Pacotes: "${pacote}"`);
  }
  const nomeCliente = await findClienteNome(db, clienteId);
  const idAt = makeIdAtendimento(dataStr, clienteId);
  const obs = String(p.observacao || '').trim();
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
    valor: preco,
    comissao: '',
    descricao: obs,
    descricaoManual: obs,
  });
  for (const st of etapas) {
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
  const nomeProd = String(p.produto || '').trim();
  const profissionalId = await resolveProfissionalIdToInt(
    db,
    {
      profissional_id: p.profissional_id,
      profissional: (p as Record<string, unknown>)['profissional'],
    },
    false,
  );
  if (!clienteId || !dataStr || !nomeProd) {
    throw new Error('cliente_id, data e produto são obrigatórios para Produto');
  }
  const q = Number(p.quantidade);
  if (Number.isNaN(q) || q <= 0) {
    throw new Error('quantidade deve ser um número maior que zero');
  }
  const precoUnit = await findProdutoPreco(db, nomeProd);
  if (precoUnit === null) {
    throw new Error(`Produto não encontrado na aba Produtos: "${nomeProd}"`);
  }
  const unitNum = toNumberPt(precoUnit);
  if (unitNum === null) {
    throw new Error(`Preço inválido para produto: "${nomeProd}"`);
  }
  const valorTotal = unitNum * q;
  const nomeCliente = await findClienteNome(db, clienteId);
  const idAt = makeIdAtendimento(dataStr, clienteId);
  const baseObs = String(p.observacao || '').trim();
  const obsParts: string[] = [];
  if (baseObs) obsParts.push(baseObs);
  obsParts.push(`Qtd: ${String(q).replace('.', ',')}`);
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
  });
  return {
    id: idAt,
    linhas: 1,
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
  const det = String(p.detalhes_cabelo || '').trim();
  const baseObs = String(p.observacao || '').trim();
  const obsParts: string[] = [];
  if (det) obsParts.push(det);
  if (baseObs) obsParts.push(baseObs);
  const obs = obsParts.join(' — ');
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

  const folhaIds = Array.from(
    new Set(
      filtered
        .map((a) => a.profissionalId)
        .filter((x): x is number => x != null && Number(x) > 0),
    ),
  );
  const nomePorFolhaId = new Map<number, string>();
  if (folhaIds.length > 0) {
    const fh = await db
      .select({ id: folha.id, nome: folha.profissional })
      .from(folha)
      .where(inArray(folha.id, folhaIds));
    for (const f of fh) {
      nomePorFolhaId.set(f.id, String(f.nome || '').trim());
    }
  }

  return filtered.map((a) => {
    const dataStr = ymdFromAtendimentoDate(a.data as string | Date | null);
    const pid =
      a.profissionalId != null && Number(a.profissionalId) > 0
        ? Number(a.profissionalId)
        : null;
    const profNome = pid != null ? nomePorFolhaId.get(pid) ?? '' : '';
    return {
      'ID Atendimento': a.idAtendimento,
      Data: dataStr,
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
  const rows = await db
    .delete(atendimentos)
    .where(eq(atendimentos.idAtendimento, id))
    .returning({ id: atendimentos.id });
  return rows.length;
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
      dataMov = new Date().toISOString().slice(0, 10);
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
