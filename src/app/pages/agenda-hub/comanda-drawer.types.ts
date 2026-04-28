import type { Cliente } from '../../core/models/api.models';
import type { SaasSelectOption } from '../agenda-novo/saas-select.component';

/** Contexto ao abrir o drawer de comanda a partir do agendamento (mesmo cliente / data). */
export type ComandaDrawerContextoAgenda = {
  acessar: boolean;
  idAtendimento?: string | null;
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
