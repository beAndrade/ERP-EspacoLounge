import 'dotenv/config';
import { cors } from '@elysiajs/cors';
import { node } from '@elysiajs/node';
import { Elysia, t } from 'elysia';
import { eq } from 'drizzle-orm';
import { db, ensureSchemaPatches } from './db';
import { clientes } from './db/schema';
import { fail, ok } from './lib/envelope';
import { mapPostgresUniqueViolationToPtBr } from './lib/pg-error-message';
import { instantEmDateParaSqlLocalBrasil } from './lib/sql-local-datetime';
import {
  confirmarPagamentoPorIdAtendimento,
  createAtendimento,
  excluirAtendimentoPorIdAtendimento,
  excluirComandaPorIdAtendimento,
  type ModoExclusaoComanda,
  finalizarCobrancaPorIdAtendimento,
  aplicarDescontoComandaPorIdAtendimento,
  listAtendimentosRaw,
  remarcarBlocoAgendamento,
  atualizarAgendaStatusBloco,
  atualizarAgendaCorBloco,
} from './services/atendimentos-domain';
import type { CreateAtendimentoPayload } from './services/atendimentos-domain';
import {
  atualizarStatusOrcamento,
  converterOrcamentoParaProducao,
} from './services/orcamentos-domain';
import { postAtendimentoMutationBody } from './services/atendimentos-api-schemas';
import { faturarComandaComRascunho } from './services/comanda-faturar-batch';
import {
  atualizarDataPagamentoComanda,
  criarPagamentoComanda,
  excluirPagamentoComanda,
  getResumoComanda,
  liquidarPendenciaComandaPorId,
  listarPagamentosPorAtendimento,
} from './services/comanda-pagamentos-domain';
import {
  atualizarMovimentacaoPorId,
  criarDespesaCadastro,
  criarMovimentacaoManual,
  estornarMovimentacaoPagamentoApi,
  excluirMovimentacaoPorId,
  getCaixaDiaApi,
  listCategoriasFinanceirasApi,
  listComissoesDetalhadasApi,
  listComissoesPagasApi,
  listMovimentacoesApi,
  listTransacoesFinanceirasApi,
  marcarMovimentacaoComoPagaApi,
  pagarComissoesApi,
  estornarComissaoMovimentacaoApi,
  excluirComissaoMovimentacaoApi,
} from './services/finance-domain';
import {
  atualizarCategoriaCadastroApi,
  atualizarFormaPagamentoCadastroApi,
  criarCategoriaCadastroApi,
  criarFormaPagamentoCadastroApi,
  excluirCategoriaCadastroApi,
  excluirFormaPagamentoCadastroApi,
  listCategoriasCadastroApi,
  listFormasPagamentoCadastroApi,
  listFormasPagamentoOpcoesApi,
} from './services/finance-cadastros-domain';
import {
  atualizarProfissional,
  criarProfissional,
  getProfissionalById,
  listProfissionaisForApi,
  reordenarProfissionais,
  type ProfissionalWriteInput,
} from './services/profissionais-domain';
import {
  ajustarClienteCreditoManual,
  listClienteCreditoMovimentos,
} from './services/clientes-credito-movimentos';
import {
  allocNextClienteClId,
  deleteClienteById,
  getClienteById,
  listCabelosApi,
  listClientesNormalized,
  listPacotesApi,
  listPacotesQueratinaApi,
  listProdutosApi,
  listRegrasMegaApi,
  listRegrasMegaQueratinaApi,
  listServicosForApi,
  sincronizarNomeClienteEmAtendimentos,
} from './services/queries';
import { columnPatchFromClienteBody } from './services/clientes-cadastro-normalize';
import { assertClienteCadastroUnico } from './services/clientes-unicidade';
import {
  createServico,
  deleteServico,
  updateServico,
  type ServicoWriteInput,
} from './services/servicos-domain';
import {
  atualizarCategoriaCatalogoApi,
  criarCategoriaCatalogoApi,
  excluirCategoriaCatalogoApi,
  listCategoriasCatalogoApi,
} from './services/categorias-catalogo-domain';
import {
  atualizarMarcaCatalogoApi,
  criarMarcaCatalogoApi,
  excluirMarcaCatalogoApi,
  listMarcasCatalogoApi,
} from './services/marcas-catalogo-domain';

const clienteCadastroBodySchema = t.Object({
  nome: t.String(),
  telefone: t.Optional(t.String()),
  notas: t.Optional(t.String()),
  apelido: t.Optional(t.String()),
  email: t.Optional(t.String()),
  celular: t.Optional(t.String()),
  telefoneFixo: t.Optional(t.String()),
  aniversario: t.Optional(t.String()),
  cnpj: t.Optional(t.String()),
  cpf: t.Optional(t.String()),
  rg: t.Optional(t.String()),
  fotoUrl: t.Optional(t.Union([t.String(), t.Null()])),
  notificacoesAtivo: t.Optional(t.Boolean()),
  descontoPadraoTexto: t.Optional(t.String()),
  descontoPadraoModo: t.Optional(t.String()),
  cep: t.Optional(t.String()),
  logradouro: t.Optional(t.String()),
  enderecoNumero: t.Optional(t.String()),
  complemento: t.Optional(t.String()),
  bairro: t.Optional(t.String()),
  estado: t.Optional(t.String()),
  cidade: t.Optional(t.String()),
  instagram: t.Optional(t.String()),
  facebook: t.Optional(t.String()),
});

/** Campos explícitos — TypeBox remove chaves não listadas (ex.: comissão por tamanho). */
const servicoWriteBodySchema = t.Object({
  nome: t.String(),
  tipo: t.Union([t.Literal('Fixo'), t.Literal('Tamanho')]),
  categoria: t.Optional(t.Union([t.String(), t.Null()])),
  mostra_no_site: t.Optional(t.Boolean()),
  descricao: t.Optional(t.Union([t.String(), t.Null()])),
  foto_url: t.Optional(t.Union([t.String(), t.Null()])),
  valor_base: t.Optional(t.Union([t.String(), t.Null()])),
  comissao_fixa: t.Optional(t.Union([t.String(), t.Null()])),
  comissao_pct: t.Optional(t.Union([t.String(), t.Null()])),
  custo_fixo: t.Optional(t.Union([t.String(), t.Null()])),
  preco_curto: t.Optional(t.Union([t.String(), t.Null()])),
  preco_medio: t.Optional(t.Union([t.String(), t.Null()])),
  preco_medio_longo: t.Optional(t.Union([t.String(), t.Null()])),
  preco_longo: t.Optional(t.Union([t.String(), t.Null()])),
  curto: t.Optional(t.Union([t.String(), t.Null()])),
  medio: t.Optional(t.Union([t.String(), t.Null()])),
  m_l: t.Optional(t.Union([t.String(), t.Null()])),
  longo: t.Optional(t.Union([t.String(), t.Null()])),
  duracao_minutos: t.Optional(t.Union([t.Number(), t.Null()])),
  duracao_curto: t.Optional(t.Union([t.Number(), t.Null()])),
  duracao_medio: t.Optional(t.Union([t.Number(), t.Null()])),
  duracao_m_l: t.Optional(t.Union([t.Number(), t.Null()])),
  duracao_longo: t.Optional(t.Union([t.Number(), t.Null()])),
});

const nullableStr = t.Optional(t.Union([t.String(), t.Null()]));

/** POST/PATCH produtos — o front envia `null` em campos vazios (moeda, %, texto). */
const produtoWriteBodySchema = t.Object(
  {
    produto: t.Optional(t.String()),
    nome: t.Optional(t.String()),
    categoria: t.Optional(t.Union([t.String(), t.Null()])),
    marca: nullableStr,
    preco: nullableStr,
    custo: nullableStr,
    estoque_inicial: nullableStr,
    estoque_minimo: nullableStr,
    unidade: nullableStr,
    unidade_equivalente: nullableStr,
    preco_profissional: nullableStr,
    custo_adicional: nullableStr,
    comissao_padrao: nullableStr,
    codigo_item: nullableStr,
    codigo_barras: nullableStr,
    observacoes: nullableStr,
    foto_url: nullableStr,
  },
  { additionalProperties: true },
);

/** Campos explícitos — `additionalProperties` sozinho não preserva `foto_url` no body parseado. */
const profissionalCadastroBodySchema = t.Object({
  nome: t.Optional(t.String()),
  celular: t.Optional(t.String()),
  apelido: t.Optional(t.Union([t.String(), t.Null()])),
  profissao: t.Optional(t.Union([t.String(), t.Null()])),
  aniversario: t.Optional(t.Union([t.String(), t.Null()])),
  cpf_cnpj: t.Optional(t.Union([t.String(), t.Null()])),
  cpfCnpj: t.Optional(t.Union([t.String(), t.Null()])),
  rg: t.Optional(t.Union([t.String(), t.Null()])),
  anotacoes: t.Optional(t.Union([t.String(), t.Null()])),
  ativo: t.Optional(t.Boolean()),
  disponivel_agendamento_online: t.Optional(t.Boolean()),
  disponivelAgendamentoOnline: t.Optional(t.Boolean()),
  gerar_agenda: t.Optional(t.Boolean()),
  gerarAgenda: t.Optional(t.Boolean()),
  recebe_comissao: t.Optional(t.Boolean()),
  recebeComissao: t.Optional(t.Boolean()),
  comissao_listagem_modo: t.Optional(t.String()),
  cep: t.Optional(t.Union([t.String(), t.Null()])),
  logradouro: t.Optional(t.Union([t.String(), t.Null()])),
  endereco_numero: t.Optional(t.Union([t.String(), t.Null()])),
  enderecoNumero: t.Optional(t.Union([t.String(), t.Null()])),
  complemento: t.Optional(t.Union([t.String(), t.Null()])),
  bairro: t.Optional(t.Union([t.String(), t.Null()])),
  estado: t.Optional(t.Union([t.String(), t.Null()])),
  cidade: t.Optional(t.Union([t.String(), t.Null()])),
  foto_url: t.Optional(t.Union([t.String(), t.Null()])),
  fotoUrl: t.Optional(t.Union([t.String(), t.Null()])),
});
import { requireAdminPin } from './lib/admin-pin';
import {
  listFolhaPorPeriodoApi,
  listComissoesResumidasApi,
  recalcularTotaisComissaoFolhaPorPeriodo,
} from './services/folha-domain';
import {
  incrementarEstoqueProduto,
  criarProdutoApi,
  atualizarProdutoApi,
  listServicoProdutosConsumidos,
  replaceServicoProdutosConsumidos,
} from './services/estoque-domain';
import { isPublicApiPath, authenticateRequest } from './lib/auth-guard';
import {
  alterarEmailUsuario,
  alterarSenhaUsuario,
  ensureAdminBootstrap,
  ensureAdminProfissionalLink,
  getUsuarioById,
  getUsuarioByProfissionalId,
  loginUsuario,
  upsertUsuarioForProfissional,
} from './services/auth-domain';
import type { AuthUser } from './services/auth-domain';
import {
  getWhatsappConfigApi,
  saveWhatsappConfigApi,
  testWhatsappConnectionApi,
  sendWhatsappMessageApi,
  listWhatsappLogsApi,
  listWhatsappTemplatesApi,
  updateWhatsappTemplateApi,
} from './services/whatsapp-domain';
import {
  criarAgendamentoPublico,
  listProfissionaisPublic,
  listServicosPublic,
  listSlotsDisponiveisPublic,
} from './services/public-booking-domain';

function requireAdminRole(
  user: AuthUser,
): ReturnType<typeof fail> | null {
  if (user.role !== 'admin') {
    return fail('FORBIDDEN', 'Acesso restrito a administradores.');
  }
  return null;
}

const DEV_CORS_ORIGINS = [
  'http://localhost:4200',
  'http://127.0.0.1:4200',
  'http://[::1]:4200',
];

function corsOrigins(): string[] | true {
  const raw = process.env.CORS_ORIGINS?.trim();
  if (!raw || raw === '*') return true;
  try {
    const p = JSON.parse(raw) as unknown;
    if (Array.isArray(p) && p.every((x) => typeof x === 'string')) {
      const merged = new Set([...p, ...DEV_CORS_ORIGINS]);
      return [...merged];
    }
  } catch {
    /* ignore */
  }
  return DEV_CORS_ORIGINS;
}

await ensureSchemaPatches();
await ensureAdminBootstrap(db);
await ensureAdminProfissionalLink(db);

const bodyFinalizar = t.Object({
  id_atendimento: t.String(),
  desconto: t.Optional(t.String()),
});

