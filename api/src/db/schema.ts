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

/** Métodos de pagamento aceites na comanda (sub-drawer Faturar). */
export const metodoPagamentoComandaEnum = pgEnum('metodo_pagamento_comanda', [
  'dinheiro',
  'cartao_credito',
  'cartao_debito',
  'pix',
  'transferencia',
  'outros',
  /** Valor em dívida: conta no total da comanda; sem receita em `movimentacoes`. */
  'pendente',
]);

export const clientes = pgTable('clientes', {
  idCliente: text('id_cliente').primaryKey(),
  nomeExibido: text('nome_exibido').notNull(),
  telefone: text('telefone'),
  /** Saldo de crédito pré-pago (ex.: excesso ao faturar). */
  creditoSaldo: numeric('credito_saldo', { precision: 14, scale: 2 })
    .notNull()
    .default('0'),
  apelido: text('apelido'),
  email: text('email'),
  celular: text('celular'),
  telefoneFixo: text('telefone_fixo'),
  /** Data de aniversário como texto DD/MM/AAAA (alinhado à UI). */
  aniversario: text('aniversario'),
  cnpj: text('cnpj'),
  cpf: text('cpf'),
  rg: text('rg'),
  fotoUrl: text('foto_url'),
  notificacoesAtivo: boolean('notificacoes_ativo').notNull().default(true),
  descontoPadraoTexto: text('desconto_padrao_texto'),
  descontoPadraoModo: text('desconto_padrao_modo'),
  cep: text('cep'),
  logradouro: text('logradouro'),
  enderecoNumero: text('endereco_numero'),
  complemento: text('complemento'),
  bairro: text('bairro'),
  estado: text('estado'),
  cidade: text('cidade'),
  /** Handle ou path após instagram.com/ */
  instagram: text('instagram'),
  /** Handle ou path após facebook.com/ */
  facebook: text('facebook'),
});

/** Extrato de crédito pré-pago do cliente (entrada/saída por comanda, etc.). */
export const clienteCreditoMovimentos = pgTable(
  'cliente_credito_movimentos',
  {
    id: serial('id').primaryKey(),
    clienteId: text('cliente_id')
      .notNull()
      .references(() => clientes.idCliente, { onDelete: 'cascade' }),
    idAtendimento: text('id_atendimento'),
    dataMov: date('data_mov').notNull(),
    valor: numeric('valor', { precision: 14, scale: 2 }).notNull(),
    tipo: text('tipo').notNull(),
    motivo: text('motivo').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('cliente_credito_movimentos_cliente_idx').on(t.clienteId),
    index('cliente_credito_movimentos_cliente_data_idx').on(
      t.clienteId,
      t.dataMov,
      t.id,
    ),
  ],
);

