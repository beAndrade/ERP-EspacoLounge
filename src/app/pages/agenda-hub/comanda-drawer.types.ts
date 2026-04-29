import type { ComandaLinhaInicial } from '../../core/models/comanda-linha-inicial';
import type { Cliente } from '../../core/models/api.models';
import type { SaasSelectOption } from '../agenda-novo/saas-select.component';

/** Contexto ao abrir o drawer de comanda a partir do agendamento (mesmo cliente / data). */
export type ComandaDrawerContextoAgenda = {
  acessar: boolean;
  idAtendimento?: string | null;
  /**
   * Linhas do pedido no formulário de agendamento (quando ainda não há `idAtendimento`
   * ou como referência). O drawer prefere dados da API quando `idAtendimento` devolve linhas.
   */
  linhasSnapshot?: ComandaLinhaInicial[];
  /**
   * Índice exibido no título «Editando comanda #N»: entre comandas abertas do cliente no dia,
   * ou `abertas + 1` ao criar nova.
   */
  numeroComandaTitulo: number;
  clienteId: string;
  cliente: Cliente | null;
  opcoesClientes: SaasSelectOption[];
  dataYmd: string | null;
};