async function execFinalizarCobranca(body: {
  id_atendimento?: string;
  desconto?: string;
}) {
  try {
    const id = String(body.id_atendimento || '').trim();
    if (!id) return fail('VALIDATION', 'id_atendimento é obrigatório');
    const n = await finalizarCobrancaPorIdAtendimento(db, id, body.desconto);
    if (!n) {
      return fail(
        'NOT_FOUND',
        'Nenhuma linha encontrada para este atendimento',
      );
    }
    return ok({ atualizadas: n });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return fail('SERVER', msg);
  }
}

async function execConfirmarPagamento(body: {
  id_atendimento?: string;
  metodo?: string;
}) {
  try {
    const id = String(body.id_atendimento || '').trim();
    if (!id) return fail('VALIDATION', 'id_atendimento é obrigatório');
    const metodo =
      body.metodo != null ? String(body.metodo).trim() : undefined;
    const r = await confirmarPagamentoPorIdAtendimento(db, id, metodo);
    if (!r.linhasAtualizadas) {
      return fail(
        'NOT_FOUND',
        'Nenhuma linha finalizada encontrada para confirmar pagamento',
      );
    }
    return ok({
      atualizadas: r.linhasAtualizadas,
      movimentacao_id: r.movimentacaoId,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return fail('SERVER', msg);
  }
}

function parseModoExclusaoComanda(
  body: Record<string, unknown>,
): ModoExclusaoComanda | null {
  const raw = body['modo_exclusao'];
  if (typeof raw === 'string') {
    const m = raw.trim().toLowerCase();
    if (m === 'somente_comanda' || m === 'completo') return m;
  }
  return null;
}

function parseManterCabecalhoPedido(body: Record<string, unknown>): boolean {
  const rawM = body['manter_cabecalho_pedido'];
  return (
    rawM === true ||
    rawM === 1 ||
    (typeof rawM === 'string' &&
      ['1', 'true', 'yes', 'sim'].includes(rawM.trim().toLowerCase()))
  );
}

async function execRemarcarAgendamento(body: {
  id_atendimento?: string;
  profissional_origem_id?: number;
  profissional_destino_id?: number;
  data?: string;
  hora_inicio?: string;
}) {
  try {
    const id = String(body.id_atendimento || '').trim();
    if (!id) return fail('VALIDATION', 'id_atendimento é obrigatório');
    const profOrig = Number(body.profissional_origem_id);
    const profDest = Number(body.profissional_destino_id);
    if (!Number.isFinite(profOrig) || profOrig <= 0) {
      return fail('VALIDATION', 'profissional_origem_id é obrigatório');
    }
    if (!Number.isFinite(profDest) || profDest <= 0) {
      return fail('VALIDATION', 'profissional_destino_id é obrigatório');
    }
    const data = String(body.data || '').trim();
    const horaInicio = String(body.hora_inicio || '').trim();
    if (!data) return fail('VALIDATION', 'data é obrigatória');
    if (!horaInicio) return fail('VALIDATION', 'hora_inicio é obrigatória');
    const r = await remarcarBlocoAgendamento(db, {
      id_atendimento: id,
      profissional_origem_id: profOrig,
      profissional_destino_id: profDest,
      data,
      hora_inicio: horaInicio,
    });
    if (!r.linhasAtualizadas) {
      return fail('NOT_FOUND', 'Nenhuma linha foi atualizada');
    }
    return ok({ linhas_atualizadas: r.linhasAtualizadas });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/inválid|obrigatór|fora do expediente|não é possível/i.test(msg)) {
      return fail('VALIDATION', msg);
    }
    return fail('SERVER', msg);
  }
}

async function execExcluirAtendimento(body: {
  id_atendimento?: string;
  manter_cabecalho_pedido?: boolean;
  modo_exclusao?: string;
}) {
  try {
    const id = String(body.id_atendimento || '').trim();
    if (!id) return fail('VALIDATION', 'id_atendimento é obrigatório');
    const bRec = body as Record<string, unknown>;
    const modo = parseModoExclusaoComanda(bRec);
    let n: number;
    if (modo) {
      n = await excluirComandaPorIdAtendimento(db, id, modo);
    } else if (parseManterCabecalhoPedido(bRec)) {
      n = await excluirAtendimentoPorIdAtendimento(db, id, {
        manterCabecalhoPedido: true,
      });
    } else {
      n = await excluirComandaPorIdAtendimento(db, id, 'completo');
    }
    if (!n && !parseManterCabecalhoPedido(bRec)) {
      return fail('NOT_FOUND', 'Nenhuma linha encontrada para excluir');
    }
    return ok({
      removidas: n,
      modo_exclusao: modo ?? (parseManterCabecalhoPedido(bRec) ? 'legado_manter_pedido' : 'completo'),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/Não é possível excluir uma comanda com pagamentos/i.test(msg)) {
      return fail('VALIDATION', msg);
    }
    return fail('SERVER', msg);
  }
}

async function execAtualizarAgendaStatus(body: {
  id_atendimento?: string;
  agenda_status?: string;
}) {
  try {
    const id = String(body.id_atendimento || '').trim();
    if (!id) return fail('VALIDATION', 'id_atendimento é obrigatório');
    const status = String(body.agenda_status || '').trim();
    if (!status) return fail('VALIDATION', 'agenda_status é obrigatório');
    const r = await atualizarAgendaStatusBloco(db, {
      id_atendimento: id,
      agenda_status: status,
    });
    if (!r.linhasAtualizadas) {
      return fail('NOT_FOUND', 'Nenhuma linha foi atualizada');
    }
    return ok({ linhas_atualizadas: r.linhasAtualizadas });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/inválid|obrigatór|nenhuma linha/i.test(msg)) {
      return fail('VALIDATION', msg);
    }
    return fail('SERVER', msg);
  }
}

async function execAtualizarAgendaCor(body: {
  id_atendimento?: string;
  agenda_cor?: string | null;
}) {
  try {
    const id = String(body.id_atendimento || '').trim();
    if (!id) return fail('VALIDATION', 'id_atendimento é obrigatório');
    const r = await atualizarAgendaCorBloco(db, {
      id_atendimento: id,
      agenda_cor:
        body.agenda_cor === undefined || body.agenda_cor === null
          ? null
          : String(body.agenda_cor),
    });
    if (!r.linhasAtualizadas) {
      return fail('NOT_FOUND', 'Nenhuma linha foi atualizada');
    }
    return ok({ linhas_atualizadas: r.linhasAtualizadas });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/inválid|obrigatór|nenhuma linha/i.test(msg)) {
      return fail('VALIDATION', msg);
    }
    return fail('SERVER', msg);
  }
}

async function handleComissoesResumidasGet(
  query: Record<string, string | undefined>,
) {
  try {
    const dataInicio = String(
      query.dataInicio ?? query.data_inicio ?? '',
    ).trim();
    const dataFim = String(query.dataFim ?? query.data_fim ?? '').trim();
    const profRaw = String(
      query.profissionalId ?? query.profissional_id ?? '',
    ).trim();
    const profissionalId = profRaw ? Number(profRaw) : null;
    const items = await listComissoesResumidasApi(db, {
      dataInicio,
      dataFim,
      profissionalId:
        profissionalId != null && Number.isFinite(profissionalId) && profissionalId > 0
          ? profissionalId
          : null,
    });
    return ok({ items });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (
      msg.includes('obrigatórias') ||
      msg.includes('não pode ser posterior')
    ) {
      return fail('VALIDATION', msg);
    }
    return fail('SERVER', msg);
  }
}

async function handleComissoesPagasGet(
  query: Record<string, string | undefined>,
) {
  try {
    const dataInicio = String(
      query.dataInicio ?? query.data_inicio ?? '',
    ).trim();
    const dataFim = String(query.dataFim ?? query.data_fim ?? '').trim();
    const profRaw = String(
      query.profissionalId ?? query.profissional_id ?? '',
    ).trim();
    const profissionalId = profRaw ? Number(profRaw) : null;
    const items = await listComissoesPagasApi(db, {
      dataInicio,
      dataFim,
      profissionalId:
        profissionalId != null && Number.isFinite(profissionalId) && profissionalId > 0
          ? profissionalId
          : null,
    });
    return ok({ items });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (
      msg.includes('obrigatórias') ||
      msg.includes('não pode ser posterior')
    ) {
      return fail('VALIDATION', msg);
    }
    return fail('SERVER', msg);
  }
}

