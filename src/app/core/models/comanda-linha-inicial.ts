/**
 * Linha pré-preenchida na comanda ao abrir a partir do agendamento (formulário ainda não gravado).
 */
export type ComandaLinhaInicial = {
  itemTipo: 'Serviço' | 'Produto' | 'Mega' | 'Pacote' | 'Cabelo';
  servico_id?: string;
  tamanho?: string;
  profissional?: number | null;
  resumoNaoServico?: string;
  quantidade: number;
  valorUnitStr: string;
  descontoStr: string;
};
