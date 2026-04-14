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
 * Linha da aba Serviços; `id` = número da linha na planilha (primeira linha de dados = 2).
 * Demais chaves = cabeçalhos da linha 1 (ex.: Serviço, Tipo, Valor Base).
 */
export interface Servico {
  id: string;
  [key: string]: unknown;
}

/** Item da lista Agenda (aba Atendimentos), normalizado para a UI. */
export interface AtendimentoListaItem {
  id: string;
  /** Sempre `AAAA-MM-DD` (para ordenar); na tela usa-se formato dia-mês-ano. */
  data: string;
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
  /** Nome do profissional (resolvido a partir de `folha` na API). */
  profissional?: string | null;
  /** ID na Folha (`atendimentos.profissional_id`). */
  profissional_id?: number | null;
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
}

export interface PacoteCatalogoItem {
  pacote: string;
  preco: unknown;
}

export interface ProdutoCatalogoItem {
  produto: string;
  preco: unknown;
  unidade: string;
}

/** Referência da aba Cabelos (MVP: ajuda visual; valor vem manual). */
export interface CabeloCatalogoItem {
  cor: string;
  tamanho_cm: unknown;
  metodo: string;
  valor_base: unknown;
}

/** Linha da aba Folha (`folha.id` + nome para exibição). */
export interface ProfissionalListaItem {
  id: number;
  nome: string;
}

export type TipoAtendimento =
  | 'Serviço'
  | 'Mega'
  | 'Pacote'
  | 'Cabelo'
  | 'Produto';

export interface AtendimentoEtapaPayload {
  etapa: string;
  profissional_id: number;
}

/** União de payloads para createAgendamento / createAtendimento. */
export type CreateAtendimentoPayload =
  | {
      tipo: 'Serviço';
      cliente_id: string;
      data: string;
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
    };
