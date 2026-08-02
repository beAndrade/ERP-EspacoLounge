import type { Db } from '../db';
import { finalizarCobrancaPorIdAtendimento } from './atendimentos-domain';
import {
  aplicarCreditoClientePorExcessoEmTx,
  getResumoComanda,
  inserirPagamentoComandaEmTx,
  listarPagamentosPorAtendimento,
  sincronizarPagamentoStatusAtendimento,
  usarCreditoClienteNaComandaEmTx,
  type CriarPagamentoComandaInput,
  type PagamentoComandaDTO,
  type ResumoComanda,
} from './comanda-pagamentos-domain';
import {
  calcularDatasParcelasCartao,
  listFormasPagamentoOpcoesApi,
  resolverFaixaParcelas,
  ymdAddDays,
  type FormaPrazoFaixaApi,
} from './finance-cadastros-domain';
import { toNumberPt } from './finance-domain';
import { recalcularFolhaAposMudancaAtendimento } from './folha-domain';
import { eq } from 'drizzle-orm';
import { atendimentos } from '../db/schema';

function somaValoresPagamentos(list: CriarPagamentoComandaInput[]): number {
  let s = 0;
  for (const p of list) {
    const v = toNumberPt(p.valor);
    if (v == null || !Number.isFinite(v) || v <= 0) {
      throw new Error('Cada pagamento da comanda deve ter valor maior que zero.');
    }
    s += Math.round(v * 100) / 100;
  }
  return Math.round(s * 100) / 100;
}

function ymdHojeLocal(): string {
  const n = new Date();
  const m = n.getMonth() + 1;
  const d = n.getDate();
  return `${n.getFullYear()}-${m < 10 ? `0${m}` : m}-${d < 10 ? `0${d}` : d}`;
}

function isMetodoCartao(metodo: string): boolean {
  const m = String(metodo ?? '')
    .trim()
    .toLowerCase();
  return (
    m === 'cartao_credito' ||
    m === 'cartao_debito' ||
    m === 'a_receber_cartao'
  );
}

function codigoFormaCartao(p: CriarPagamentoComandaInput): 'cartao_credito' | 'cartao_debito' {
  const rotulo = String(p.metodo_rotulo ?? '')
    .trim()
    .toLowerCase();
  if (rotulo.includes('débito') || rotulo.includes('debito')) {
    return 'cartao_debito';
  }
  const m = String(p.metodo ?? '')
    .trim()
    .toLowerCase();
  if (m === 'cartao_debito') return 'cartao_debito';
  return 'cartao_credito';
}

/**
 * Recalcula datas de cartão pelas faixas da forma e marca vencimentos futuros
 * como `a_receber_cartao` (baixa automática no vencimento).
 */
export async function normalizarPagamentosCartaoComFaixas(
  db: Db,
  pagamentos: CriarPagamentoComandaInput[],
): Promise<CriarPagamentoComandaInput[]> {
  if (pagamentos.length === 0) return pagamentos;
  const opcoes = await listFormasPagamentoOpcoesApi(db);
  const hoje = ymdHojeLocal();
  const out = pagamentos.map((p) => ({ ...p }));

  type Grupo = {
    indices: number[];
    codigo: 'cartao_credito' | 'cartao_debito';
    n: number;
    numeros: Set<number>;
  };
  const grupos: Grupo[] = [];

  for (let i = 0; i < out.length; i++) {
    const p = out[i]!;
    if (!isMetodoCartao(String(p.metodo))) continue;
    const codigo = codigoFormaCartao(p);
    const n = Math.max(1, Math.floor(Number(p.parcelas_total) || 1));
    const num = Math.max(1, Math.floor(Number(p.parcela_numero) || 1));
    let g = grupos.find(
      (x) => x.codigo === codigo && x.n === n && !x.numeros.has(num),
    );
    if (!g) {
      g = { indices: [], codigo, n, numeros: new Set() };
      grupos.push(g);
    }
    g.indices.push(i);
    g.numeros.add(num);
  }

  for (const g of grupos) {
    const forma = opcoes.find((o) => o.codigo_interno === g.codigo);
    const faixas: FormaPrazoFaixaApi[] = forma?.prazos_faixas ?? [];
    const faixa = resolverFaixaParcelas(faixas, g.n);
    const prazoFallback = forma?.prazo_recebimento ?? 0;

    const datasOriginais = g.indices.map((ix) =>
      String(out[ix]!.data_pagamento ?? hoje).slice(0, 10),
    );
    const minData = [...datasOriginais].sort()[0] ?? hoje;
    const diasPrimeira = faixa?.dias_ate_primeira ?? prazoFallback;
    // Idempotente: se a 1ª já veio com offset, volta à data da venda.
    const dataVenda = ymdAddDays(minData, -diasPrimeira);

    const datas = calcularDatasParcelasCartao({
      dataVendaYmd: dataVenda,
      nParcelas: g.n,
      faixa,
      prazoRecebimentoFallback: prazoFallback,
    });

    for (const ix of g.indices) {
      const p = out[ix]!;
      const num = Math.max(1, Math.floor(Number(p.parcela_numero) || 1));
      const data = datas[num - 1] ?? datas[0] ?? hoje;
      const metodoBase = g.codigo;
      const metodoRotulo =
        String(p.metodo_rotulo ?? '').trim() ||
        (metodoBase === 'cartao_debito'
          ? 'Cartão de débito'
          : 'Cartão de crédito');
      const futuro = data > hoje;
      out[ix] = {
        ...p,
        data_pagamento: data,
        metodo: futuro ? 'a_receber_cartao' : metodoBase,
        metodo_rotulo: metodoRotulo,
        parcela_numero: num,
        parcelas_total: g.n,
        parcelas: 1,
      };
    }
  }

  return out;
}

