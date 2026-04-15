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
  /** Itens de catálogo na pivot `atendimento_itens` para este `id_atendimento`. */
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

/** Item da pivot `atendimento_itens` na resposta de listagem. */
export interface AtendimentoItemCatalogo {
  tipo: 'servico' | 'produto';
  servico_id: number | null;
  produto_id: number | null;
  quantidade: number;
  profissional_id: number | null;
  tamanho: string | null;
}

export interface ProdutoCatalogoItem {
  id: number;
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

/** Cadastro `profissionais` (lista `/api/profissionais`). */
export interface ProfissionalListaItem {
  id: number;
  nome: string;
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
}

/** Resumo diário (`GET /api/caixa/dia?data=`). */
export interface CaixaDiaResumo {
  data: string;
  total_receitas: string;
  total_despesas: string;
  saldo_dia: string;
  receitas_por_metodo: { metodo: string; total: string }[];
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

/** Opcional na criação: `YYYY-MM-DD HH:mm:ss` na primeira linha (ou única). */
export type AgendaSlotCriacaoOpcional = {
  inicio?: string;
  fim?: string;
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
      /** Vários serviços no mesmo pedido; cada entrada → linha em `atendimentos` + `atendimento_itens`. */
      itens_servicos?: {
        servico_id: string;
        quantidade: number;
        profissional_id?: number | null;
        tamanho?: string;
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
      /** Vários produtos no mesmo pedido (`produto_id` = `produtos.id`). */
      itens_produtos?: {
        produto_id: number;
        quantidade: number;
        profissional_id?: number | null;
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
    }
) &
  AgendaSlotCriacaoOpcional;
