import type { ComandaLinhaInicial } from '../../core/models/comanda-linha-inicial';
import type { Cliente } from '../../core/models/api.models';
import type { SaasSelectOption } from '../components/saas-select/saas-select.component';

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
   * Número global da comanda (`atendimentos_pedido.numero_comanda`) para o título «Visualizando comanda #N»;
   * ao criar no hub, estimativa `max + 1` sobre os itens já carregados até a API devolver o definitivo.
   */
  numeroComandaTitulo: number;
  clienteId: string;
  cliente: Cliente | null;
  opcoesClientes: SaasSelectOption[];
  dataYmd: string | null;
};
