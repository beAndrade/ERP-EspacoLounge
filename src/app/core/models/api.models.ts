export interface ApiError {
  code: string;
  message: string;
}

export interface ApiResponse<T> {
  ok: boolean;
  data: T | null;
  error: ApiError | null;
}

/** Cliente na API (`GET/POST/PATCH /api/clientes`); campos em colunas na BD. */
export interface Cliente {
  id: string;
  nome: string;
  telefone: string | null;
  apelido?: string | null;
  email?: string | null;
  celular?: string | null;
  telefoneFixo?: string | null;
  aniversario?: string | null;
  cnpj?: string | null;
  cpf?: string | null;
  rg?: string | null;
  fotoUrl?: string | null;
  notificacoesAtivo?: boolean;
  descontoPadraoTexto?: string | null;
  descontoPadraoModo?: string | null;
  cep?: string | null;
  logradouro?: string | null;
  enderecoNumero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  estado?: string | null;
  cidade?: string | null;
  instagram?: string | null;
  facebook?: string | null;
  /** Saldo de crédito pré-pago (ex.: excesso ao faturar). */
  creditoSaldo?: number;
  /** Saldo de cashback do cliente (quando existir na API). */
  cashbackSaldo?: number;
}

/** Linha do extrato de crédito (`GET /api/clientes/:id/credito-movimentos`). */
export interface ClienteCreditoMovimento {
  id: string;
  /** `AAAA-MM-DD` */
  data: string;
  valorReais: number;
  tipo: 'entrada' | 'saida';
  motivo: string;
}

/** Body de `POST /api/clientes/:id/credito-movimentos`. */
export type CriarClienteCreditoMovimentoPayload = {
  valor: number;
  tipo: 'entrada' | 'saida' | 'adicionar' | 'retirar';
  motivo?: string;
  gerar_movimentacao_financeira?: boolean;
};

/** Resposta de `POST /api/clientes/:id/credito-movimentos`. */
export type CriarClienteCreditoMovimentoResponse = {
  saldo: number;
  item: ClienteCreditoMovimento;
};

/** Body de `POST/PATCH /api/clientes`. */
export type ClienteCadastroPayload = {
  nome: string;
  telefone?: string;
  apelido?: string;
  email?: string;
  celular?: string;
  telefoneFixo?: string;
  aniversario?: string;
  cnpj?: string;
  cpf?: string;
  rg?: string;
  fotoUrl?: string | null;
  notificacoesAtivo?: boolean;
  descontoPadraoTexto?: string;
  descontoPadraoModo?: string;
  cep?: string;
  logradouro?: string;
  enderecoNumero?: string;
  complemento?: string;
  bairro?: string;
  estado?: string;
  cidade?: string;
  instagram?: string;
  facebook?: string;
};

/**
 * Linha da aba Serviços; `id` = PK `servicos.id` (= número da linha na planilha, primeira linha de dados = 2).
 * Demais chaves = cabeçalhos da linha 1 (ex.: Serviço, Tipo, Valor Base).
 */
export interface Servico {
  id: string;
  [key: string]: unknown;
}