/** Pessoa estável (índice único em `lower(trim(nome))` na migração SQL). */
export const profissionais = pgTable('profissionais', {
  id: serial('id').primaryKey(),
  nome: text('nome').notNull(),
  /** Inativos permanecem no histórico; não entram em novos atendimentos nem na lista da agenda. */
  ativo: boolean('ativo').notNull().default(true),
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

/** Um registo por `id_atendimento` textual (carrinho / pedido). */
export const atendimentosPedido = pgTable('atendimentos_pedido', {
  idAtendimento: text('id_atendimento').primaryKey(),
  idCliente: text('id_cliente')
    .notNull()
    .references(() => clientes.idCliente),
  /** Série de recorrência para ocorrências criadas no mesmo salvar. */
  idRecorrencia: text('id_recorrencia'),
  /** Posição da ocorrência dentro da série (1, 2, 3...). */
  ordemRecorrencia: integer('ordem_recorrencia'),
  /**
   * Número de comanda global (#1, #2, …) atribuído na criação do pedido;
   * não muda ao editar linhas do mesmo `id_atendimento`.
   */
  numeroComanda: integer('numero_comanda')
    .notNull()
    .default(
      sql`nextval('atendimentos_pedido_numero_comanda_seq'::regclass)`,
    ),
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
    /** Valor unitário registado no carrinho (Serviço/Produto/Cabelo). Mega/Pacote: null. */
    valorUnitario: numeric('valor_unitario', { precision: 14, scale: 2 }),
    /** Desconto aplicado à linha (em reais). Mega/Pacote: null. */
    desconto: numeric('desconto', { precision: 14, scale: 2 }),
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
    /** Quantidade da linha (espelha `atendimento_itens.quantidade` quando existe pivot). */
    quantidade: integer('quantidade').notNull().default(1),
    desconto: text('desconto'),
    descricao: text('descricao'),
    descricaoManual: text('descricao_manual'),
    custo: text('custo'),
    lucro: text('lucro'),
    /** `aberta` (ou null) = em curso; `finalizada` = serviço encerrado na receção */
    cobrancaStatus: text('cobranca_status'),
    /** Só após `finalizada`: `pendente` ou null = a cobrar; `confirmado` = pago */
    pagamentoStatus: text('pagamento_status'),
    /** Data em que a comissão da linha foi paga à profissional (`YYYY-MM-DD`). */
    comissaoPagaEm: date('comissao_paga_em'),
    /** Preenchido ao confirmar pagamento (ex.: Dinheiro, Pix, Cartão). */
    pagamentoMetodo: text('pagamento_metodo'),
    /** Estado visual na grelha da agenda (ex.: confirmado, aguardando). */
    agendaStatus: text('agenda_status'),
    /** Cor do cartão na agenda (hex, ex.: #32C787). */
    agendaCor: text('agenda_cor'),
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

export const formasPagamentoFinanceiras = pgTable(
  'formas_pagamento_financeiras',
  {
    id: serial('id').primaryKey(),
    nome: text('nome').notNull(),
    codigoInterno: text('codigo_interno').notNull().unique(),
    baixaAutomatica: boolean('baixa_automatica').default(false).notNull(),
    taxaPercentual: numeric('taxa_percentual', { precision: 6, scale: 3 })
      .default('0')
      .notNull(),
    taxaFixa: numeric('taxa_fixa', { precision: 14, scale: 2 })
      .default('0')
      .notNull(),
    prazoRecebimento: integer('prazo_recebimento').default(0).notNull(),
    ordem: integer('ordem').default(0).notNull(),
    ativo: boolean('ativo').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index('formas_pagamento_financeiras_ativo_ordem_idx').on(
      t.ativo,
      t.ordem,
      t.id,
    ),
  ],
);

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
    /** Data de confirmação de pagamento (`YYYY-MM-DD`); null = em aberto. */
    pagoEm: date('pago_em'),
    /** Ex.: `atendimento_confirmacao`, `manual`. */
    origem: text('origem').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index('movimentacoes_data_mov_idx').on(t.dataMov),
    index('movimentacoes_pago_em_idx').on(t.pagoEm),
    index('movimentacoes_categoria_id_idx').on(t.categoriaId),
    index('movimentacoes_id_atendimento_idx').on(t.idAtendimento),
    uniqueIndex('movimentacoes_confirm_receita_id_at_idx')
      .on(t.idAtendimento)
      .where(
        sql`${t.origem} = 'atendimento_confirmacao' AND ${t.natureza} = 'receita'`,
      ),
  ],
);

/**
 * Pagamentos da comanda (parciais ou totais). 1 registo por evento de pagamento.
 * Status da comanda é derivado: SUM(valor) >= total → pago; >0 → parcial; =0 → pendente.
 * `movimentacao_id` liga ao razão financeiro (1 movimentação `receita` por pagamento),
 * exceto método `pendente` (valor em dívida, sem receita até liquidação).
 */
export const comandaPagamentos = pgTable(
  'comanda_pagamentos',
  {
    id: serial('id').primaryKey(),
    idAtendimento: text('id_atendimento')
      .notNull()
      .references(() => atendimentosPedido.idAtendimento, { onDelete: 'cascade' }),
    /** Data do pagamento (pode ser diferente da data do atendimento). */
    dataPagamento: date('data_pagamento').notNull(),
    valor: numeric('valor', { precision: 14, scale: 2 }).notNull(),
    metodo: metodoPagamentoComandaEnum('metodo').notNull(),
    /**
     * Legado / informativo por linha (hoje sempre `1` após split em N linhas).
     * O parcelamento da comanda usa `parcela_numero` + `parcelas_total`.
     */
    parcelas: integer('parcelas').default(1).notNull(),
    /** Índice da prestação (1..N) quando a comanda foi parcelada em várias linhas. */
    parcelaNumero: integer('parcela_numero'),
    /** Total de prestações do mesmo lançamento parcelado. */
    parcelasTotal: integer('parcelas_total'),
    /**
     * Rótulo do método para UI (ex.: «Dinheiro» na 2.ª parcela mesmo com `metodo` = pendente).
     */
    metodoRotulo: text('metodo_rotulo'),
    /** Em dinheiro: troco devolvido (informativo, não entra no total pago). */
    troco: numeric('troco', { precision: 14, scale: 2 }),
    observacao: text('observacao'),
    /** Movimentação financeira (receita) gerada por este pagamento. */
    movimentacaoId: integer('movimentacao_id').references(() => movimentacoes.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index('comanda_pagamentos_id_atendimento_idx').on(t.idAtendimento),
    index('comanda_pagamentos_data_idx').on(t.dataPagamento),
  ],
);

/**
 * Detalhe opcional de uma despesa (metadados). O valor e o impacto no caixa vêm só de `movimentacoes`.
 * Linhas legadas (seed/planilha) podem existir sem `movimentacao_id`.
 */
export const despesas = pgTable(
  'despesas',
  {
    id: serial('id').primaryKey(),
    movimentacaoId: integer('movimentacao_id').references(() => movimentacoes.id, {
      onDelete: 'cascade',
    }),
    /** Alinhado a `movimentacoes.data_mov` quando há vínculo; índice para relatórios. */
    dataRegisto: date('data_registo'),
    /** Legado (planilha): texto livre. */
    data: text('data'),
    tipo: text('tipo'),
    categoria: text('categoria'),
    descricao: text('descricao'),
    /** Legado; não duplicar valor nas linhas novas ligadas a `movimentacoes`. */
    valor: text('valor'),
  },
  (t) => [
    uniqueIndex('despesas_movimentacao_id_uq')
      .on(t.movimentacaoId)
      .where(sql`${t.movimentacaoId} is not null`),
    index('despesas_data_registo_idx').on(t.dataRegisto),
  ],
);
