import { date, index, integer, pgTable, serial, text } from 'drizzle-orm/pg-core';

export const clientes = pgTable('clientes', {
  idCliente: text('id_cliente').primaryKey(),
  nomeExibido: text('nome_exibido').notNull(),
  telefone: text('telefone'),
  observacoes: text('observacoes'),
});

export const servicos = pgTable('servicos', {
  linha: integer('linha').primaryKey(),
  servico: text('servico'),
  tipo: text('tipo'),
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
});

export const cabelos = pgTable('cabelos', {
  id: serial('id').primaryKey(),
  cor: text('cor'),
  tamanhoCm: text('tamanho_cm'),
  metodo: text('metodo'),
  valorBase: text('valor_base'),
});

export const folha = pgTable('folha', {
  id: serial('id').primaryKey(),
  profissional: text('profissional'),
  mes: text('mes'),
  totalComissao: text('total_comissao'),
  totalPago: text('total_pago'),
  saldo: text('saldo'),
  status: text('status'),
});

export const pagamentos = pgTable('pagamentos', {
  id: serial('id').primaryKey(),
  data: text('data'),
  profissional: text('profissional'),
  tipo: text('tipo'),
  valor: text('valor'),
  mesRef: text('mes_ref'),
  observacao: text('observacao'),
});

export const despesas = pgTable('despesas', {
  id: serial('id').primaryKey(),
  data: text('data'),
  tipo: text('tipo'),
  categoria: text('categoria'),
  descricao: text('descricao'),
  valor: text('valor'),
});

export const atendimentos = pgTable(
  'atendimentos',
  {
    id: serial('id').primaryKey(),
    idAtendimento: text('id_atendimento').notNull(),
    data: date('data'),
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
    /** Referência à linha da aba Folha (`folha.id`); nome para exibição vem do join. */
    profissionalId: integer('profissional_id').references(() => folha.id),
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