/** Payload de create/update do catálogo de serviços. */
export type ServicoWritePayload = {
  nome: string;
  tipo: 'Fixo' | 'Tamanho';
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
  /** Comissão R$ por tamanho (colunas `curto` / `medio` / `m_l` / `longo`). */
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

/** Item da lista Agenda (aba Atendimentos), normalizado para a UI. */
export interface AtendimentoListaItem {
  id: string;
  /**
   * Número global da comanda (#1, #2, …) em `atendimentos_pedido.numero_comanda`;
   * estável enquanto o pedido existir (null em orçamentos).
   */
  numeroComanda?: number | null;
  /**
   * Número do orçamento (#1, #2, …) em `atendimentos_pedido.numero_orcamento`
   * (sequência separada das comandas).
   */
  numeroOrcamento?: number | null;
  /** PK da linha em `atendimentos` (única por registo). */
  linha_id?: number;
  /** Sempre `AAAA-MM-DD` (para ordenar); na tela usa-se formato dia-mês-ano. */
  data: string;
  /** `YYYY-MM-DD HH:mm:ss` (relógio do salão, sem timezone) quando existir na BD. */
  inicio?: string | null;
  /** `YYYY-MM-DD HH:mm:ss` quando existir na BD. */
  fim?: string | null;
  nomeCliente: string;
  /** ID do cliente (aba Clientes), para pré-preencher “Novo atendimento”. */
  idCliente?: string | null;
  /** Coluna Tipo (Serviço, Produto, Mega, …). */
  tipo?: string | null;
  /** Coluna Produto quando tipo Produto. */
  produtoNome?: string | null;
  /** Coluna Serviços (nome gravado na linha). */
  servicosRef?: string | null;
  /** Coluna Tamanho. */
  tamanho?: string | null;
  /** Nome do profissional (resolvido a partir de `profissionais` na API). */
  profissional?: string | null;
  /** FK `profissionais.id` (`atendimentos.profissional_id`). */
  profissional_id?: number | null;
  /**
   * Itens na pivot `atendimento_itens`: `servico`/`produto` (FK ao catálogo),
   * `mega`/`pacote` (pacote + etapa) e `cabelo` (detalhes em texto).
   */
  itens_catalogo?: AtendimentoItemCatalogo[];
  /** Espelho de `itens_catalogo` na primeira linha do pedido (API pode enviar só uma das chaves). */
  itens?: AtendimentoItemCatalogo[];
  /** Coluna Pacote. */
  pacote?: string | null;
  /** Coluna Etapa. */
  etapa?: string | null;
  /** Texto exibido (API já enriquece Pacote, colunas P/Q, etc.). */
  descricao: string;
  /** «Descrição Manual» na BD — notas do utilizador (observações), distinto de `descricao`. */
  descricaoManual?: string | null;
  valor: unknown;
  /** Coluna Desconto (ex.: após finalizar cobrança). */
  desconto?: string | null;
  /** `finalizada` = marcado em “Finalizar serviço” (pronto para cobrança). */
  cobrancaStatus?: string | null;
  /** Após finalizar: `pendente` até confirmar; `confirmado` quando pago. */
  pagamentoStatus?: string | null;
  /** Preenchido ao confirmar pagamento (Dinheiro, Pix, Cartão). */
  pagamentoMetodo?: string | null;
  /** Estado visual na grelha da agenda (ex.: confirmado, nao_confirmado). */
  agenda_status?: string | null;
  /** Cor de fundo do cartão no hub (hex). */
  agenda_cor?: string | null;
  /** Soma bruta dos valores das linhas (antes do desconto), em reais. */
  total_bruto?: number;
  /** Total a pagar = total_bruto − desconto (mín. 0), em reais. */
  total?: number;
  /** Desconto aplicado em reais (espelha `Desconto` em formato numérico). */
  desconto_num?: number;
  /** Soma de `comanda_pagamentos.valor` para este atendimento. */
  total_pago?: number;
  /** Soma de parcelas `a_receber_cartao` ainda não liquidadas. */
  total_a_receber_cartao?: number;
  /** total − total_pago (mín. 0). */
  saldo?: number;
  /**
   * Estado consolidado da cobrança derivado pela API:
   * - `aberto`     — `cobranca_status` ainda não é `finalizada` e não há pagamentos.
   * - `pendente`   — finalizada e total_pago = 0.
   * - `parcial`    — finalizada e 0 < total_pago < total.
   * - `pago`       — finalizada e total_pago ≥ total.
   */
  status_cobranca?: 'aberto' | 'pendente' | 'parcial' | 'pago';
  /**
   * `producao` (default) ou `orcamento` — espelho de `atendimentos_pedido.modo`.
   */
  modo?: 'producao' | 'orcamento' | string | null;
  /** Ciclo do orçamento quando `modo = orcamento`. */
  orcamento_status?: 'rascunho' | 'enviado' | 'arquivado' | string | null;
  orcamento_enviado_em?: string | null;
  orcamento_convertido_em?: string | null;
  /**
   * Existe prestação em `comanda_pagamentos` com `metodo = pendente` (fiado) e
   * `data_pagamento` < hoje. Parcelas `a_receber_cartao` não entram aqui.
   * Só é fiável com listagem `/api/atendimentos` actualizada.
   */
  pagamento_prestacao_pendente_atrasada?: boolean;
  /** Menor `data_pagamento` entre linhas ainda `pendente`/fiado (YYYY-MM-DD), se houver. */
  pagamento_prestacao_menor_data?: string | null;
}

/** Métodos aceites no sub-drawer Faturar. */
export type MetodoPagamentoComanda =
  | 'dinheiro'
  | 'cartao_credito'
  | 'cartao_debito'
  | 'pix'
  | 'transferencia'
  | 'outros'
  | 'pendente'
  | 'a_receber_cartao';

/** Linha de `comanda_pagamentos` (1 evento de pagamento parcial ou total). */
export interface ComandaPagamentoItem {
  id: number;
  id_atendimento: string;
  data_pagamento: string;
  /** String numérica em pt-en (ex.: '50.00'); converter com `parseFloat`. */
  valor: string;
  metodo: MetodoPagamentoComanda;
  /** Texto amigável já localizado em pt-BR (ex.: "Cartão de crédito"). */
  metodo_rotulo: string;
  parcelas: number;
  parcela_numero: number | null;
  parcelas_total: number | null;
  troco: string | null;
  observacao: string | null;
  movimentacao_id: number | null;
  created_at: string;
}

/** Resumo financeiro consolidado de uma comanda. */
export interface ComandaResumoPagamentos {
  /** Subtotal após descontos por item (sem desconto da comanda). */
  total_bruto: number;
  /** Só desconto da comanda (`desconto_comanda`); não inclui desconto por item. */
  desconto: number;
  total: number;
  total_pago: number;
  saldo: number;
  status: 'aberto' | 'pendente' | 'parcial' | 'pago';
  cobranca_status: string | null;
}

/** Payload para criar 1 pagamento na comanda. */
export interface CriarComandaPagamentoPayload {
  /** `YYYY-MM-DD`; default = hoje. */
  data_pagamento?: string;
  valor: number;
  metodo: MetodoPagamentoComanda;
  parcelas?: number;
  parcela_numero?: number | null;
  parcelas_total?: number | null;
  metodo_rotulo?: string | null;
  troco?: number | null;
  observacao?: string | null;
}

/** Payload para gravar N pagamentos + finalizar cobrança (transação na API). */
export interface FaturarComandaPayload {
  pagamentos: CriarComandaPagamentoPayload[];
  /** Excesso pago após quitar o total → `clientes.credito_saldo` (sem linha em `comanda_pagamentos`). */
  credito_excesso?: CriarComandaPagamentoPayload[];
  /** Abate do saldo pré-pago do cliente e regista pagamento na comanda. */
  credito_cliente_usado?: number;
  desconto?: string;
}

export interface AtendimentoCriadoResumo {
  id: string;
  nomeCliente?: string;
  data?: string;
  cliente_id?: string;
  /** Número de linhas gravadas em Atendimentos (Mega/Pacote = várias). */
  linhas?: number;
}

/** Linha normalizada da aba Regras Mega (Pacote + Etapa + valores). */
export interface RegraMegaItem {
  id?: number;
  pacote: string;
  etapa: string;
  valor: unknown;
  comissao: unknown;
  /** Duração da etapa na agenda (minutos). */
  duracao_minutos?: number;
}

export interface PacoteCatalogoItem {
  id?: number;
  pacote: string;
  preco: unknown;
}

/** Item da pivot `atendimento_itens` na resposta de listagem. */
export interface AtendimentoItemCatalogo {
  tipo: 'servico' | 'produto' | 'mega' | 'pacote' | 'pacote_queratina' | 'cabelo';
  servico_id: number | null;
  produto_id: number | null;
  quantidade: number;
  profissional_id: number | null;
  tamanho: string | null;
  /** `mega` / `pacote` / `pacote_queratina`: nome do pacote comercial. */
  pacote?: string | null;
  /** `mega` / `pacote` / `pacote_queratina`: etapa (vazio na cabeça do pacote). */
  etapa?: string | null;
  /** `cabelo`: texto da linha. */
  detalhes?: string | null;
  /** FK opcional a `regras_mega` (etapa Mega ou etapa de Pacote). */
  regra_mega_id?: number | null;
  /** FK opcional a `pacotes` (cabeça Pacote ou referência ao pacote comercial). */
  pacote_id?: number | null;
  /** FK opcional a `regras_mega_queratina`. */
  regra_mega_queratina_id?: number | null;
  /** FK opcional a `pacotes_queratina`. */
  pacote_queratina_id?: number | null;
  /** Valor unitário gravado no carrinho (Servico/Produto/Cabelo). String numérica ou null. */
  valor_unitario?: string | null;
  /** Desconto aplicado ao item (R$). String numérica ou null. */
  desconto?: string | null;
  /** Total da linha calculado pelo backend: max(0, qtde × valor_unitario − desconto). */
  total_linha?: number | null;
}

export interface ProdutoCatalogoItem {
  id: number;
  produto: string;
  /** Categoria livre do cadastro (quando existir). */
  categoria?: string;
  marca?: string | null;
  preco: unknown;
  custo?: unknown;
  /** Texto da coluna `estoque` (mesma convenção da planilha). */
  estoque?: unknown;
  estoque_inicial?: unknown;
  estoque_minimo?: unknown;
  unidade: string;
  /** ml/g por 1 unidade física (frasco); default efetivo 1. */
  unidade_equivalente?: string | null;
  preco_profissional?: string | null;
  custo_adicional?: string | null;
  comissao_padrao?: string | null;
  codigo_item?: string | null;
  codigo_barras?: string | null;
  observacoes?: string | null;
  foto_url?: string | null;
}

export interface ProdutoWritePayload {
  produto: string;
  categoria: string;
  marca?: string | null;
  preco?: string | null;
  custo?: string | null;
  estoque_inicial?: string | null;
  estoque_minimo?: string | null;
  unidade?: string | null;
  unidade_equivalente?: string | null;
  preco_profissional?: string | null;
  custo_adicional?: string | null;
  comissao_padrao?: string | null;
  codigo_item?: string | null;
  codigo_barras?: string | null;
  observacoes?: string | null;
  foto_url?: string | null;
}

/** Receita: produto consumido por 1 execução do serviço. */
export interface ServicoProdutoConsumidoItem {
  id?: number;
  servico_id?: number;
  produto_id: number;
  produto: string;
  unidade: string;
  quantidade: string;
}

/** Linha do ledger `estoque_movimentos`. */
export interface EstoqueMovimentoItem {
  id: number;
  produto_id: number;
  id_atendimento: string | null;
  tipo: string;
  origem: string;
  tipo_exibicao: 'Entrada' | 'Saída' | string;
  quantidade: string;
  saldo_anterior: string;
  saldo_apos: string | null;
  created_at: string;
  descricao: string;
  /** Lote/validade quando existir (pode vir vazio). */
  lote?: string | null;
  /** Nome de quem fez o movimento. */
  profissional?: string | null;
  profissional_id?: number | null;
}

/** Referência da aba Cabelos (MVP: ajuda visual; valor vem manual). */
export interface CabeloCatalogoItem {
  cor: string;
  tamanho_cm: unknown;
  metodo: string;
  valor_base: unknown;
}

/** Cadastro `profissionais` (lista `/api/profissionais`). */
export interface ProfissionalListaItem {
  id: number;
  nome: string;
  /** URL da foto de perfil (`foto_url` na API). */
  fotoUrl?: string | null;
  foto_url?: string | null;
  /** Omitido em respostas antigas; na API atual vem sempre preenchido. */
  ativo?: boolean;
  celular?: string | null;
  apelido?: string | null;
  profissao?: string | null;
  aniversario?: string | null;
  cpf_cnpj?: string | null;
  rg?: string | null;
  anotacoes?: string | null;
  disponivel_agendamento_online?: boolean;
  gerar_agenda?: boolean;
  recebe_comissao?: boolean;
  /** `pagamento_cliente` (padrão) ou `competencia` — listagem Financeiro → Comissões. */
  comissao_listagem_modo?: 'pagamento_cliente' | 'competencia';
  cep?: string | null;
  logradouro?: string | null;
  endereco_numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  estado?: string | null;
  cidade?: string | null;
  /** Conta de acesso ligada (`usuarios.role`), quando existir. */
  usuario_role?: 'admin' | 'profissional' | null;
  /** Ordem de exibição na lista e na agenda. */
  ordem?: number;
}

/** Override de comissão por profissional + serviço (`GET/PUT .../comissoes-servicos`). */
export interface ProfissionalComissaoServicoItem {
  servico_id: number;
  servico_nome: string;
  tipo: 'percentual' | 'fixo';
  valor: number;
  como_auxiliar: boolean;
  sobre: string;
}

export type ProfissionalCadastroPayload = {
  nome: string;
  celular: string;
  apelido?: string | null;
  profissao?: string | null;
  aniversario?: string | null;
  cpf_cnpj?: string | null;
  rg?: string | null;
  anotacoes?: string | null;
  ativo?: boolean;
  disponivel_agendamento_online?: boolean;
  gerar_agenda?: boolean;
  recebe_comissao?: boolean;
  comissao_listagem_modo?: 'pagamento_cliente' | 'competencia';
  cep?: string | null;
  logradouro?: string | null;
  endereco_numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  estado?: string | null;
  cidade?: string | null;
  foto_url?: string | null;
};

/** Categoria do razão financeiro (`GET /api/categorias-financeiras`). */
export interface CategoriaFinanceiraItem {
  id: number;
  nome: string;
  natureza: 'receita' | 'despesa';
  slug: string;
  ordem: number;
}

/** Categoria — cadastro admin (`GET /api/financeiro/categorias`). */
export interface FinCategoriaCadastroItem {
  id: number;
  nome: string;
  natureza: 'receita' | 'despesa';
  slug: string;
  ordem: number;
  ativo: boolean;
  sistema: boolean;
}

/** Categoria de produtos/serviços (`GET /api/categorias`). */
export interface CategoriaCatalogoItem {
  id: number;
  nome: string;
  ativo: boolean;
  qtd_itens: number;
}

/** Marca de produtos (`GET /api/marcas`). */
export interface MarcaCatalogoItem {
  id: number;
  nome: string;
  ativo: boolean;
  qtd_itens: number;
}

/** Forma de pagamento — cadastro admin (`GET /api/financeiro/formas-pagamento`). */
export interface FinFormaPrazoFaixa {
  id?: number;
  parcelas_de: number;
  parcelas_ate: number;
  dias_ate_primeira: number;
  intervalo_dias: number;
  /** null = usa taxa da forma. */
  taxa_percentual: number | null;
  juros_cliente: boolean;
}

export interface FinFormaPagamentoCadastroItem {
  id: number;
  nome: string;
  codigo_interno: string;
  baixa_automatica: boolean;
  taxa_percentual: number;
  taxa_fixa: number;
  prazo_recebimento: number;
  ordem: number;
  ativo: boolean;
  sistema: boolean;
  prazos_faixas?: FinFormaPrazoFaixa[];
}

/** Opção de forma para dropdowns (`GET /api/financeiro/formas-pagamento/opcoes`). */
export interface FinFormaPagamentoOpcaoItem {
  id: number;
  nome: string;
  codigo_interno: string;
  baixa_automatica: boolean;
  taxa_percentual: number;
  taxa_fixa: number;
  prazo_recebimento: number;
  prazos_faixas?: FinFormaPrazoFaixa[];
}

/** Linha de `movimentacoes` na API Node. */
export interface MovimentacaoListaItem {
  id: number;
  data_mov: string;
  natureza: 'receita' | 'despesa';
  valor: string;
  categoria_id: number;
  descricao: string | null;
  id_atendimento: string | null;
  metodo_pagamento: string | null;
  origem: string;
  created_at: string;
  /** Preenchido quando existe linha em `despesas` ligada (cadastro estruturado). */
  despesa_tipo?: string | null;
  despesa_categoria_livre?: string | null;
}

/** Resumo mensal por profissional (`GET /api/financeiro/comissoes/resumidas`). */
export interface FinComissaoResumidaItem {
  folha_id: number;
  profissional_id: number;
  profissional_nome: string;
  periodo_referencia: string;
  total_comissao: number;
  total_pago: number;
  saldo: number;
  status: string;
}

/** Lote de comissões já pago (`GET /api/financeiro/comissoes/pagas`). */
export interface FinComissaoPagaItem {
  movimentacao_id: number;
  data_ymd: string;
  pagamento_ymd: string;
  profissional_id: number;
  profissional_nome: string;
  usuario_nome: string;
  comissoes: number;
  vales: number;
  bonificacoes: number;
  valor_pago: number;
}

/** Linha detalhada de comissões (`GET /api/financeiro/comissoes/detalhadas`). */
export interface FinComissaoDetalheItem {
  id: number;
  data_ymd: string;
  id_atendimento: string;
  id_cliente: string;
  cliente_nome: string;
  numero_comanda: number | null;
  servico: string;
  quantidade: number;
  valor: number;
  comissao: number;
  comissao_pct: number | null;
  comissao_tipo: string;
  disponivel: number;
}

/** Linha unificada (`GET /api/financeiro/transacoes`). */
export interface FinTransacaoItem {
  tipo: 'movimentacao' | 'pendencia';
  id_ui: number;
  data_mov: string;
  criado_em?: string;
  natureza: 'receita' | 'despesa';
  valor: string;
  categoria_id: number;
  categoria_nome: string;
  descricao: string | null;
  id_atendimento: string | null;
  metodo_pagamento: string | null;
  origem: string;
  numero_comanda: number | null;
  nome_cliente: string | null;
  /** `clientes.id_cliente` quando há `id_atendimento`. */
  id_cliente: string | null;
  subtitulo: string;
  origem_label: string;
  movimentacao_id: number | null;
  comanda_pagamento_id: number | null;
  status: 'pago' | 'atrasado' | 'em_aberto';
  editavel: boolean;
  metodo_baixa_automatica?: boolean;
  pago_em?: string | null;
  taxa_percentual?: number;
  taxa_fixa?: number;
}

/** Resumo diário (`GET /api/caixa/dia?data=`). */
export interface CaixaDiaResumo {
  data: string;
  total_receitas: string;
  total_despesas: string;
  saldo_dia: string;
  receitas_por_metodo: { metodo: string; total: string }[];
}

/** Linha de `folha` por competência (`GET /api/folha?periodo=` + PIN). */
export interface FolhaListaItem {
  id: number;
  profissional_id: number | null;
  profissional: string | null;
  periodo_referencia: string | null;
  mes: string | null;
  total_comissao: string | null;
  total_pago: string | null;
  saldo: string | null;
  status: string | null;
}

/** Resposta de `POST /api/folha/recalcular-comissoes`. */
export interface RecalcularFolhaComissoesResposta {
  periodo: string;
  linhas_folha_atualizadas: number;
  itens: {
    folha_id: number;
    profissional_id: number | null;
    total_comissao_reais: number;
    linhas_atendimento: number;
  }[];
}

/** Tipo gravado na API / coluna Tipo da listagem. */
export type TipoAtendimento =
  | 'Serviço'
  | 'Mega'
  | 'Pacote'
  | 'Pacote Adesivo+Queratina'
  | 'Cabelo'
  | 'Produto';

/** Tipo por linha no formulário “Novo atendimento” (+ Linha). */
export type TipoLinhaAtendimento = TipoAtendimento;

export interface AtendimentoEtapaPayload {
  etapa: string;
  profissional_id: number;
}

/** Opcional na criação: `YYYY-MM-DD HH:mm:ss` na primeira linha (ou única). */
export type AgendaSlotCriacaoOpcional = {
  inicio?: string;
  fim?: string;
};

/** Cor e estado do cartão na agenda (hub). */
export type AgendaCartaoCriacaoOpcional = {
  agenda_status?: string;
  agenda_cor?: string;
};

/** Metadados opcionais para ocorrências de uma mesma série de repetição. */
export type RecorrenciaCriacaoOpcional = {
  id_recorrencia?: string;
  ordem_recorrencia?: number;
};

/** Força reutilizar um id de atendimento existente em fluxo de edição. */
export type AtendimentoIdCriacaoOpcional = {
  id_atendimento?: string;
};

/** `orcamento` = fora de agenda/financeiro até converter. */
export type PedidoModoCriacaoOpcional = {
  modo?: 'producao' | 'orcamento';
};

/** Desconto por linha (R$) na criação/edição do atendimento. */
export type DescontoCriacaoOpcional = {
  desconto?: string;
};

/** União de payloads para createAgendamento / createAtendimento. */
export type CreateAtendimentoPayload = (
  | {
      tipo: 'Serviço';
      cliente_id: string;
      data: string;
      profissional_id: number;
      servico_id: string;
      tamanho?: string;
      observacao?: string;
      /** Override do valor unitário (R$); ausente = preço do catálogo. */
      valor_unitario?: number | string | null;
      /** Desconto aplicado ao item (R$). */
      desconto_item?: number | string | null;
      /** Vários serviços no mesmo pedido; cada entrada → linha em `atendimentos` + `atendimento_itens`. */
      itens_servicos?: {
        servico_id: string;
        quantidade: number;
        profissional_id?: number | null;
        tamanho?: string;
        valor_unitario?: number | string | null;
        desconto?: number | string | null;
      }[];
    }
    | {
      tipo: 'Mega';
      cliente_id: string;
      data: string;
      pacote: string;
      etapas: AtendimentoEtapaPayload[];
      observacao?: string;
    }
  | {
      tipo: 'Pacote';
      cliente_id: string;
      data: string;
      profissional_id?: number | null;
      pacote: string;
      etapas: AtendimentoEtapaPayload[];
      observacao?: string;
    }
  | {
      tipo: 'Pacote Adesivo+Queratina';
      cliente_id: string;
      data: string;
      profissional_id?: number | null;
      pacote: string;
      etapas: AtendimentoEtapaPayload[];
      observacao?: string;
    }
  | {
      tipo: 'Produto';
      cliente_id: string;
      data: string;
      profissional_id?: number | null;
      /** Modo simples: um produto por nome. */
      produto?: string;
      quantidade?: number;
      observacao?: string;
      /** Se o catálogo não tiver `preco` preenchido. */
      preco_unitario?: number;
      /** Override do valor unitário (R$). Tem prioridade sobre `preco_unitario` e catálogo. */
      valor_unitario?: number | string | null;
      /** Desconto aplicado ao item (R$). */
      desconto_item?: number | string | null;
      /** Vários produtos no mesmo pedido (`produto_id` = `produtos.id`). */
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
      /** Opcional: comissão/agenda sem profissional associado à linha. */
      profissional_id?: number | null;
      valor: number;
      observacao?: string;
      detalhes_cabelo?: string;
      /** Desconto aplicado ao item Cabelo (R$). */
      desconto_item?: number | string | null;
    }
) &
  AgendaSlotCriacaoOpcional &
  AgendaCartaoCriacaoOpcional &
  RecorrenciaCriacaoOpcional &
  AtendimentoIdCriacaoOpcional &
  PedidoModoCriacaoOpcional &
  DescontoCriacaoOpcional;
