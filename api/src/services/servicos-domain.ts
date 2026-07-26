/**
 * Domínio do catálogo de serviços (CRUD da página /servicos).
 */
import { asc, eq, max, sql } from 'drizzle-orm';
import type { Db } from '../db';
import { atendimentoItens, categorias, servicos } from '../db/schema';
import { normalizeMoneyTextForDb } from '../lib/normalize-money-text';
import { listServicosForApi } from './queries';

export type ServicoTipoCatalogo = 'Fixo' | 'Tamanho';

export type ServicoWriteInput = {
  nome: string;
  tipo: ServicoTipoCatalogo;
  categoria?: string | null;
  mostra_no_site?: boolean;
  descricao?: string | null;
  foto_url?: string | null;
  valor_base?: string | null;
  comissao_fixa?: string | null;
  comissao_pct?: string | null;
  custo_fixo?: string | null;
  preco_curto?: string | null;
  preco_medio?: string | null;
  preco_medio_longo?: string | null;
  preco_longo?: string | null;
  /** Comissão R$ por tamanho (colunas legadas). */
  curto?: string | null;
  medio?: string | null;
  m_l?: string | null;
  longo?: string | null;
  duracao_minutos?: number | null;
  duracao_curto?: number | null;
  duracao_medio?: number | null;
  duracao_m_l?: number | null;
  duracao_longo?: number | null;
};

function trimOrNull(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
}

function normalizarTipo(v: unknown): ServicoTipoCatalogo {
  const t = String(v ?? '')
    .trim()
    .toLowerCase();
  if (t === 'tamanho') return 'Tamanho';
  return 'Fixo';
}

function normalizarDuracao(
  v: unknown,
  fallback: number | null = null,
): number | null {
  if (v == null || v === '') return fallback;
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n < 5 || n > 24 * 60) {
    throw new Error('Duração deve ser entre 5 e 1440 minutos.');
  }
  return n;
}

/** Comissão / preço em colunas `text`: canónico `R$ 1.234,56` (espaço ASCII). */
function textoMoedaOuNull(v: unknown): string | null {
  return normalizeMoneyTextForDb(v);
}

function valoresGravacao(input: ServicoWriteInput) {
  const nome = trimOrNull(input.nome);
  if (!nome) throw new Error('Nome do serviço é obrigatório.');
  const tipo = normalizarTipo(input.tipo);
  const categoria = trimOrNull(input.categoria);
  const descricao = trimOrNull(input.descricao);
  const fotoUrl = trimOrNull(input.foto_url);
  const mostraNoSite = input.mostra_no_site !== false;

  const comissaoPct = trimOrNull(input.comissao_pct);
  const comissaoFixa = textoMoedaOuNull(input.comissao_fixa);
  /** Uma unidade de comissão: se % preenchida, limpa R$ (e vice-versa quando só R$). */
  let pct = comissaoPct;
  let fixa = comissaoFixa;
  if (pct && fixa) {
    fixa = null;
  }

  const duracaoMinutos = normalizarDuracao(input.duracao_minutos, 30) ?? 30;

  if (tipo === 'Fixo') {
    return {
      servico: nome,
      tipo: 'Fixo' as const,
      categoria,
      mostraNoSite,
      descricao,
      fotoUrl,
      valorBase: textoMoedaOuNull(input.valor_base),
      comissaoFixa: fixa,
      comissaoPct: pct,
      custoFixo: textoMoedaOuNull(input.custo_fixo),
      precoCurto: null as string | null,
      precoMedio: null as string | null,
      precoMedioLongo: null as string | null,
      precoLongo: null as string | null,
      curto: null as string | null,
      medio: null as string | null,
      mL: null as string | null,
      longo: null as string | null,
      duracaoMinutos,
      duracaoCurto: null as number | null,
      duracaoMedio: null as number | null,
      duracaoMedioLongo: null as number | null,
      duracaoLongo: null as number | null,
    };
  }

  /**
   * Comissão por faixa: só grava se o body trouxe as chaves.
   * Se a API antiga strippar `curto`/`m_l`/…, `undefined` não pode virar `null`
   * (apagava os valores legados no BD).
   */
  const comissaoPorTamanhoNoBody =
    input.curto !== undefined ||
    input.medio !== undefined ||
    input.m_l !== undefined ||
    input.longo !== undefined;

  return {
    servico: nome,
    tipo: 'Tamanho' as const,
    categoria,
    mostraNoSite,
    descricao,
    fotoUrl,
    valorBase: null as string | null,
    comissaoFixa: fixa,
    comissaoPct: pct,
    custoFixo: textoMoedaOuNull(input.custo_fixo),
    precoCurto: textoMoedaOuNull(input.preco_curto),
    precoMedio: textoMoedaOuNull(input.preco_medio),
    precoMedioLongo: textoMoedaOuNull(input.preco_medio_longo),
    precoLongo: textoMoedaOuNull(input.preco_longo),
    ...(comissaoPorTamanhoNoBody
      ? {
          curto: textoMoedaOuNull(input.curto),
          medio: textoMoedaOuNull(input.medio),
          mL: textoMoedaOuNull(input.m_l),
          longo: textoMoedaOuNull(input.longo),
        }
      : {}),
    duracaoMinutos,
    duracaoCurto: normalizarDuracao(input.duracao_curto, null),
    duracaoMedio: normalizarDuracao(input.duracao_medio, null),
    duracaoMedioLongo: normalizarDuracao(input.duracao_m_l, null),
    duracaoLongo: normalizarDuracao(input.duracao_longo, null),
  };
}