export interface FaturarComandaComRascunhoInput {
  pagamentos: CriarPagamentoComandaInput[];
  /** Valores pagos a mais que viram saldo em `clientes.credito_saldo` (sem `comanda_pagamentos`). */
  credito_excesso?: CriarPagamentoComandaInput[];
  /** Abate do saldo pré-pago do cliente (campo Crédito no drawer da comanda). */
  credito_cliente_usado?: number;
  /** Passado a `finalizarCobrancaPorIdAtendimento` quando a cobrança ainda não está finalizada. */
  desconto?: unknown;
}

/**
 * Grava N pagamentos da comanda numa transação, finaliza a cobrança se necessário
 * e sincroniza `pagamento_status` (inclui regra «há linha pendente»).
 * Opcionalmente aplica `credito_excesso` na mesma transação (excesso pode ir a crédito
 * no mesmo lote que liquida a comanda, sem exigir quitação prévia no servidor).
 */
export async function faturarComandaComRascunho(
  db: Db,
  idAtendimento: string,
  input: FaturarComandaComRascunhoInput,
): Promise<{ items: PagamentoComandaDTO[]; resumo: ResumoComanda }> {
  const id = String(idAtendimento || '').trim();
  if (!id) throw new Error('id_atendimento é obrigatório');
  const list = await normalizarPagamentosCartaoComFaixas(
    db,
    input.pagamentos ?? [],
  );
  const creditos = input.credito_excesso ?? [];
  const credUsado = toNumberPt(input.credito_cliente_usado);
  const valorCreditoUsado =
    credUsado != null && Number.isFinite(credUsado) && credUsado > 0
      ? Math.round(credUsado * 100) / 100
      : 0;
  if (list.length === 0 && creditos.length === 0 && valorCreditoUsado <= 0) {
    throw new Error('Informe pelo menos um pagamento ou crédito de cliente para faturar.');
  }

  if (list.length > 0) {
    somaValoresPagamentos(list);
  }
  if (creditos.length > 0) {
    somaValoresPagamentos(creditos);
  }

  const [atRow] = await db
    .select({ idCliente: atendimentos.idCliente })
    .from(atendimentos)
    .where(eq(atendimentos.idAtendimento, id))
    .limit(1);
  const idCliente = String(atRow?.idCliente ?? '').trim();
  if (!idCliente) {
    throw new Error('Cliente não encontrado para este atendimento.');
  }

  await db.transaction(async (tx) => {
    if (valorCreditoUsado > 0) {
      await usarCreditoClienteNaComandaEmTx(
        tx,
        id,
        idCliente,
        valorCreditoUsado,
      );
    }
    for (const p of list) {
      await inserirPagamentoComandaEmTx(tx, id, p);
    }
    for (const c of creditos) {
      await aplicarCreditoClientePorExcessoEmTx(tx, id, idCliente, c);
    }
  });

  const [st] = await db
    .select({ cs: atendimentos.cobrancaStatus })
    .from(atendimentos)
    .where(eq(atendimentos.idAtendimento, id))
    .limit(1);
  const jáFinal =
    String(st?.cs ?? '').trim().toLowerCase() === 'finalizada';

  if (!jáFinal) {
    await finalizarCobrancaPorIdAtendimento(
      db,
      id,
      input.desconto ?? undefined,
    );
  }

  await sincronizarPagamentoStatusAtendimento(db, id);
  await recalcularFolhaAposMudancaAtendimento(db, id).catch(() => {});

  const items = await listarPagamentosPorAtendimento(db, id);
  const resumo = await getResumoComanda(db, id);
  return { items, resumo };
}
