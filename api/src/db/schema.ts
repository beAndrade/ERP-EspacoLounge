import { sql } from 'drizzle-orm';
import {
  boolean,
  date,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const naturezaFinanceiraEnum = pgEnum('natureza_financeira', [
  'receita',
  'despesa',
]);

export const atendimentoItemTipoEnum = pgEnum('atendimento_item_tipo', [
  'servico',
  'produto',
  /** Linha Mega (pacote comercial + etapa em `regras_mega`). */
  'mega',
  /** Linha Pacote comercial (cabeça e/ou etapas). */
  'pacote',
  /** Linha Cabelo (valor manual; texto em `detalhes`). */
  'cabelo',
]);

export const clientes = pgTable('clientes', {
  idCliente: text('id_cliente').primaryKey(),
  nomeExibido: text('nome_exibido').notNull(),
  telefone: text('telefone'),
  observacoes: text('observacoes'),
});

/** Pessoa estável (índice único em `lower(trim(nome))` na migração SQL). */
export const profissionais = pgTable('profissionais', {
  id: serial('id').primaryKey(),
  nome: text('nome').notNull(),
});

export const servicos = pgTable('servicos', {
  id: integer('id').primaryKey(),
  servico: text('servico'),
  tipo: text('tipo'),
  /** Duração prevista do serviço (minutos), p.ex. para agenda e horário final. */
  duracaoMinutos: integer('duracao_minutos').default(30).notNull(),
  /** Para `tipo = Tamanho`: minutos por faixa (null = usar `duracao_minutos`). */
  duracaoCurto: integer('duracao_curto'),
  duracaoMedio: integer('duracao_medio'),
  duracaoMedioLongo: integer('duracao_m_l'),
  duracaoLongo: integer('duracao_longo'),
  valorBase: text('valor_base'),
  comissaoFixa: text('comissao_fixa'),
  comissaoPct: text('comissao_pct'),
  precoCurto: text('preco_curto'),
  precoMedio: text('preco_medio'),
  precoMedioLongo: text('preco_medio_longo'),
  precoLongo: text('preco_longo'),
  custoFixo: text('custo_fixo'),
  curto: text('curto'),
  medio: text('medio'),
  mL: text('m_l'),
  longo: text('longo'),
});

export const pacotes = pgTable('pacotes', {
  id: serial('id').primaryKey(),
  pacote: text('pacote').notNull(),
  precoPacote: text('preco_pacote'),
});

export const produtos = pgTable('produtos', {
  id: serial('id').primaryKey(),
  produto: text('produto').notNull(),
  categoria: text('categoria'),
  custo: text('custo'),
  preco: text('preco'),
  estoque: text('estoque'),
  estoqueInicial: text('estoque_inicial'),
  unidade: text('unidade'),
});

export const regrasMega = pgTable('regras_mega', {
  id: serial('id').primaryKey(),
  pacote: text('pacote').notNull(),
  etapa: text('etapa').notNull(),
  valor: text('valor'),
  comissao: text('comissao'),
  /** Duração da etapa na agenda, em minutos (Mega e etapas de Pacote). */
  duracaoMinutos: integer('duracao_minutos').default(30).notNull(),
});

export const cabelos = pgTable('cabelos', {
  id: serial('id').primaryKey(),
  cor: text('cor'),
  tamanhoCm: text('tamanho_cm'),
  metodo: text('metodo'),
  valorBase: text('valor_base'),
});

export const folha = pgTable(
  'folha',
  {
    id: serial('id').primaryKey(),
    profissionalId: integer('profissional_id').references(() => profissionais.id),
    profissional: text('profissional'),
    mes: text('mes'),
    /** Competência canónica `YYYY-MM` para alinhar com agregações de `atendimentos.data`. */
    periodoReferencia: text('periodo_referencia'),
    totalComissao: text('total_comissao'),
    totalPago: text('total_pago'),
    saldo: text('saldo'),
    status: text('status'),
  },
  (t) => [
    index('folha_profissional_id_idx').on(t.profissionalId),
    index('folha_profissional_periodo_idx').on(
      t.profissionalId,
      t.periodoReferencia,
    ),
  ],
);

export const pagamentos = pgTable(
  'pagamentos',
  {
    id: serial('id').primaryKey(),
    data: text('data'),
    profissional: text('profissional'),
    /** Beneficiária do pagamento (substitui gradualmente o nome em texto). */
    profissionalId: integer('profissional_id').references(() => profissionais.id, {
      onDelete: 'set null',
    }),
    /** Linha de folha (mês) que este pagamento ajuda a quitar, quando aplicável. */
    folhaId: integer('folha_id').references(() => folha.id, { onDelete: 'set null' }),
    tipo: text('tipo'),
    valor: text('valor'),
    mesRef: text('mes_ref'),
    observacao: text('observacao'),
  },
  (t) => [
    index('pagamentos_profissional_id_idx').on(t.profissionalId),
    index('pagamentos_folha_id_idx').on(t.folhaId),
  ],
);

export const despesas = pgTable('despesas', {
  id: serial('id').primaryKey(),
  data: text('data'),
  tipo: text('tipo'),
  categoria: text('categoria'),
  descricao: text('descricao'),
  valor: text('valor'),
});

/** Um registo por `id_atendimento` textual (carrinho / pedido). */
export const atendimentosPedido = pgTable('atendimentos_pedido', {
  idAtendimento: text('id_atendimento').primaryKey(),
  idCliente: text('id_cliente')
    .notNull()
    .references(() => clientes.idCliente),
});

export const atendimentoItens = pgTable(
  'atendimento_itens',
  {
    id: serial('id').primaryKey(),
    idAtendimento: text('id_atendimento')
      .notNull()
      .references(() => atendimentosPedido.idAtendimento, { onDelete: 'cascade' }),
    tipo: atendimentoItemTipoEnum('tipo').notNull(),
    servicoId: integer('servico_id').references(() => servicos.id),
    produtoId: integer('produto_id').references(() => produtos.id),
    quantidade: integer('quantidade').default(1).notNull(),
    profissionalId: integer('profissional_id').references(() => profissionais.id),
    tamanho: text('tamanho'),
    /** Mega / Pacote: nome do pacote comercial (coluna homónima em `atendimentos`). */
    pacote: text('pacote'),
    /** Mega / Pacote: etapa (vazio na cabeça do pacote). */
    etapa: text('etapa'),
    /** Etapa Mega ou etapa de Pacote: FK a `regras_mega`. */
    regraMegaId: integer('regra_mega_id').references(() => regrasMega.id, {
      onDelete: 'set null',
    }),
    /** Cabeça Pacote ou referência ao pacote comercial (Mega). */
    pacoteId: integer('pacote_id').references(() => pacotes.id, {
      onDelete: 'set null',
    }),
    /** Cabelo: texto da linha (descrição). */
    detalhes: text('detalhes'),
  },
  (t) => [index('atendimento_itens_id_atendimento_idx').on(t.idAtendimento)],
);

export const atendimentos = pgTable(
  'atendimentos',
  {
    id: serial('id').primaryKey(),
    idAtendimento: text('id_atendimento').notNull(),
    data: date('data'),
    /** Início do slot (timestamp **sem** timezone; string `YYYY-MM-DD HH:mm:ss`). */
    inicio: timestamp('inicio', { withTimezone: false, mode: 'string' }),
    /** Fim do slot (timestamp **sem** timezone). */
    fim: timestamp('fim', { withTimezone: false, mode: 'string' }),
    idCliente: text('id_cliente')
      .notNull()
      .references(() => clientes.idCliente),
    nomeCliente: text('nome_cliente'),
    tipo: text('tipo'),
    pacote: text('pacote'),
    etapa: text('etapa'),
    produto: text('produto'),
    servicos: text('servicos'),
    tamanho: text('tamanho'),
    /** FK `profissionais.id`; nome para exibição vem do join. */
    profissionalId: integer('profissional_id').references(() => profissionais.id),
    valor: text('valor'),
    valorManual: text('valor_manual'),
    comissao: text('comissao'),
    desconto: text('desconto'),
    descricao: text('descricao'),
    descricaoManual: text('descricao_manual'),
    custo: text('custo'),
    lucro: text('lucro'),
    /** `aberta` (ou null) = em curso; `finalizada` = serviço encerrado na receção */
    cobrancaStatus: text('cobranca_status'),
    /** Só após `finalizada`: `pendente` ou null = a cobrar; `confirmado` = pago */
    pagamentoStatus: text('pagamento_status'),
    /** Preenchido ao confirmar pagamento (ex.: Dinheiro, Pix, Cartão). */
    pagamentoMetodo: text('pagamento_metodo'),
  },
  (t) => [
    index('atendimentos_data_idx').on(t.data),
    index('atendimentos_id_cliente_idx').on(t.idCliente),
    index('atendimentos_id_atendimento_idx').on(t.idAtendimento),
    index('atendimentos_profissional_id_idx').on(t.profissionalId),
  ],
);

export const categoriasFinanceiras = pgTable('categorias_financeiras', {
  id: serial('id').primaryKey(),
  nome: text('nome').notNull(),
  natureza: naturezaFinanceiraEnum('natureza').notNull(),
  slug: text('slug').notNull().unique(),
  ordem: integer('ordem').default(0).notNull(),
  ativo: boolean('ativo').default(true).notNull(),
});

export const movimentacoes = pgTable(
  'movimentacoes',
  {
    id: serial('id').primaryKey(),
    dataMov: date('data_mov').notNull(),
    natureza: naturezaFinanceiraEnum('natureza').notNull(),
    valor: numeric('valor', { precision: 14, scale: 2 }).notNull(),
    categoriaId: integer('categoria_id')
      .notNull()
      .references(() => categoriasFinanceiras.id),
    descricao: text('descricao'),
    idAtendimento: text('id_atendimento'),
    metodoPagamento: text('metodo_pagamento'),
    /** Ex.: `atendimento_confirmacao`, `manual`. */
    origem: text('origem').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index('movimentacoes_data_mov_idx').on(t.dataMov),
    index('movimentacoes_categoria_id_idx').on(t.categoriaId),
    index('movimentacoes_id_atendimento_idx').on(t.idAtendimento),
    uniqueIndex('movimentacoes_confirm_receita_id_at_idx')
      .on(t.idAtendimento)
      .where(
        sql`${t.origem} = 'atendimento_confirmacao' AND ${t.natureza} = 'receita'`,
      ),
  ],
);
