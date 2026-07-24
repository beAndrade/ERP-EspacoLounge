/**
 * Linha pré-preenchida na comanda ao abrir a partir do agendamento (formulário ainda não gravado).
 */
export type ComandaLinhaInicial = {
  itemTipo: 'Serviço' | 'Produto' | 'Mega' | 'Pacote' | 'Pacote Adesivo+Queratina' | 'Cabelo';
  servico_id?: string;
  tamanho?: string;
  profissional?: number | null;
  resumoNaoServico?: string;
  quantidade: number;
  valorUnitStr: string;
  descontoStr: string;
  /** Total da linha (qtd × V. unit. − desc., formato pt-BR) para espelhar a comanda. */
  totalLinhaStr?: string;
};
