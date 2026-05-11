export interface ApiError {
  code: string;
  message: string;
}

export interface ApiResponse<T> {
  ok: boolean;
  data: T | null;
  error: ApiError | null;
}

/** Normalizado a partir da aba Clientes (planilha ERP Espaço Lounge). */
export interface Cliente {
  id: string;
  nome: string;
  telefone: string | null;
  observacoes: string | null;
}

/**
 * Linha da aba Serviços; `id` = PK `servicos.id` (= número da linha na planilha, primeira linha de dados = 2).
 * Demais chaves = cabeçalhos da linha 1 (ex.: Serviço, Tipo, Valor Base).
 */
export interface Servico {
  id: string;
  [key: string]: unknown;
}

/** Item da lista Agenda (aba Atendimentos), normalizado para a UI. */
export interface AtendimentoListaItem {
  id: string;
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
}

/** Métodos aceites no sub-drawer Faturar. */
export type MetodoPagamentoComanda =
  | 'dinheiro'
  | 'cartao_credito'
  | 'cartao_debito'
  | 'pix'
  | 'transferencia'
  | 'outros';

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
  troco: string | null;
  observacao: string | null;
  movimentacao_id: number | null;
  created_at: string;
}

/** Resumo financeiro consolidado de uma comanda. */
export interface ComandaResumoPagamentos {
  total_bruto: number;
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
  troco?: number | null;
  observacao?: string | null;
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
  pacote: string;
  etapa: string;
  valor: unknown;
  comissao: unknown;
  /** Duração da etapa na agenda (minutos). */
  duracao_minutos?: number;
}

export interface PacoteCatalogoItem {
  pacote: string;
  preco: unknown;
}

/** Item da pivot `atendimento_itens` na resposta de listagem. */
export interface AtendimentoItemCatalogo {
  tipo: 'servico' | 'produto' | 'mega' | 'pacote' | 'cabelo';
  servico_id: number | null;
  produto_id: number | null;
  quantidade: number;
  profissional_id: number | null;
  tamanho: string | null;
  /** `mega` / `pacote`: nome do pacote comercial. */
  pacote?: string | null;
  /** `mega` / `pacote`: etapa (vazio na cabeça do pacote). */
  etapa?: string | null;
  /** `cabelo`: texto da linha. */
  detalhes?: string | null;
  /** FK opcional a `regras_mega` (etapa Mega ou etapa de Pacote). */
  regra_mega_id?: number | null;
  /** FK opcional a `pacotes` (cabeça Pacote ou referência ao pacote comercial). */
  pacote_id?: number | null;
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
  preco: unknown;
  /** Texto da coluna `estoque` (mesma convenção da planilha). */
  estoque?: unknown;
  unidade: string;
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
  /** Omitido em respostas antigas; na API atual vem sempre preenchido. */
  ativo?: boolean;
}

/** Categoria do razão financeiro (`GET /api/categorias-financeiras`). */
export interface CategoriaFinanceiraItem {
  id: number;
  nome: string;
  natureza: 'receita' | 'despesa';
  slug: string;
  ordem: number;
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
      profissional_id: number;
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
  DescontoCriacaoOpcional;