async function handleComissoesDetalhadasGet(
  query: Record<string, string | undefined>,
) {
  try {
    const dataInicio = String(
      query.dataInicio ?? query.data_inicio ?? '',
    ).trim();
    const dataFim = String(query.dataFim ?? query.data_fim ?? '').trim();
    const profRaw = String(
      query.profissionalId ?? query.profissional_id ?? '',
    ).trim();
    const profissionalId = Number(profRaw);
    const mostrarAnteriores =
      query.mostrarAnteriores === '1' ||
      query.mostrarAnteriores === 'true' ||
      query.mostrar_anteriores === '1' ||
      query.mostrar_anteriores === 'true';
    const items = await listComissoesDetalhadasApi(db, {
      dataInicio,
      dataFim,
      profissionalId,
      mostrarAnteriores,
    });
    return ok({
      items,
      fonte: 'atendimentos',
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (
      msg.includes('obrigatórias') ||
      msg.includes('obrigatório') ||
      msg.includes('não pode ser posterior')
    ) {
      return fail('VALIDATION', msg);
    }
    return fail('SERVER', msg);
  }
}

async function handleComissoesPagarPost(body: {
  profissional_id?: number;
  data_pagamento?: string;
  atendimento_ids?: number[];
  pagamentos?: { metodo?: string; valor?: number }[];
}) {
  try {
    const result = await pagarComissoesApi(db, {
      profissional_id: Number(body.profissional_id),
      data_pagamento: String(body.data_pagamento ?? ''),
      atendimento_ids: (body.atendimento_ids ?? []).map((x) => Number(x)),
      pagamentos: (body.pagamentos ?? []).map((p) => ({
        metodo: String(p.metodo ?? ''),
        valor: Number(p.valor),
      })),
    });
    return ok(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (
      msg.includes('obrigatório') ||
      msg.includes('obrigatória') ||
      msg.includes('inválid') ||
      msg.includes('coincidir') ||
      msg.includes('Selecione') ||
      msg.includes('Informe') ||
      msg.includes('já foram') ||
      msg.includes('não foram')
    ) {
      return fail('VALIDATION', msg);
    }
    return fail('SERVER', msg);
  }
}

function parseBoolField(v: unknown): boolean | undefined {
  if (v === undefined) return undefined;
  if (v === false || v === 0 || v === '0' || v === 'false') return false;
  return Boolean(v);
}

function profissionalBodyFromRequest(body: unknown): ProfissionalWriteInput {
  const b = body as Record<string, unknown>;
  const out: ProfissionalWriteInput = {};
  if (b.nome !== undefined) out.nome = String(b.nome);
  if (b.celular !== undefined) out.celular = String(b.celular);
  if (b.apelido !== undefined) out.apelido = String(b.apelido ?? '');
  if (b.profissao !== undefined) out.profissao = String(b.profissao ?? '');
  if (b.aniversario !== undefined) {
    out.aniversario = String(b.aniversario ?? '');
  }
  if (b.cpf_cnpj !== undefined || b.cpfCnpj !== undefined) {
    out.cpf_cnpj = String(b.cpf_cnpj ?? b.cpfCnpj ?? '');
  }
  if (b.rg !== undefined) out.rg = String(b.rg ?? '');
  if (b.anotacoes !== undefined) out.anotacoes = String(b.anotacoes ?? '');
  const ativo = parseBoolField(b.ativo);
  if (ativo !== undefined) out.ativo = ativo;
  const disp = parseBoolField(
    b.disponivel_agendamento_online ?? b.disponivelAgendamentoOnline,
  );
  if (disp !== undefined) out.disponivel_agendamento_online = disp;
  const gerar = parseBoolField(b.gerar_agenda ?? b.gerarAgenda);
  if (gerar !== undefined) out.gerar_agenda = gerar;
  const recebe = parseBoolField(b.recebe_comissao ?? b.recebeComissao);
  if (recebe !== undefined) out.recebe_comissao = recebe;
  if (b.comissao_listagem_modo !== undefined) {
    out.comissao_listagem_modo = String(b.comissao_listagem_modo).trim() as
      | 'pagamento_cliente'
      | 'competencia';
  }
  if (b.cep !== undefined) out.cep = String(b.cep ?? '');
  if (b.logradouro !== undefined) out.logradouro = String(b.logradouro ?? '');
  if (b.endereco_numero !== undefined || b.enderecoNumero !== undefined) {
    out.endereco_numero = String(b.endereco_numero ?? b.enderecoNumero ?? '');
  }
  if (b.complemento !== undefined) {
    out.complemento = String(b.complemento ?? '');
  }
  if (b.bairro !== undefined) out.bairro = String(b.bairro ?? '');
  if (b.estado !== undefined) out.estado = String(b.estado ?? '');
  if (b.cidade !== undefined) out.cidade = String(b.cidade ?? '');
  if (b.foto_url !== undefined || b.fotoUrl !== undefined) {
    const raw = b.foto_url ?? b.fotoUrl;
    out.foto_url = raw === null ? null : String(raw ?? '');
  }
  return out;
}

const app = new Elysia({ adapter: node() })
  .use(
    cors({
      origin: corsOrigins(),
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'X-Admin-Pin', 'Authorization'],
    }),
  )
  .onBeforeHandle(async ({ request, set }) => {
    const url = new URL(request.url);
    if (isPublicApiPath(url.pathname, request.method)) return;
    const auth = await authenticateRequest(request);
    if (!auth.ok) {
      set.status = 401;
      return auth.response;
    }
  })
  .onAfterHandle(({ request, set }) => {
    /**
     * Evita o browser devolver GET antigo após excluir/recriar o mesmo
     * `id_atendimento` na edição de itens da comanda.
     */
    if (request.method === 'GET') {
      set.headers['cache-control'] = 'no-store, no-cache, must-revalidate';
      set.headers['pragma'] = 'no-cache';
    }
  })
  .get('/health', () =>
    ok({
      status: 'up',
      time: instantEmDateParaSqlLocalBrasil(new Date()) ?? '',
    }),
  )
  .post(
    '/api/auth/login',
    async ({ body }) => {
      try {
        const b = body as { email?: string; senha?: string };
        const result = await loginUsuario(
          db,
          String(b.email ?? ''),
          String(b.senha ?? ''),
        );
        if (!result.ok) return fail('UNAUTHORIZED', result.message);
        return ok({ token: result.token, user: result.user });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return fail('SERVER', msg);
      }
    },
    {
      body: t.Object({
        email: t.String(),
        senha: t.String(),
      }),
    },
  )
  .get('/api/auth/me', async ({ request }) => {
    const auth = await authenticateRequest(request);
    if (!auth.ok) return auth.response;
    const item = await getUsuarioById(db, auth.user.id);
    if (!item) return fail('NOT_FOUND', 'Usuário não encontrado');
    return ok({ user: item });
  })
  .patch(
    '/api/auth/me/email',
    async ({ request, body }) => {
      const auth = await authenticateRequest(request);
      if (!auth.ok) return auth.response;
      try {
        const b = body as { email?: string; senha_atual?: string };
        const result = await alterarEmailUsuario(db, auth.user.id, {
          email: String(b.email ?? ''),
          senha_atual: String(b.senha_atual ?? ''),
        });
        return ok(result);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/obrigatório|incorreta|em uso/i.test(msg)) {
          return fail('VALIDATION', msg);
        }
        return fail('SERVER', msg);
      }
    },
    {
      body: t.Object({
        email: t.String(),
        senha_atual: t.String(),
      }),
    },
  )
  .patch(
    '/api/auth/me/senha',
    async ({ request, body }) => {
      const auth = await authenticateRequest(request);
      if (!auth.ok) return auth.response;
      try {
        const b = body as {
          senha_atual?: string;
          senha_nova?: string;
          senha_nova_confirmacao?: string;
        };
        await alterarSenhaUsuario(db, auth.user.id, {
          senha_atual: String(b.senha_atual ?? ''),
          senha_nova: String(b.senha_nova ?? ''),
          senha_nova_confirmacao: String(b.senha_nova_confirmacao ?? ''),
        });
        return ok({ ok: true });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (
          /obrigatório|incorreta|coincide|caracteres/i.test(msg)
        ) {
          return fail('VALIDATION', msg);
        }
        return fail('SERVER', msg);
      }
    },
    {
      body: t.Object({
        senha_atual: t.String(),
        senha_nova: t.String(),
        senha_nova_confirmacao: t.String(),
      }),
    },
  )
  .get('/api/public/servicos', async () => {
    try {
      const items = await listServicosPublic(db);
      return ok({ items });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return fail('SERVER', msg);
    }
  })
  .get('/api/public/profissionais', async () => {
    try {
      const items = await listProfissionaisPublic(db);
      return ok({ items });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return fail('SERVER', msg);
    }
  })
  .get('/api/public/disponibilidade', async ({ query }) => {
    try {
      const q = query as Record<string, string | undefined>;
      const result = await listSlotsDisponiveisPublic(db, {
        profissional_id: Number(q.profissional_id),
        data: String(q.data ?? ''),
        servico_id: String(q.servico_id ?? ''),
        tamanho: q.tamanho,
      });
      return ok(result);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/inválid|obrigatório|não encontrado|não disponível/i.test(msg)) {
        return fail('VALIDATION', msg);
      }
      return fail('SERVER', msg);
    }
  })
  .post(
    '/api/public/agendamentos',
    async ({ body }) => {
      try {
        const b = body as {
          nome?: string;
          telefone?: string;
          email?: string;
          servico_id?: string;
          profissional_id?: number;
          data?: string;
          hora?: string;
          tamanho?: string;
          observacao?: string;
        };
        const result = await criarAgendamentoPublico(db, {
          nome: String(b.nome ?? ''),
          telefone: String(b.telefone ?? ''),
          email: b.email,
          servico_id: String(b.servico_id ?? ''),
          profissional_id: Number(b.profissional_id),
          data: String(b.data ?? ''),
          hora: String(b.hora ?? ''),
          tamanho: b.tamanho,
          observacao: b.observacao,
        });
        return ok(result);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (
          /inválid|obrigatório|não encontrado|não disponível|não está mais/i.test(
            msg,
          )
        ) {
          return fail('VALIDATION', msg);
        }
        return fail('SERVER', msg);
      }
    },
    {
      body: t.Object({
        nome: t.String(),
        telefone: t.String(),
        email: t.Optional(t.String()),
        servico_id: t.String(),
        profissional_id: t.Number(),
        data: t.String(),
        hora: t.String(),
        tamanho: t.Optional(t.String()),
        observacao: t.Optional(t.String()),
      }),
    },
  )
  .get('/api/financeiro/comissoes/detalhadas', async ({ query }) =>
    handleComissoesDetalhadasGet(query as Record<string, string | undefined>),
  )
  .get('/api/financeiro/comissoes/pagas', async ({ query }) =>
    handleComissoesPagasGet(query as Record<string, string | undefined>),
  )
  .get('/api/financeiro/comissoes/resumidas', async ({ query }) =>
    handleComissoesResumidasGet(query as Record<string, string | undefined>),
  )
  .post(
    '/api/financeiro/comissoes/pagar',
    async ({ body, set }) => {
      set.status = 200;
      set.headers['content-type'] = 'application/json; charset=utf-8';
      return handleComissoesPagarPost(
        body as {
          profissional_id?: number;
          data_pagamento?: string;
          atendimento_ids?: number[];
          pagamentos?: { metodo?: string; valor?: number }[];
        },
      );
    },
    {
      body: t.Object({
        profissional_id: t.Number(),
        data_pagamento: t.String(),
        atendimento_ids: t.Array(t.Number()),
        pagamentos: t.Array(
          t.Object({
            metodo: t.String(),
            valor: t.Number(),
          }),
        ),
      }),
    },
  )
  .post(
    '/api/financeiro/comissoes/estornar',
    async ({ body, set }) => {
      set.status = 200;
      set.headers['content-type'] = 'application/json; charset=utf-8';
      try {
        const result = await estornarComissaoMovimentacaoApi(
          db,
          Number((body as { movimentacao_id?: number }).movimentacao_id),
        );
        return ok({ ok: true, periodos_ym: result.periodos_ym });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (
          msg.includes('inválid') ||
          msg.includes('não encontrada') ||
          msg.includes('não é um')
        ) {
          return fail('VALIDATION', msg);
        }
        return fail('SERVER', msg);
      }
    },
    { body: t.Object({ movimentacao_id: t.Number() }) },
  )
  .post(
    '/api/financeiro/comissoes/excluir',
    async ({ body, set }) => {
      set.status = 200;
      set.headers['content-type'] = 'application/json; charset=utf-8';
      try {
        const result = await excluirComissaoMovimentacaoApi(
          db,
          Number((body as { movimentacao_id?: number }).movimentacao_id),
        );
        return ok({ ok: true, periodos_ym: result.periodos_ym });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (
          msg.includes('inválid') ||
          msg.includes('não encontrada') ||
          msg.includes('não é um')
        ) {
          return fail('VALIDATION', msg);
        }
        return fail('SERVER', msg);
      }
    },
    { body: t.Object({ movimentacao_id: t.Number() }) },
  )
  .get('/api/clientes', async () => ok({ items: await listClientesNormalized(db) }))
  .get(
    '/api/clientes/:id',
    async ({ params }) => {
      const item = await getClienteById(db, params.id);
      if (!item) return fail('NOT_FOUND', 'Cliente não encontrado');
      return ok({ item });
    },
    { params: t.Object({ id: t.String() }) },
  )
  .get(
    '/api/clientes/:id/credito-movimentos',
    async ({ params }) => {
      const item = await getClienteById(db, params.id);
      if (!item) return fail('NOT_FOUND', 'Cliente não encontrado');
      const items = await listClienteCreditoMovimentos(db, params.id);
      return ok({ items });
    },
    { params: t.Object({ id: t.String() }) },
  )
  .post(
    '/api/clientes/:id/credito-movimentos',
    async ({ params, body }) => {
      const item = await getClienteById(db, params.id);
      if (!item) return fail('NOT_FOUND', 'Cliente não encontrado');
      const tipoRaw = String(body.tipo ?? '').trim().toLowerCase();
      const tipo =
        tipoRaw === 'saida' || tipoRaw === 'retirar' || tipoRaw === 'remover'
          ? ('saida' as const)
          : ('entrada' as const);
      try {
        const result = await ajustarClienteCreditoManual(db, params.id, {
          valor: body.valor,
          tipo,
          motivo: body.motivo,
          gerar_movimentacao_financeira: body.gerar_movimentacao_financeira,
        });
        return ok({
          saldo: result.saldo,
          item: result.movimento,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return fail('VALIDATION', msg);
      }
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        valor: t.Number({ minimum: 0.01 }),
        tipo: t.Union([
          t.Literal('entrada'),
          t.Literal('saida'),
          t.Literal('adicionar'),
          t.Literal('retirar'),
        ]),
        motivo: t.Optional(t.String({ maxLength: 400 })),
        gerar_movimentacao_financeira: t.Optional(t.Boolean()),
      }),
    },
  )
  .post(
    '/api/clientes',
    async ({ body }) => {
      const nome = String(body.nome || '').trim();
      if (!nome) return fail('VALIDATION', 'Nome do cliente é obrigatório');
      try {
        await assertClienteCadastroUnico(db, { ...body, nome });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return fail('VALIDATION', msg);
      }
      const telefone =
        body.telefone != null ? String(body.telefone).trim() || null : null;
      const cadastroPatch = columnPatchFromClienteBody(body);

      for (let attempt = 0; attempt < 8; attempt++) {
        const id = await allocNextClienteClId(db);
        try {
          await db.insert(clientes).values({
            idCliente: id,
            nomeExibido: nome,
            telefone,
            ...cadastroPatch,
          });
          const item = await getClienteById(db, id);
          if (!item) {
            return fail(
              'SERVER',
              'Cliente criado mas não foi possível carregar o registo.',
            );
          }
          return ok(item);
        } catch (e) {
          const code =
            e && typeof e === 'object' && 'code' in e
              ? String((e as { code?: string }).code)
              : '';
          if (code === '23505') continue;
          const msg = e instanceof Error ? e.message : String(e);
          return fail('SERVER', msg);
        }
      }
      return fail('SERVER', 'Não foi possível gerar ID de cliente único.');
    },
    { body: clienteCadastroBodySchema },
  )
  .patch(
    '/api/clientes/:id',
    async ({ params, body }) => {
      const nome = String(body.nome || '').trim();
      if (!nome) return fail('VALIDATION', 'Nome exibido é obrigatório');
      const id = params.id.trim();
      try {
        await assertClienteCadastroUnico(db, { ...body, nome }, {
          excludeClienteId: id,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return fail('VALIDATION', msg);
      }

      const patchPayload = {
        nomeExibido: nome,
        telefone:
          body.telefone != null ? String(body.telefone).trim() || null : null,
        ...columnPatchFromClienteBody(body, { partial: true }),
      };

      const updated = await db
        .update(clientes)
        .set(patchPayload)
        .where(eq(clientes.idCliente, id))
        .returning();
      if (!updated.length) return fail('NOT_FOUND', 'Cliente não encontrado');

      await sincronizarNomeClienteEmAtendimentos(db, id, nome);

      const item = await getClienteById(db, id);
      if (!item) return fail('NOT_FOUND', 'Cliente não encontrado');
      return ok(item);
    },
    {
      params: t.Object({ id: t.String() }),
      body: clienteCadastroBodySchema,
    },
  )
  .delete(
    '/api/clientes/:id',
    async ({ params }) => {
      const id = String(params.id || '').trim();
      if (!id) return fail('VALIDATION', 'id é obrigatório');
      try {
        const removed = await deleteClienteById(db, id);
        if (!removed) return fail('NOT_FOUND', 'Cliente não encontrado');
        return ok({ ok: true });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return fail('SERVER', msg);
      }
    },
    { params: t.Object({ id: t.String() }) },
  )
  .get('/api/servicos', async () => ok({ items: await listServicosForApi(db) }))
  .post(
    '/api/servicos',
    async ({ body }) => {
      try {
        const item = await createServico(db, body as ServicoWriteInput);
        return ok({ item });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/obrigatório|inválido|Duração/i.test(msg)) {
          return fail('VALIDATION', msg);
        }
        return fail('SERVER', msg);
      }
    },
    {
      body: servicoWriteBodySchema,
    },
  )
  .patch(
    '/api/servicos/:id',
    async ({ params, body }) => {
      try {
        const item = await updateServico(
          db,
          params.id,
          body as ServicoWriteInput,
        );
        return ok({ item });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/não encontrado/i.test(msg)) return fail('NOT_FOUND', msg);
        if (/obrigatório|inválido|Duração/i.test(msg)) {
          return fail('VALIDATION', msg);
        }
        return fail('SERVER', msg);
      }
    },
    {
      params: t.Object({ id: t.String() }),
      body: servicoWriteBodySchema,
    },
  )
  .delete(
    '/api/servicos/:id',
    async ({ params }) => {
      try {
        const r = await deleteServico(db, params.id);
        return ok(r);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/não encontrado/i.test(msg)) return fail('NOT_FOUND', msg);
        if (/Não é possível excluir/i.test(msg)) {
          return fail('VALIDATION', msg);
        }
        return fail('SERVER', msg);
      }
    },
    { params: t.Object({ id: t.String() }) },
  )
  .get('/api/servicos/:id/produtos-consumidos', async ({ params }) => {
    try {
      const id = Number.parseInt(String(params.id), 10);
      if (!Number.isFinite(id) || id <= 0) {
        return fail('VALIDATION', 'id inválido');
      }
      const items = await listServicoProdutosConsumidos(db, id);
      return ok({ items });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/inválido/i.test(msg)) return fail('VALIDATION', msg);
      return fail('SERVER', msg);
    }
  })
  .put(
    '/api/servicos/:id/produtos-consumidos',
    async ({ params, body }) => {
      try {
        const id = Number.parseInt(String(params.id), 10);
        if (!Number.isFinite(id) || id <= 0) {
          return fail('VALIDATION', 'id inválido');
        }
        const b = body as { items?: unknown };
        const rawItems = Array.isArray(b.items) ? b.items : [];
        const items = rawItems.map((row) => {
          const r = row as Record<string, unknown>;
          return {
            produto_id: Number(r.produto_id ?? r.produtoId),
            quantidade: r.quantidade as number | string,
          };
        });
        const saved = await replaceServicoProdutosConsumidos(db, id, items);
        return ok({ items: saved });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/inválido|duplicado|maior que zero|não existem|receita/i.test(msg)) {
          return fail('VALIDATION', msg);
        }
        return fail('SERVER', msg);
      }
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object(
        {
          items: t.Array(
            t.Object(
              {
                produto_id: t.Optional(t.Number()),
                produtoId: t.Optional(t.Number()),
                quantidade: t.Union([t.Number(), t.String()]),
              },
              { additionalProperties: true },
            ),
          ),
        },
        { additionalProperties: true },
      ),
    },
  )
  .get('/api/regras-mega', async () => ok({ items: await listRegrasMegaApi(db) }))
  .get('/api/pacotes', async () => ok({ items: await listPacotesApi(db) }))
  .get('/api/regras-mega-queratina', async () =>
    ok({ items: await listRegrasMegaQueratinaApi(db) }),
  )
  .get('/api/pacotes-queratina', async () =>
    ok({ items: await listPacotesQueratinaApi(db) }),
  )
  .get('/api/produtos', async () => ok({ items: await listProdutosApi(db) }))
  .get('/api/categorias', async ({ query }) => {
    try {
      const q = query as Record<string, string | undefined>;
      const incluirInativas =
        q.incluir_inativas === '1' || q.incluirInativas === '1';
      return ok({
        items: await listCategoriasCatalogoApi(db, { incluirInativas }),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return fail('SERVER', msg);
    }
  })
  .post(
    '/api/categorias',
    async ({ body }) => {
      try {
        const b = body as { nome?: string; ativo?: boolean };
        const id = await criarCategoriaCatalogoApi(db, {
          nome: String(b.nome ?? ''),
          ativo: b.ativo,
        });
        return ok({ id });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return fail('VALIDATION', msg);
      }
    },
    {
      body: t.Object({
        nome: t.String(),
        ativo: t.Optional(t.Boolean()),
      }),
    },
  )
  .patch(
    '/api/categorias/:id',
    async ({ params, body }) => {
      try {
        const id = Number.parseInt(String(params.id), 10);
        if (!Number.isFinite(id) || id <= 0) {
          return fail('VALIDATION', 'id inválido');
        }
        const b = body as { nome?: string; ativo?: boolean };
        await atualizarCategoriaCatalogoApi(db, id, {
          nome: b.nome !== undefined ? String(b.nome) : undefined,
          ativo: b.ativo,
        });
        return ok({ ok: true });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes('não encontrada')) return fail('NOT_FOUND', msg);
        return fail('VALIDATION', msg);
      }
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        nome: t.Optional(t.String()),
        ativo: t.Optional(t.Boolean()),
      }),
    },
  )
  .delete('/api/categorias/:id', async ({ params }) => {
    try {
      const id = Number.parseInt(String(params.id), 10);
      if (!Number.isFinite(id) || id <= 0) {
        return fail('VALIDATION', 'id inválido');
      }
      const result = await excluirCategoriaCatalogoApi(db, id);
      return ok({ ok: true, result });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('não encontrada')) return fail('NOT_FOUND', msg);
      return fail('VALIDATION', msg);
    }
  })
  .get('/api/marcas', async ({ query }) => {
    try {
      const q = query as Record<string, string | undefined>;
      const incluirInativas =
        q.incluir_inativas === '1' || q.incluirInativas === '1';
      return ok({
        items: await listMarcasCatalogoApi(db, { incluirInativas }),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return fail('SERVER', msg);
    }
  })
  .post(
    '/api/marcas',
    async ({ body }) => {
      try {
        const b = body as { nome?: string; ativo?: boolean };
        const id = await criarMarcaCatalogoApi(db, {
          nome: String(b.nome ?? ''),
          ativo: b.ativo,
        });
        return ok({ id });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return fail('VALIDATION', msg);
      }
    },
    {
      body: t.Object({
        nome: t.String(),
        ativo: t.Optional(t.Boolean()),
      }),
    },
  )
  .patch(
    '/api/marcas/:id',
    async ({ params, body }) => {
      try {
        const id = Number.parseInt(String(params.id), 10);
        if (!Number.isFinite(id) || id <= 0) {
          return fail('VALIDATION', 'id inválido');
        }
        const b = body as { nome?: string; ativo?: boolean };
        await atualizarMarcaCatalogoApi(db, id, {
          nome: b.nome !== undefined ? String(b.nome) : undefined,
          ativo: b.ativo,
        });
        return ok({ ok: true });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes('não encontrada')) return fail('NOT_FOUND', msg);
        return fail('VALIDATION', msg);
      }
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        nome: t.Optional(t.String()),
        ativo: t.Optional(t.Boolean()),
      }),
    },
  )
  .delete('/api/marcas/:id', async ({ params }) => {
    try {
      const id = Number.parseInt(String(params.id), 10);
      if (!Number.isFinite(id) || id <= 0) {
        return fail('VALIDATION', 'id inválido');
      }
      const result = await excluirMarcaCatalogoApi(db, id);
      return ok({ ok: true, result });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('não encontrada')) return fail('NOT_FOUND', msg);
      return fail('VALIDATION', msg);
    }
  })
  .post(
    '/api/produtos',
    async ({ body }) => {
      try {
        const b = body as Record<string, unknown>;
        const item = await criarProdutoApi(db, {
          produto: String(b.produto ?? b.nome ?? ''),
          categoria: b.categoria != null ? String(b.categoria) : null,
          marca: b.marca != null ? String(b.marca) : null,
          preco: b.preco != null ? String(b.preco) : null,
          custo: b.custo != null ? String(b.custo) : null,
          estoque_inicial:
            b.estoque_inicial != null
              ? String(b.estoque_inicial)
              : b.estoqueInicial != null
                ? String(b.estoqueInicial)
                : null,
          estoque_minimo:
            b.estoque_minimo != null
              ? String(b.estoque_minimo)
              : b.estoqueMinimo != null
                ? String(b.estoqueMinimo)
                : null,
          unidade: b.unidade != null ? String(b.unidade) : null,
          unidade_equivalente:
            b.unidade_equivalente != null
              ? String(b.unidade_equivalente)
              : b.unidadeEquivalente != null
                ? String(b.unidadeEquivalente)
                : null,
          preco_profissional:
            b.preco_profissional != null
              ? String(b.preco_profissional)
              : b.precoProfissional != null
                ? String(b.precoProfissional)
                : null,
          custo_adicional:
            b.custo_adicional != null
              ? String(b.custo_adicional)
              : b.custoAdicional != null
                ? String(b.custoAdicional)
                : null,
          comissao_padrao:
            b.comissao_padrao != null
              ? String(b.comissao_padrao)
              : b.comissaoPadrao != null
                ? String(b.comissaoPadrao)
                : null,
          codigo_item:
            b.codigo_item != null
              ? String(b.codigo_item)
              : b.codigoItem != null
                ? String(b.codigoItem)
                : null,
          codigo_barras:
            b.codigo_barras != null
              ? String(b.codigo_barras)
              : b.codigoBarras != null
                ? String(b.codigoBarras)
                : null,
          observacoes: b.observacoes != null ? String(b.observacoes) : null,
          foto_url:
            b.foto_url != null
              ? String(b.foto_url)
              : b.fotoUrl != null
                ? String(b.fotoUrl)
                : null,
        });
        return ok({ item });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/informe|categoria|nome/i.test(msg)) {
          return fail('VALIDATION', msg);
        }
        return fail('SERVER', msg);
      }
    },
    { body: produtoWriteBodySchema },
  )
  .patch(
    '/api/produtos/:id',
    async ({ params, body }) => {
      try {
        const id = Number(params.id);
        const b = body as Record<string, unknown>;
        const item = await atualizarProdutoApi(db, id, {
          produto: String(b.produto ?? b.nome ?? ''),
          categoria: b.categoria != null ? String(b.categoria) : null,
          marca: b.marca != null ? String(b.marca) : null,
          preco: b.preco != null ? String(b.preco) : null,
          custo: b.custo != null ? String(b.custo) : null,
          estoque_inicial:
            b.estoque_inicial != null
              ? String(b.estoque_inicial)
              : b.estoqueInicial != null
                ? String(b.estoqueInicial)
                : null,
          estoque_minimo:
            b.estoque_minimo != null
              ? String(b.estoque_minimo)
              : b.estoqueMinimo != null
                ? String(b.estoqueMinimo)
                : null,
          unidade: b.unidade != null ? String(b.unidade) : null,
          unidade_equivalente:
            b.unidade_equivalente != null
              ? String(b.unidade_equivalente)
              : b.unidadeEquivalente != null
                ? String(b.unidadeEquivalente)
                : null,
          preco_profissional:
            b.preco_profissional != null
              ? String(b.preco_profissional)
              : b.precoProfissional != null
                ? String(b.precoProfissional)
                : null,
          custo_adicional:
            b.custo_adicional != null
              ? String(b.custo_adicional)
              : b.custoAdicional != null
                ? String(b.custoAdicional)
                : null,
          comissao_padrao:
            b.comissao_padrao != null
              ? String(b.comissao_padrao)
              : b.comissaoPadrao != null
                ? String(b.comissaoPadrao)
                : null,
          codigo_item:
            b.codigo_item != null
              ? String(b.codigo_item)
              : b.codigoItem != null
                ? String(b.codigoItem)
                : null,
          codigo_barras:
            b.codigo_barras != null
              ? String(b.codigo_barras)
              : b.codigoBarras != null
                ? String(b.codigoBarras)
                : null,
          observacoes: b.observacoes != null ? String(b.observacoes) : null,
          foto_url:
            b.foto_url != null
              ? String(b.foto_url)
              : b.fotoUrl != null
                ? String(b.fotoUrl)
                : null,
        });
        return ok({ item });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes('não encontrado')) return fail('NOT_FOUND', msg);
        if (/informe|categoria|nome|inválido/i.test(msg)) {
          return fail('VALIDATION', msg);
        }
        return fail('SERVER', msg);
      }
    },
    {
      params: t.Object({ id: t.String() }),
      body: produtoWriteBodySchema,
    },
  )
  .patch(
    '/api/produtos/:id/estoque',
    async ({ params, body }) => {
      try {
        const id = Number.parseInt(String(params.id ?? '').trim(), 10);
        if (!Number.isFinite(id) || id <= 0) {
          return fail('VALIDATION', 'id inválido');
        }
        const b = body as {
          adicionar?: unknown;
          adicionar_unidades?: unknown;
          adicionarUnidades?: unknown;
        };
        const adicionarRaw = b.adicionar;
        const unidadesRaw = b.adicionar_unidades ?? b.adicionarUnidades;
        const item = await incrementarEstoqueProduto(db, id, {
          adicionar:
            adicionarRaw != null && adicionarRaw !== ''
              ? Number(adicionarRaw)
              : undefined,
          adicionar_unidades:
            unidadesRaw != null && unidadesRaw !== ''
              ? Number(unidadesRaw)
              : undefined,
        });
        return ok({ item });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/não encontrado/i.test(msg)) return fail('NOT_FOUND', msg);
        if (/maior que zero|inteiro|Informe adicionar/i.test(msg)) {
          return fail('VALIDATION', msg);
        }
        return fail('SERVER', msg);
      }
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object(
        {
          adicionar: t.Optional(t.Number()),
          adicionar_unidades: t.Optional(t.Number()),
          adicionarUnidades: t.Optional(t.Number()),
        },
        { additionalProperties: true },
      ),
    },
  )
  .get('/api/cabelos', async () => ok({ items: await listCabelosApi(db) }))
  .group('/api', (api) =>
    api
      /** POST antes do GET: evita edge cases em alguns ambientes com o mesmo prefixo. */
      .post(
        '/profissionais',
        async ({ body }) => {
          try {
            const input = profissionalBodyFromRequest(body);
            if (!input.nome?.trim()) {
              return fail('VALIDATION', 'Nome é obrigatório');
            }
            if (!input.celular?.trim()) {
              return fail('VALIDATION', 'Celular é obrigatório');
            }
            const item = await criarProfissional(db, {
              ...input,
              nome: input.nome!,
              celular: input.celular!,
            });
            return ok({ item });
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            if (/obrigatório|Já existe|inválido/i.test(msg)) {
              return fail('VALIDATION', msg);
            }
            return fail('SERVER', msg);
          }
        },
        {
          body: t.Intersect([
            t.Object({
              nome: t.String(),
              celular: t.String(),
            }),
            profissionalCadastroBodySchema,
          ]),
        },
      )
      .get('/profissionais', async ({ query }) => {
        try {
          const q = query as Record<string, string | undefined>;
          const raw = String(q.incluir_inativos ?? q.incluirInativos ?? '').trim();
          const incluirInativos =
            raw === '1' ||
            raw.toLowerCase() === 'true' ||
            raw.toLowerCase() === 'yes';
          const ctxRaw = String(q.contexto ?? '').trim().toLowerCase();
          const contexto = ctxRaw === 'agenda' ? 'agenda' : 'default';
          const items = await listProfissionaisForApi(db, {
            incluirInativos,
            contexto,
          });
          return ok({ items });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return fail('SERVER', msg);
        }
      })
      .patch(
        '/profissionais/ordem',
        async ({ body }) => {
          try {
            const b = body as { ids?: unknown };
            const raw = b.ids;
            if (!Array.isArray(raw) || raw.length === 0) {
              return fail('VALIDATION', 'ids é obrigatório');
            }
            const ids = raw.map((x) => Number.parseInt(String(x), 10));
            if (ids.some((id) => !Number.isFinite(id) || id <= 0)) {
              return fail('VALIDATION', 'ids inválido');
            }
            await reordenarProfissionais(db, ids);
            return ok({ ok: true });
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            if (/vazia|não encontrado|inválido/i.test(msg)) {
              return fail('VALIDATION', msg);
            }
            return fail('SERVER', msg);
          }
        },
        {
          body: t.Object({
            ids: t.Array(t.Number()),
          }),
        },
      )
      .get('/profissionais/:id', async ({ params }) => {
        try {
          const id = Number.parseInt(String(params.id).trim(), 10);
          if (!Number.isFinite(id) || id <= 0) {
            return fail('VALIDATION', 'id inválido');
          }
          const item = await getProfissionalById(db, id);
          if (!item) return fail('NOT_FOUND', 'Profissional não encontrado');
          return ok({ item });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return fail('SERVER', msg);
        }
      })
      .get('/profissionais/:id/usuario', async ({ params }) => {
        try {
          const id = Number.parseInt(String(params.id).trim(), 10);
          if (!Number.isFinite(id) || id <= 0) {
            return fail('VALIDATION', 'id inválido');
          }
          const item = await getUsuarioByProfissionalId(db, id);
          return ok({ item });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return fail('SERVER', msg);
        }
      })
      .put(
        '/profissionais/:id/usuario',
        async ({ params, body }) => {
          try {
            const id = Number.parseInt(String(params.id).trim(), 10);
            if (!Number.isFinite(id) || id <= 0) {
              return fail('VALIDATION', 'id inválido');
            }
            const b = body as {
              email?: string;
              senha?: string;
              ativo?: boolean;
            };
            const item = await upsertUsuarioForProfissional(db, id, {
              email: String(b.email ?? ''),
              senha: b.senha != null ? String(b.senha) : undefined,
              ativo: b.ativo,
            });
            return ok({ item });
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            if (/obrigatório|inválido|não encontrado/i.test(msg)) {
              return fail('VALIDATION', msg);
            }
            return fail('SERVER', msg);
          }
        },
        {
          params: t.Object({ id: t.String() }),
          body: t.Object({
            email: t.String(),
            senha: t.Optional(t.String()),
            ativo: t.Optional(t.Boolean()),
          }),
        },
      )
      .get('/profissionais/:id/comissoes-servicos', async ({ params }) => {
        try {
          const id = Number.parseInt(String(params.id).trim(), 10);
          if (!Number.isFinite(id) || id <= 0) {
            return fail('VALIDATION', 'id inválido');
          }
          const { listProfissionalComissaoServicos } = await import(
            './services/profissional-comissao-domain.js'
          );
          const items = await listProfissionalComissaoServicos(db, id);
          return ok({ items });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          if (/não encontrado/i.test(msg)) return fail('NOT_FOUND', msg);
          return fail('SERVER', msg);
        }
      })
      .put(
        '/profissionais/:id/comissoes-servicos',
        async ({ params, body }) => {
          try {
            const id = Number.parseInt(String(params.id).trim(), 10);
            if (!Number.isFinite(id) || id <= 0) {
              return fail('VALIDATION', 'id inválido');
            }
            const b = body as { items?: unknown };
            const raw = Array.isArray(b.items) ? b.items : [];
            const { replaceProfissionalComissaoServicos } = await import(
              './services/profissional-comissao-domain.js'
            );
            const items = await replaceProfissionalComissaoServicos(db, id, raw);
            return ok({ items });
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            if (/não encontrado/i.test(msg)) return fail('NOT_FOUND', msg);
            if (/inválido|obrigatório/i.test(msg)) {
              return fail('VALIDATION', msg);
            }
            return fail('SERVER', msg);
          }
        },
        {
          params: t.Object({ id: t.String() }),
          body: t.Object({}, { additionalProperties: true }),
        },
      )
      .post(
        '/profissionais/:id/comissoes-servicos/importar-catalogo',
        async ({ params }) => {
          try {
            const id = Number.parseInt(String(params.id).trim(), 10);
            if (!Number.isFinite(id) || id <= 0) {
              return fail('VALIDATION', 'id inválido');
            }
            const { importarComissaoServicosDoCatalogo } = await import(
              './services/profissional-comissao-domain.js'
            );
            const result = await importarComissaoServicosDoCatalogo(db, id);
            return ok(result);
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            if (/não encontrado/i.test(msg)) return fail('NOT_FOUND', msg);
            return fail('SERVER', msg);
          }
        },
        { params: t.Object({ id: t.String() }) },
      )
      .patch(
        '/profissionais/:id',
        async ({ params, body }) => {
          try {
            const id = Number.parseInt(String(params.id).trim(), 10);
            if (!Number.isFinite(id) || id <= 0) {
              return fail('VALIDATION', 'id inválido');
            }
            const patch = profissionalBodyFromRequest(body);
            if (Object.keys(patch).length === 0) {
              return fail('VALIDATION', 'Nenhum campo para atualizar');
            }
            const item = await atualizarProfissional(db, id, patch);
            return ok({ item });
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            if (/não encontrado/i.test(msg)) {
              return fail('NOT_FOUND', msg);
            }
            if (/obrigatório|Já existe|inválido/i.test(msg)) {
              return fail('VALIDATION', msg);
            }
            return fail('SERVER', msg);
          }
        },
        {
          params: t.Object({ id: t.String() }),
          body: profissionalCadastroBodySchema,
        },
      ),
  )
  .get('/api/categorias-financeiras', async () =>
    ok({ items: await listCategoriasFinanceirasApi(db) }),
  )
  .get('/api/financeiro/formas-pagamento/opcoes', async () =>
    ok({ items: await listFormasPagamentoOpcoesApi(db) }),
  )
  .get('/api/financeiro/categorias', async ({ query }) => {
    try {
      const q = query as Record<string, string | undefined>;
      const incluirInativas =
        q.incluir_inativas === '1' || q.incluirInativas === '1';
      return ok({
        items: await listCategoriasCadastroApi(db, { incluirInativas }),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return fail('SERVER', msg);
    }
  })
  .post(
    '/api/financeiro/categorias',
    async ({ body }) => {
      try {
        const b = body as { nome?: string; natureza?: string };
        const natureza = b.natureza === 'despesa' ? 'despesa' : 'receita';
        const id = await criarCategoriaCadastroApi(db, {
          nome: String(b.nome ?? ''),
          natureza,
        });
        return ok({ id });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return fail('VALIDATION', msg);
      }
    },
    {
      body: t.Object({
        nome: t.String(),
        natureza: t.Union([t.Literal('receita'), t.Literal('despesa')]),
      }),
    },
  )
  .patch(
    '/api/financeiro/categorias/:id',
    async ({ params, body }) => {
      try {
        const id = Number.parseInt(String(params.id), 10);
        if (!Number.isFinite(id) || id <= 0) {
          return fail('VALIDATION', 'id inválido');
        }
        const b = body as { nome?: string; natureza?: string };
        await atualizarCategoriaCadastroApi(db, id, {
          nome: b.nome !== undefined ? String(b.nome) : undefined,
          natureza:
            b.natureza === 'receita' || b.natureza === 'despesa'
              ? b.natureza
              : undefined,
        });
        return ok({ ok: true });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes('não encontrada')) return fail('NOT_FOUND', msg);
        return fail('VALIDATION', msg);
      }
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        nome: t.Optional(t.String()),
        natureza: t.Optional(
          t.Union([t.Literal('receita'), t.Literal('despesa')]),
        ),
      }),
    },
  )
  .delete('/api/financeiro/categorias/:id', async ({ params }) => {
    try {
      const id = Number.parseInt(String(params.id), 10);
      if (!Number.isFinite(id) || id <= 0) {
        return fail('VALIDATION', 'id inválido');
      }
      const result = await excluirCategoriaCadastroApi(db, id);
      return ok({ ok: true, result });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('não encontrada')) return fail('NOT_FOUND', msg);
      return fail('VALIDATION', msg);
    }
  })
  .get('/api/financeiro/formas-pagamento', async ({ query }) => {
    try {
      const q = query as Record<string, string | undefined>;
      const incluirInativas =
        q.incluir_inativas === '1' || q.incluirInativas === '1';
      return ok({
        items: await listFormasPagamentoCadastroApi(db, { incluirInativas }),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return fail('SERVER', msg);
    }
  })
  .post(
    '/api/financeiro/formas-pagamento',
    async ({ body }) => {
      try {
        const b = body as {
          nome?: string;
          baixa_automatica?: boolean;
          taxa_percentual?: number;
          taxa_fixa?: number;
          prazo_recebimento?: number;
          ativo?: boolean;
        };
        const id = await criarFormaPagamentoCadastroApi(db, {
          nome: String(b.nome ?? ''),
          baixa_automatica: b.baixa_automatica === true,
          taxa_percentual: b.taxa_percentual,
          taxa_fixa: b.taxa_fixa,
          prazo_recebimento: b.prazo_recebimento,
          ativo: b.ativo,
        });
        return ok({ id });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return fail('VALIDATION', msg);
      }
    },
    {
      body: t.Object({
        nome: t.String(),
        baixa_automatica: t.Optional(t.Boolean()),
        taxa_percentual: t.Optional(t.Number()),
        taxa_fixa: t.Optional(t.Number()),
        prazo_recebimento: t.Optional(t.Number()),
        ativo: t.Optional(t.Boolean()),
      }),
    },
  )
  .patch(
    '/api/financeiro/formas-pagamento/:id',
    async ({ params, body }) => {
      try {
        const id = Number.parseInt(String(params.id), 10);
        if (!Number.isFinite(id) || id <= 0) {
          return fail('VALIDATION', 'id inválido');
        }
        const b = body as {
          nome?: string;
          baixa_automatica?: boolean;
          taxa_percentual?: number;
          taxa_fixa?: number;
          prazo_recebimento?: number;
          ativo?: boolean;
        };
        await atualizarFormaPagamentoCadastroApi(db, id, {
          nome: b.nome !== undefined ? String(b.nome) : undefined,
          baixa_automatica: b.baixa_automatica,
          taxa_percentual: b.taxa_percentual,
          taxa_fixa: b.taxa_fixa,
          prazo_recebimento: b.prazo_recebimento,
          ativo: b.ativo,
        });
        return ok({ ok: true });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes('não encontrada')) return fail('NOT_FOUND', msg);
        return fail('VALIDATION', msg);
      }
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        nome: t.Optional(t.String()),
        baixa_automatica: t.Optional(t.Boolean()),
        taxa_percentual: t.Optional(t.Number()),
        taxa_fixa: t.Optional(t.Number()),
        prazo_recebimento: t.Optional(t.Number()),
        ativo: t.Optional(t.Boolean()),
      }),
    },
  )
  .delete('/api/financeiro/formas-pagamento/:id', async ({ params }) => {
    try {
      const id = Number.parseInt(String(params.id), 10);
      if (!Number.isFinite(id) || id <= 0) {
        return fail('VALIDATION', 'id inválido');
      }
      const result = await excluirFormaPagamentoCadastroApi(db, id);
      return ok({ ok: true, result });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('não encontrada')) return fail('NOT_FOUND', msg);
      return fail('VALIDATION', msg);
    }
  })
  .get('/api/movimentacoes', async ({ query }) => {
    try {
      const q = query as Record<string, string | undefined>;
      const nat = q.natureza;
      const items = await listMovimentacoesApi(db, {
        dataInicio: q.dataInicio ?? q.data_inicio,
        dataFim: q.dataFim ?? q.data_fim,
        natureza:
          nat === 'receita' || nat === 'despesa' ? nat : undefined,
      });
      return ok({ items });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return fail('SERVER', msg);
    }
  })
  .get('/api/financeiro/transacoes', async ({ query }) => {
    try {
      const q = query as Record<string, string | undefined>;
      const dataInicio = String(
        q.dataInicio ?? q.data_inicio ?? '',
      ).trim();
      const dataFim = String(q.dataFim ?? q.data_fim ?? '').trim();
      const tipoData = String(q.tipoData ?? q.tipo_data ?? '').trim();
      const items = await listTransacoesFinanceirasApi(db, {
        dataInicio,
        dataFim,
        tipoData: tipoData || undefined,
      });
      return ok({ items });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (
        msg.includes('obrigatórias') ||
        msg.includes('não pode ser posterior')
      ) {
        return fail('VALIDATION', msg);
      }
      return fail('SERVER', msg);
    }
  })
  .post(
    '/api/financeiro/transacoes/movimentacoes/:id/pagar',
    async ({ params, body, set }) => {
      set.status = 200;
      set.headers['content-type'] = 'application/json; charset=utf-8';
      try {
        await marcarMovimentacaoComoPagaApi(
          db,
          Number(params.id),
          String((body as { data_pagamento?: string }).data_pagamento ?? ''),
        );
        return ok({ ok: true });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes('inválida') || msg.includes('inválido') || msg.includes('não encontrada')) {
          return fail('VALIDATION', msg);
        }
        return fail('SERVER', msg);
      }
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({ data_pagamento: t.String() }),
    },
  )
  .post(
    '/api/financeiro/transacoes/movimentacoes/:id/estornar',
    async ({ params, set }) => {
      set.status = 200;
      set.headers['content-type'] = 'application/json; charset=utf-8';
      try {
        await estornarMovimentacaoPagamentoApi(db, Number(params.id));
        return ok({ ok: true });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes('inválido') || msg.includes('não encontrada') || msg.includes('Use o fluxo')) {
          return fail('VALIDATION', msg);
        }
        return fail('SERVER', msg);
      }
    },
    { params: t.Object({ id: t.String() }) },
  )
  .post(
    '/api/financeiro/transacoes/pendencias/:id/pagar',
    async ({ params, body, set }) => {
      set.status = 200;
      set.headers['content-type'] = 'application/json; charset=utf-8';
      try {
        await liquidarPendenciaComandaPorId(
          db,
          Number(params.id),
          String((body as { data_pagamento?: string }).data_pagamento ?? ''),
        );
        return ok({ ok: true });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (
          msg.includes('inválida') ||
          msg.includes('inválido') ||
          msg.includes('não encontrada') ||
          msg.includes('já está liquidada')
        ) {
          return fail('VALIDATION', msg);
        }
        return fail('SERVER', msg);
      }
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({ data_pagamento: t.String() }),
    },
  )
  .get('/api/caixa/dia', async ({ query }) => {
    try {
      const q = query as Record<string, string | undefined>;
      const data = String(q.data ?? '').trim();
      if (!data) return fail('VALIDATION', 'Query data é obrigatória (YYYY-MM-DD)');
      const resumo = await getCaixaDiaApi(db, data);
      return ok(resumo);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return fail('SERVER', msg);
    }
  })
  .post(
    '/api/movimentacoes',
    async ({ body }) => {
      try {
        const b = body as Record<string, unknown>;
        const id = await criarMovimentacaoManual(db, {
          data_mov: String(b.data_mov ?? ''),
          natureza: b.natureza === 'despesa' ? 'despesa' : 'receita',
          valor: Number(b.valor),
          categoria_id: Number(b.categoria_id),
          descricao:
            b.descricao != null ? String(b.descricao) : undefined,
          metodo_pagamento:
            b.metodo_pagamento != null
              ? String(b.metodo_pagamento)
              : undefined,
          id_atendimento:
            b.id_atendimento != null ? String(b.id_atendimento) : undefined,
        });
        return ok({ id });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return fail('SERVER', msg);
      }
    },
    {
      body: t.Object({
        data_mov: t.String(),
        natureza: t.Union([t.Literal('receita'), t.Literal('despesa')]),
        valor: t.Number(),
        categoria_id: t.Number(),
        descricao: t.Optional(t.String()),
        metodo_pagamento: t.Optional(t.String()),
        id_atendimento: t.Optional(t.String()),
      }),
    },
  )
  .patch(
    '/api/movimentacoes/:id',
    async ({ params, body }) => {
      try {
        const id = Number.parseInt(String(params.id), 10);
        if (!Number.isFinite(id) || id <= 0) {
          return fail('VALIDATION', 'id inválido');
        }
        const b = body as Record<string, unknown>;
        const patch: {
          valor?: number;
          descricao?: string | null;
          categoria_id?: number;
          metodo_pagamento?: string | null;
          data_mov?: string;
          pago_em?: string | null;
        } = {};
        if (b.valor !== undefined) patch.valor = Number(b.valor);
        if (b.descricao !== undefined) {
          patch.descricao =
            b.descricao === null ? null : String(b.descricao);
        }
        if (b.categoria_id !== undefined) {
          patch.categoria_id = Number(b.categoria_id);
        }
        if (b.metodo_pagamento !== undefined) {
          patch.metodo_pagamento =
            b.metodo_pagamento === null
              ? null
              : String(b.metodo_pagamento);
        }
        if (b.data_mov !== undefined) {
          patch.data_mov = String(b.data_mov);
        }
        if (b.pago_em !== undefined) {
          patch.pago_em =
            b.pago_em === null ? null : String(b.pago_em);
        }
        await atualizarMovimentacaoPorId(db, id, patch);
        return ok({ ok: true });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes('não encontrada')) {
          return fail('NOT_FOUND', msg);
        }
        return fail('SERVER', msg);
      }
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        valor: t.Optional(t.Number()),
        descricao: t.Optional(t.Union([t.String(), t.Null()])),
        categoria_id: t.Optional(t.Number()),
        metodo_pagamento: t.Optional(t.Union([t.String(), t.Null()])),
        data_mov: t.Optional(t.String()),
        pago_em: t.Optional(t.Union([t.String(), t.Null()])),
      }),
    },
  )
  .delete('/api/movimentacoes/:id', async ({ params }) => {
    try {
      const id = Number.parseInt(String(params.id), 10);
      if (!Number.isFinite(id) || id <= 0) {
        return fail('VALIDATION', 'id inválido');
      }
      const removed = await excluirMovimentacaoPorId(db, id);
      if (!removed) return fail('NOT_FOUND', 'Movimentação não encontrada');
      return ok({ ok: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return fail('SERVER', msg);
    }
  })
  .post(
    '/api/despesas',
    async ({ body }) => {
      try {
        const b = body as Record<string, unknown>;
        const res = await criarDespesaCadastro(db, {
          data_mov: String(b.data_mov ?? ''),
          valor: Number(b.valor),
          categoria_id: Number(b.categoria_id),
          descricao:
            b.descricao != null ? String(b.descricao) : undefined,
          metodo_pagamento:
            b.metodo_pagamento != null
              ? String(b.metodo_pagamento)
              : undefined,
          tipo: b.tipo != null ? String(b.tipo) : undefined,
          categoria_livre:
            b.categoria_livre != null
              ? String(b.categoria_livre)
              : undefined,
        });
        return ok(res);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return fail('SERVER', msg);
      }
    },
    {
      body: t.Object({
        data_mov: t.String(),
        valor: t.Number(),
        categoria_id: t.Number(),
        descricao: t.Optional(t.String()),
        metodo_pagamento: t.Optional(t.String()),
        tipo: t.Optional(t.String()),
        categoria_livre: t.Optional(t.String()),
      }),
    },
  )
  .post(
    '/api/finalizar-cobranca',
    async ({ body }) => execFinalizarCobranca(body),
    { body: bodyFinalizar },
  )
  .post(
    '/api/atendimentos/finalizar',
    async ({ body }) => execFinalizarCobranca(body),
    { body: bodyFinalizar },
  )
  .get('/api/atendimentos', async ({ query }) => {
    try {
      const q = query as Record<string, string | undefined>;
      const idAt = String(
        q.idAtendimento ?? q.id_atendimento ?? '',
      ).trim();
      const somenteComHorario =
        q.somenteComHorario === '1' ||
        q.somenteComHorario === 'true' ||
        q.somente_com_horario === '1' ||
        q.somente_com_horario === 'true';
      const modoRaw = String(q.modo ?? '')
        .trim()
        .toLowerCase();
      const modoPedido =
        modoRaw === 'orcamento'
          ? ('orcamento' as const)
          : modoRaw === 'todos'
            ? ('todos' as const)
            : ('producao' as const);
      const items = await listAtendimentosRaw(
        db,
        query.dataInicio,
        query.dataFim,
        idAt || undefined,
        somenteComHorario,
        modoPedido,
      );
      return ok({ items });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return fail('SERVER', msg);
    }
  })
  .post(
    '/api/orcamentos/:idAtendimento/status',
    async ({ params, body }) => {
      try {
        const id = String(params.idAtendimento || '').trim();
        const status = String(
          (body as { status?: string })?.status ?? '',
        )
          .trim()
          .toLowerCase();
        if (
          status !== 'rascunho' &&
          status !== 'enviado' &&
          status !== 'aceito' &&
          status !== 'arquivado'
        ) {
          return fail('VALIDATION', 'status inválido');
        }
        const r = await atualizarStatusOrcamento(db, id, status);
        return ok(r);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return fail('SERVER', msg);
      }
    },
    {
      body: t.Object({
        status: t.Union([
          t.Literal('rascunho'),
          t.Literal('enviado'),
          t.Literal('aceito'),
          t.Literal('arquivado'),
        ]),
      }),
    },
  )
  .post(
    '/api/orcamentos/:idAtendimento/converter',
    async ({ params, body }) => {
      try {
        const id = String(params.idAtendimento || '').trim();
        const b = (body ?? {}) as {
          data?: string;
          inicio?: string;
          fim?: string;
          profissional_id?: number;
          agenda_status?: string;
        };
        const r = await converterOrcamentoParaProducao(db, {
          id_atendimento: id,
          data: String(b.data ?? ''),
          inicio: String(b.inicio ?? ''),
          fim: String(b.fim ?? ''),
          profissional_id: Number(b.profissional_id),
          agenda_status: b.agenda_status,
        });
        return ok(r);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return fail('SERVER', msg);
      }
    },
    {
      body: t.Object({
        data: t.String(),
        inicio: t.String(),
        fim: t.String(),
        profissional_id: t.Number(),
        agenda_status: t.Optional(t.String()),
      }),
    },
  )
  .post(
    '/api/atendimentos',
    async ({ body, query }) => {
    const b = (body ?? {}) as Record<string, unknown>;
    const q = (query ?? {}) as Record<string, unknown>;
    const qAcao = String(q['acao'] ?? '').trim().toLowerCase();
    const bAcao = String(b.acao ?? '').trim().toLowerCase();
    const isFinalizar = qAcao === 'finalizar' || bAcao === 'finalizar';
    const isConfirmarPagamento =
      qAcao === 'confirmar-pagamento' || bAcao === 'confirmar-pagamento';
    const isExcluir = qAcao === 'excluir' || bAcao === 'excluir';
    const isRemarcar = qAcao === 'remarcar' || bAcao === 'remarcar';
    const isAgendaStatus =
      qAcao === 'agenda-status' ||
      bAcao === 'agenda-status' ||
      (b.agenda_status != null &&
        String(b.agenda_status).trim() !== '' &&
        b.tipo == null &&
        !isFinalizar &&
        !isExcluir &&
        !isRemarcar);
    const isAgendaCor =
      qAcao === 'agenda-cor' ||
      bAcao === 'agenda-cor' ||
      (('agenda_cor' in b) &&
        b.tipo == null &&
        !isFinalizar &&
        !isExcluir &&
        !isRemarcar &&
        !isAgendaStatus);
    if (isFinalizar) {
      const idAt = String(
        b.id_atendimento ?? (b as { idAtendimento?: string }).idAtendimento ?? '',
      ).trim();
      const desconto =
        b.desconto != null ? String(b.desconto) : undefined;
      return execFinalizarCobranca({ id_atendimento: idAt, desconto });
    }
    if (isConfirmarPagamento) {
      const idAt = String(
        b.id_atendimento ?? (b as { idAtendimento?: string }).idAtendimento ?? '',
      ).trim();
      const metodo =
        b.metodo != null ? String(b.metodo).trim() : undefined;
      return execConfirmarPagamento({ id_atendimento: idAt, metodo });
    }
    if (isExcluir) {
      const idAt = String(
        b.id_atendimento ?? (b as { idAtendimento?: string }).idAtendimento ?? '',
      ).trim();
      const bRec = b as Record<string, unknown>;
      return execExcluirAtendimento({
        id_atendimento: idAt,
        modo_exclusao:
          typeof bRec['modo_exclusao'] === 'string'
            ? bRec['modo_exclusao']
            : undefined,
        manter_cabecalho_pedido: bRec['manter_cabecalho_pedido'] as
          | boolean
          | undefined,
      });
    }
    if (isRemarcar) {
      const bRec = b as Record<string, unknown>;
      return execRemarcarAgendamento({
        id_atendimento: String(
          b.id_atendimento ??
            (b as { idAtendimento?: string }).idAtendimento ??
            '',
        ).trim(),
        profissional_origem_id: Number(bRec['profissional_origem_id']),
        profissional_destino_id: Number(bRec['profissional_destino_id']),
        data: String(bRec['data'] ?? '').trim(),
        hora_inicio: String(bRec['hora_inicio'] ?? '').trim(),
      });
    }
    if (isAgendaStatus) {
      return execAtualizarAgendaStatus({
        id_atendimento: String(
          b.id_atendimento ??
            (b as { idAtendimento?: string }).idAtendimento ??
            '',
        ).trim(),
        agenda_status: String(b.agenda_status ?? '').trim(),
      });
    }
    if (isAgendaCor) {
      const rawCor = b.agenda_cor;
      return execAtualizarAgendaCor({
        id_atendimento: String(
          b.id_atendimento ??
            (b as { idAtendimento?: string }).idAtendimento ??
            '',
        ).trim(),
        agenda_cor:
          rawCor === undefined || rawCor === null
            ? null
            : String(rawCor).trim() || null,
      });
    }
    try {
      const result = await createAtendimento(
        db,
        body as unknown as CreateAtendimentoPayload,
      );
      return ok(result);
    } catch (e) {
      const dup = mapPostgresUniqueViolationToPtBr(e);
      if (dup) return fail('CONFLICT', dup);
      const msg = e instanceof Error ? e.message : String(e);
      return fail('SERVER', msg);
    }
  },
    {
      body: postAtendimentoMutationBody,
      query: t.Object({
        acao: t.Optional(t.String()),
      }),
    },
  )
  .get('/api/folha', async ({ query, request }) => {
    const denied = requireAdminPin(request);
    if (denied) return denied;
    try {
      const q = query as Record<string, string | undefined>;
      const periodo = String(q.periodo ?? '').trim();
      if (!periodo) {
        return fail('VALIDATION', 'Query periodo é obrigatória (YYYY-MM)');
      }
      const items = await listFolhaPorPeriodoApi(db, periodo);
      return ok({ items });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/inválido/i.test(msg)) {
        return fail('VALIDATION', msg);
      }
      return fail('SERVER', msg);
    }
  })
  .post(
    '/api/folha/recalcular-comissoes',
    async ({ body, request }) => {
      const denied = requireAdminPin(request);
      if (denied) return denied;
      try {
        const b = body as { periodo?: string; profissional_id?: number };
        const periodo = String(b.periodo ?? '').trim();
        const rawPid = b.profissional_id;
        const profissionalId =
          rawPid != null && Number.isFinite(Number(rawPid)) && Number(rawPid) > 0
            ? Number(rawPid)
            : undefined;
        const r = await recalcularTotaisComissaoFolhaPorPeriodo(db, periodo, {
          profissionalId,
        });
        return ok(r);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/inválido/i.test(msg)) {
          return fail('VALIDATION', msg);
        }
        return fail('SERVER', msg);
      }
    },
    {
      body: t.Object({
        periodo: t.String(),
        profissional_id: t.Optional(t.Number()),
      }),
    },
  )
  /**
   * Pagamentos da comanda (parciais ou totais).
   * Cada POST cria 1 linha em `comanda_pagamentos` e a `movimentacao` ligada.
   */
  .get(
    '/api/comandas/:idAtendimento/pagamentos',
    async ({ params }) => {
      try {
        const id = String(params.idAtendimento || '').trim();
        if (!id) return fail('VALIDATION', 'idAtendimento é obrigatório');
        const [items, resumo] = await Promise.all([
          listarPagamentosPorAtendimento(db, id),
          getResumoComanda(db, id),
        ]);
        return ok({ items, resumo });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return fail('SERVER', msg);
      }
    },
    { params: t.Object({ idAtendimento: t.String() }) },
  )
  .post(
    '/api/comandas/:idAtendimento/pagamentos',
    async ({ params, body }) => {
      try {
        const id = String(params.idAtendimento || '').trim();
        if (!id) return fail('VALIDATION', 'idAtendimento é obrigatório');
        const b = body as Record<string, unknown>;
        const r = await criarPagamentoComanda(db, id, {
          data_pagamento:
            b.data_pagamento != null ? String(b.data_pagamento) : undefined,
          valor: (b.valor as number | string) ?? 0,
          metodo: String(b.metodo ?? '').trim(),
          parcelas:
            b.parcelas != null && Number.isFinite(Number(b.parcelas))
              ? Number(b.parcelas)
              : 1,
          parcela_numero:
            b.parcela_numero != null && Number.isFinite(Number(b.parcela_numero))
              ? Number(b.parcela_numero)
              : undefined,
          parcelas_total:
            b.parcelas_total != null &&
            Number.isFinite(Number(b.parcelas_total))
              ? Number(b.parcelas_total)
              : undefined,
          metodo_rotulo:
            b.metodo_rotulo != null ? String(b.metodo_rotulo) : undefined,
          troco:
            b.troco != null
              ? (b.troco as number | string)
              : null,
          observacao:
            b.observacao != null ? String(b.observacao) : null,
        });
        return ok(r);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/obrigatório|inválido|maior que zero|encontrado/i.test(msg)) {
          return fail('VALIDATION', msg);
        }
        return fail('SERVER', msg);
      }
    },
    {
      params: t.Object({ idAtendimento: t.String() }),
      body: t.Object({
        valor: t.Union([t.Number(), t.String()]),
        metodo: t.String(),
        data_pagamento: t.Optional(t.String()),
        parcelas: t.Optional(t.Number()),
        parcela_numero: t.Optional(t.Number()),
        parcelas_total: t.Optional(t.Number()),
        metodo_rotulo: t.Optional(t.String()),
        troco: t.Optional(t.Union([t.Number(), t.String(), t.Null()])),
        observacao: t.Optional(t.Union([t.String(), t.Null()])),
      }),
    },
  )
  .patch(
    '/api/comandas/:idAtendimento/desconto',
    async ({ params, body }) => {
      try {
        const id = String(params.idAtendimento || '').trim();
        if (!id) return fail('VALIDATION', 'idAtendimento é obrigatório');
        const desconto =
          body?.desconto != null ? String(body.desconto) : '';
        const n = await aplicarDescontoComandaPorIdAtendimento(
          db,
          id,
          desconto,
        );
        if (!n) {
          return fail(
            'NOT_FOUND',
            'Nenhuma linha encontrada para este atendimento',
          );
        }
        const resumo = await getResumoComanda(db, id);
        return ok({ atualizadas: n, resumo });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return fail('SERVER', msg);
      }
    },
    {
      params: t.Object({ idAtendimento: t.String() }),
      body: t.Object({
        desconto: t.Optional(t.Union([t.String(), t.Number(), t.Null()])),
      }),
    },
  )
  .post(
    '/api/comandas/:idAtendimento/faturar',
    async ({ params, body }) => {
      try {
        const id = String(params.idAtendimento || '').trim();
        if (!id) return fail('VALIDATION', 'idAtendimento é obrigatório');
        const b = body as Record<string, unknown>;
        const rawList = b.pagamentos;
        const rawCred = b.credito_excesso;
        const mapPagamentoBody = (p: Record<string, unknown>) => ({
          data_pagamento:
            p.data_pagamento != null ? String(p.data_pagamento) : undefined,
          valor: (p.valor as number | string) ?? 0,
          metodo: String(p.metodo ?? '').trim(),
          parcelas:
            p.parcelas != null && Number.isFinite(Number(p.parcelas))
              ? Number(p.parcelas)
              : 1,
          parcela_numero:
            p.parcela_numero != null &&
            Number.isFinite(Number(p.parcela_numero))
              ? Number(p.parcela_numero)
              : undefined,
          parcelas_total:
            p.parcelas_total != null &&
            Number.isFinite(Number(p.parcelas_total))
              ? Number(p.parcelas_total)
              : undefined,
          metodo_rotulo:
            p.metodo_rotulo != null ? String(p.metodo_rotulo) : undefined,
          troco: p.troco != null ? (p.troco as number | string) : null,
          observacao: p.observacao != null ? String(p.observacao) : null,
        });
        const list = Array.isArray(rawList)
          ? rawList.map((item) =>
              mapPagamentoBody(item as Record<string, unknown>),
            )
          : [];
        const credito_excesso = Array.isArray(rawCred)
          ? rawCred.map((item) =>
              mapPagamentoBody(item as Record<string, unknown>),
            )
          : undefined;
        const rawCredUsado = b.credito_cliente_usado;
        const credUsadoNum =
          rawCredUsado != null && rawCredUsado !== ''
            ? Number(rawCredUsado)
            : 0;
        const credito_cliente_usado =
          Number.isFinite(credUsadoNum) && credUsadoNum > 0
            ? credUsadoNum
            : undefined;
        if (
          list.length === 0 &&
          (!credito_excesso || credito_excesso.length === 0) &&
          credito_cliente_usado == null
        ) {
          return fail('VALIDATION', 'Lista de pagamentos ou crédito de excesso é obrigatória.');
        }
        const r = await faturarComandaComRascunho(db, id, {
          pagamentos: list,
          credito_excesso,
          credito_cliente_usado,
          desconto: b.desconto,
        });
        return ok(r);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/obrigatório|inválido|maior que zero|encontrado|Informe/i.test(msg)) {
          return fail('VALIDATION', msg);
        }
        return fail('SERVER', msg);
      }
    },
    {
      params: t.Object({ idAtendimento: t.String() }),
      body: t.Object({
        pagamentos: t.Array(
          t.Object({
            valor: t.Union([t.Number(), t.String()]),
            metodo: t.String(),
            data_pagamento: t.Optional(t.String()),
            parcelas: t.Optional(t.Number()),
            parcela_numero: t.Optional(t.Number()),
            parcelas_total: t.Optional(t.Number()),
            metodo_rotulo: t.Optional(t.String()),
            troco: t.Optional(t.Union([t.Number(), t.String(), t.Null()])),
            observacao: t.Optional(t.Union([t.String(), t.Null()])),
          }),
        ),
        credito_excesso: t.Optional(
          t.Array(
            t.Object({
              valor: t.Union([t.Number(), t.String()]),
              metodo: t.String(),
              data_pagamento: t.Optional(t.String()),
              parcelas: t.Optional(t.Number()),
              parcela_numero: t.Optional(t.Number()),
              parcelas_total: t.Optional(t.Number()),
              metodo_rotulo: t.Optional(t.String()),
              troco: t.Optional(t.Union([t.Number(), t.String(), t.Null()])),
              observacao: t.Optional(t.Union([t.String(), t.Null()])),
            }),
          ),
        ),
        desconto: t.Optional(t.String()),
        credito_cliente_usado: t.Optional(t.Union([t.Number(), t.String()])),
      }),
    },
  )
  .delete(
    '/api/comandas/:idAtendimento/pagamentos/:pagamentoId',
    async ({ params }) => {
      try {
        const idAt = String(params.idAtendimento || '').trim();
        const pagId = Number.parseInt(
          String(params.pagamentoId || '').trim(),
          10,
        );
        if (!idAt) return fail('VALIDATION', 'idAtendimento é obrigatório');
        if (!Number.isFinite(pagId) || pagId <= 0) {
          return fail('VALIDATION', 'pagamentoId inválido');
        }
        const r = await excluirPagamentoComanda(db, pagId);
        if (!r.idAtendimento) {
          return fail('NOT_FOUND', 'Pagamento não encontrado');
        }
        const resumo = await getResumoComanda(db, idAt);
        return ok({ resumo });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return fail('SERVER', msg);
      }
    },
    {
      params: t.Object({
        idAtendimento: t.String(),
        pagamentoId: t.String(),
      }),
    },
  )
  .patch(
    '/api/comandas/:idAtendimento/pagamentos/:pagamentoId',
    async ({ params, body }) => {
      try {
        const idAt = String(params.idAtendimento || '').trim();
        const pagId = Number.parseInt(
          String(params.pagamentoId || '').trim(),
          10,
        );
        if (!idAt) return fail('VALIDATION', 'idAtendimento é obrigatório');
        if (!Number.isFinite(pagId) || pagId <= 0) {
          return fail('VALIDATION', 'pagamentoId inválido');
        }
        const dataPagamento = String(
          (body as { data_pagamento?: string }).data_pagamento ?? '',
        ).trim();
        const r = await atualizarDataPagamentoComanda(
          db,
          idAt,
          pagId,
          dataPagamento,
        );
        return ok(r);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (
          /obrigatório|inválid|não encontrad|não pertence/i.test(msg)
        ) {
          return fail('VALIDATION', msg);
        }
        return fail('SERVER', msg);
      }
    },
    {
      params: t.Object({
        idAtendimento: t.String(),
        pagamentoId: t.String(),
      }),
      body: t.Object({
        data_pagamento: t.String(),
      }),
    },
  )
  .get('/api/whatsapp/config', async ({ request }) => {
    const auth = await authenticateRequest(request);
    if (!auth.ok) return auth.response;
    const denied = requireAdminRole(auth.user);
    if (denied) return denied;
    try {
      return ok({ config: await getWhatsappConfigApi(db) });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return fail('SERVER', msg);
    }
  })
  .put(
    '/api/whatsapp/config',
    async ({ request, body }) => {
      const auth = await authenticateRequest(request);
      if (!auth.ok) return auth.response;
      const denied = requireAdminRole(auth.user);
      if (denied) return denied;
      try {
        const b = body as Record<string, unknown>;
        const config = await saveWhatsappConfigApi(db, {
          provider: b.provider === 'evolution' ? 'evolution' : undefined,
          api_base_url:
            b.api_base_url !== undefined
              ? String(b.api_base_url ?? '')
              : b.apiBaseUrl !== undefined
                ? String(b.apiBaseUrl ?? '')
                : undefined,
          api_key:
            b.api_key !== undefined
              ? String(b.api_key ?? '')
              : b.apiKey !== undefined
                ? String(b.apiKey ?? '')
                : undefined,
          instance_name:
            b.instance_name !== undefined
              ? String(b.instance_name ?? '')
              : b.instanceName !== undefined
                ? String(b.instanceName ?? '')
                : undefined,
          numero_salao:
            b.numero_salao !== undefined
              ? String(b.numero_salao ?? '')
              : b.numeroSalao !== undefined
                ? String(b.numeroSalao ?? '')
                : undefined,
          nome_empresa:
            b.nome_empresa !== undefined
              ? String(b.nome_empresa ?? '')
              : b.nomeEmpresa !== undefined
                ? String(b.nomeEmpresa ?? '')
                : undefined,
          ativo: b.ativo !== undefined ? Boolean(b.ativo) : undefined,
        });
        return ok({ config });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return fail('VALIDATION', msg);
      }
    },
    {
      body: t.Object({
        provider: t.Optional(t.Literal('evolution')),
        api_base_url: t.Optional(t.Union([t.String(), t.Null()])),
        apiBaseUrl: t.Optional(t.Union([t.String(), t.Null()])),
        api_key: t.Optional(t.Union([t.String(), t.Null()])),
        apiKey: t.Optional(t.Union([t.String(), t.Null()])),
        instance_name: t.Optional(t.Union([t.String(), t.Null()])),
        instanceName: t.Optional(t.Union([t.String(), t.Null()])),
        numero_salao: t.Optional(t.Union([t.String(), t.Null()])),
        numeroSalao: t.Optional(t.Union([t.String(), t.Null()])),
        nome_empresa: t.Optional(t.Union([t.String(), t.Null()])),
        nomeEmpresa: t.Optional(t.Union([t.String(), t.Null()])),
        ativo: t.Optional(t.Boolean()),
      }),
    },
  )
  .post(
    '/api/whatsapp/config/test-connection',
    async ({ request, body }) => {
      const auth = await authenticateRequest(request);
      if (!auth.ok) return auth.response;
      const denied = requireAdminRole(auth.user);
      if (denied) return denied;
      try {
        const b = (body ?? {}) as Record<string, unknown>;
        const result = await testWhatsappConnectionApi(db, {
          api_base_url:
            b.api_base_url !== undefined
              ? String(b.api_base_url ?? '')
              : b.apiBaseUrl !== undefined
                ? String(b.apiBaseUrl ?? '')
                : undefined,
          api_key:
            b.api_key !== undefined
              ? String(b.api_key ?? '')
              : b.apiKey !== undefined
                ? String(b.apiKey ?? '')
                : undefined,
          instance_name:
            b.instance_name !== undefined
              ? String(b.instance_name ?? '')
              : b.instanceName !== undefined
                ? String(b.instanceName ?? '')
                : undefined,
        });
        return ok(result);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return fail('SERVER', msg);
      }
    },
    {
      body: t.Optional(
        t.Object({
          api_base_url: t.Optional(t.Union([t.String(), t.Null()])),
          apiBaseUrl: t.Optional(t.Union([t.String(), t.Null()])),
          api_key: t.Optional(t.Union([t.String(), t.Null()])),
          apiKey: t.Optional(t.Union([t.String(), t.Null()])),
          instance_name: t.Optional(t.Union([t.String(), t.Null()])),
          instanceName: t.Optional(t.Union([t.String(), t.Null()])),
        }),
      ),
    },
  )
  .get('/api/whatsapp/templates', async ({ request }) => {
    const auth = await authenticateRequest(request);
    if (!auth.ok) return auth.response;
    const denied = requireAdminRole(auth.user);
    if (denied) return denied;
    try {
      return ok({ items: await listWhatsappTemplatesApi(db) });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return fail('SERVER', msg);
    }
  })
  .patch(
    '/api/whatsapp/templates/:id',
    async ({ request, params, body }) => {
      const auth = await authenticateRequest(request);
      if (!auth.ok) return auth.response;
      const denied = requireAdminRole(auth.user);
      if (denied) return denied;
      try {
        const id = Number.parseInt(String(params.id), 10);
        if (!Number.isFinite(id) || id <= 0) {
          return fail('VALIDATION', 'id inválido');
        }
        const b = body as { corpo?: string; ativo?: boolean; nome?: string };
        await updateWhatsappTemplateApi(db, id, {
          corpo: b.corpo,
          ativo: b.ativo,
          nome: b.nome,
        });
        return ok({ ok: true });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes('não encontrado')) return fail('NOT_FOUND', msg);
        return fail('VALIDATION', msg);
      }
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        corpo: t.Optional(t.String()),
        ativo: t.Optional(t.Boolean()),
        nome: t.Optional(t.String()),
      }),
    },
  )
  .post(
    '/api/whatsapp/messages/send',
    async ({ request, body }) => {
      const auth = await authenticateRequest(request);
      if (!auth.ok) return auth.response;
      try {
        const b = body as Record<string, unknown>;
        const result = await sendWhatsappMessageApi(
          db,
          {
          telefone: String(b.telefone ?? ''),
          cliente_id:
            b.cliente_id !== undefined
              ? String(b.cliente_id ?? '')
              : b.clienteId !== undefined
                ? String(b.clienteId ?? '')
                : undefined,
          template_codigo:
            b.template_codigo !== undefined
              ? String(b.template_codigo ?? '')
              : b.templateCodigo !== undefined
                ? String(b.templateCodigo ?? '')
                : undefined,
          variaveis: (b.variaveis ?? b.variables) as
            | Record<string, string>
            | undefined,
          texto:
            b.texto !== undefined
              ? String(b.texto ?? '')
              : b.text !== undefined
                ? String(b.text ?? '')
                : undefined,
          id_atendimento:
            b.id_atendimento !== undefined
              ? String(b.id_atendimento ?? '')
              : b.idAtendimento !== undefined
                ? String(b.idAtendimento ?? '')
                : undefined,
        },
          { nomeRemetente: auth.user.nome_exibicao },
        );
        return ok(result);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return fail('VALIDATION', msg);
      }
    },
    {
      body: t.Object({
        telefone: t.String(),
        cliente_id: t.Optional(t.String()),
        clienteId: t.Optional(t.String()),
        template_codigo: t.Optional(t.String()),
        templateCodigo: t.Optional(t.String()),
        variaveis: t.Optional(t.Record(t.String(), t.String())),
        variables: t.Optional(t.Record(t.String(), t.String())),
        texto: t.Optional(t.String()),
        text: t.Optional(t.String()),
        id_atendimento: t.Optional(t.String()),
        idAtendimento: t.Optional(t.String()),
      }),
    },
  )
  .get('/api/whatsapp/logs', async ({ request, query }) => {
    const auth = await authenticateRequest(request);
    if (!auth.ok) return auth.response;
    const denied = requireAdminRole(auth.user);
    if (denied) return denied;
    try {
      const q = query as Record<string, string | undefined>;
      const page = Number.parseInt(String(q.page ?? '1'), 10);
      const pageSize = Number.parseInt(
        String(q.page_size ?? q.pageSize ?? '25'),
        10,
      );
      const data = await listWhatsappLogsApi(db, {
        page: Number.isFinite(page) ? page : 1,
        pageSize: Number.isFinite(pageSize) ? pageSize : 25,
        clienteId: q.cliente_id ?? q.clienteId,
        tipo: q.tipo,
      });
      return ok(data);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return fail('SERVER', msg);
    }
  })
  .listen(
    {
      port: Number(process.env.PORT) || 3000,
      hostname: '0.0.0.0',
    },
    ({ hostname, port }) => {
      console.log(`API em http://${hostname}:${port}`);
    },
  );

export type App = typeof app;
