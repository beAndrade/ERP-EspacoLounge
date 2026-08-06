export type OrcamentoPrintItem = {
  descricao: string;
  quantidade: number;
  valorUnitario: number;
  total: number;
};

export type OrcamentoPrintPayload = {
  idAtendimento: string;
  clienteNome: string;
  telefone?: string;
  clienteId?: string;
  dataYmd: string;
  dataFmt: string;
  numeroComanda: string;
  itens: OrcamentoPrintItem[];
  subtotal: number;
  desconto: number;
  total: number;
  observacoes?: string;
  nomeEmpresa?: string;
};

export type OrcamentoPrintModo = 'print-only' | 'preview';
