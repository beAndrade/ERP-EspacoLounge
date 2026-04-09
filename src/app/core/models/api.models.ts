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
  /** Coluna Descrição da planilha; se vazia, usa Serviços como texto de apoio. */
  descricao: string;
  valor: unknown;
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

export type TipoAtendimento =
  | 'Serviço'
  | 'Mega'
  | 'Pacote'
  | 'Cabelo'
  | 'Produto';

export interface AtendimentoEtapaPayload {
  etapa: string;
  profissional: string;
}

/** União de payloads para createAgendamento / createAtendimento. */
export type CreateAtendimentoPayload =
  | {
      tipo: 'Serviço';
      cliente_id: string;
      data: string;
      profissional: string;
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
      profissional: string;
      pacote: string;
      etapas: AtendimentoEtapaPayload[];
      observacao?: string;
    }
  | {
      tipo: 'Produto';
      cliente_id: string;
      data: string;
      profissional: string;
      produto: string;
      quantidade: number;
      observacao?: string;
    }
  | {
      tipo: 'Cabelo';
      cliente_id: string;
      data: string;
      profissional: string;
      valor: number;
      observacao?: string;
      detalhes_cabelo?: string;
    };