async function allocNextServicoId(db: Db): Promise<number> {
  const [row] = await db.select({ m: max(servicos.id) }).from(servicos);
  const m = Number(row?.m ?? 0);
  return (Number.isFinite(m) ? m : 0) + 1;
}

export async function createServico(db: Db, input: ServicoWriteInput) {
  const vals = valoresGravacao(input);
  const id = await allocNextServicoId(db);
  const inserted = await db
    .insert(servicos)
    .values({ id, ...vals })
    .returning({ id: servicos.id });
  const insertedId = inserted[0]?.id;
  if (insertedId == null) {
    throw new Error('Falha ao gravar o serviço na base de dados.');
  }
  const items = await listServicosForApi(db);
  const item = items.find((s) => String(s.id) === String(insertedId));
  if (!item) {
    throw new Error(
      'Serviço inserido na base, mas não apareceu na listagem. Recarregue a página.',
    );
  }
  return item;
}

export async function updateServico(
  db: Db,
  idRaw: string | number,
  input: ServicoWriteInput,
) {
  const id = Number.parseInt(String(idRaw), 10);
  if (!Number.isFinite(id) || id <= 0) throw new Error('id inválido');
  const [exist] = await db
    .select({ id: servicos.id })
    .from(servicos)
    .where(eq(servicos.id, id))
    .limit(1);
  if (!exist) throw new Error('Serviço não encontrado');

  const vals = valoresGravacao(input);
  await db.update(servicos).set(vals).where(eq(servicos.id, id));
  const items = await listServicosForApi(db);
  const item = items.find((s) => String(s.id) === String(id));
  if (!item) throw new Error('Serviço atualizado mas não encontrado.');
  return item;
}

export async function deleteServico(db: Db, idRaw: string | number) {
  const id = Number.parseInt(String(idRaw), 10);
  if (!Number.isFinite(id) || id <= 0) throw new Error('id inválido');

  const [exist] = await db
    .select({ id: servicos.id })
    .from(servicos)
    .where(eq(servicos.id, id))
    .limit(1);
  if (!exist) throw new Error('Serviço não encontrado');

  const [uso] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(atendimentoItens)
    .where(eq(atendimentoItens.servicoId, id));
  if (Number(uso?.n ?? 0) > 0) {
    throw new Error(
      'Não é possível excluir: este serviço já foi usado em agendamentos.',
    );
  }

  await db.delete(servicos).where(eq(servicos.id, id));
  return { id: String(id) };
}

export async function listCategoriasServicos(db: Db): Promise<string[]> {
  const fromCatalog = await db
    .select({ nome: categorias.nome })
    .from(categorias)
    .where(eq(categorias.ativo, true))
    .orderBy(asc(categorias.nome));
  if (fromCatalog.length > 0) {
    return fromCatalog
      .map((r) => String(r.nome ?? '').trim())
      .filter((s) => s.length > 0);
  }
  const rows = await db
    .selectDistinct({ categoria: servicos.categoria })
    .from(servicos)
    .where(sql`trim(coalesce(${servicos.categoria}, '')) <> ''`)
    .orderBy(asc(servicos.categoria));
  return rows
    .map((r) => String(r.categoria ?? '').trim())
    .filter((s) => s.length > 0);
}
