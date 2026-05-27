import type { Cliente } from '../../core/models/api.models';
import type { ComandaDrawerContextoAgenda } from '../../features/agenda/pages/hub/comanda-drawer.types';
import type {
  AbrirCadastroClientePayload,
  ClienteCadastroDrawerAbrirEdicaoOptions,
  ClienteCadastroDrawerCallbacks,
} from './cliente-cadastro-drawer.service';
import { ClienteCadastroDrawerService } from './cliente-cadastro-drawer.service';

/** Referência mutável ao contexto do `app-nova-comanda-drawer` no ecrã pai. */
export interface ComandaDrawerContextoHolder {
  get(): ComandaDrawerContextoAgenda | null;
  set(ctx: ComandaDrawerContextoAgenda): void;
}

export function callbacksCadastroSidebarComanda(
  holder: ComandaDrawerContextoHolder,
  onAposSalvar?: (clienteId: string) => void,
): ClienteCadastroDrawerCallbacks {
  return {
    onClienteCarregado: (c: Cliente) => {
      const ctx = holder.get();
      const cid = ctx?.clienteId?.trim();
      if (!cid || ctx?.clienteId?.trim() !== cid) return;
      holder.set({ ...ctx, cliente: c });
    },
    onSalvo: (salvo: Cliente) => {
      const cidSalvo = (salvo.id ?? '').trim();
      const ctx = holder.get();
      if (!cidSalvo || ctx?.clienteId?.trim() !== cidSalvo) return;
      holder.set({ ...ctx, cliente: salvo });
      onAposSalvar?.(cidSalvo);
    },
  };
}

export function opcoesCadastroSidebarComanda(
  holder: ComandaDrawerContextoHolder,
  onAposSalvar?: (clienteId: string) => void,
): Pick<ClienteCadastroDrawerAbrirEdicaoOptions, 'nomeLista' | 'callbacks'> {
  const ctx = holder.get();
  return {
    nomeLista: ctx?.cliente?.nome?.trim() ?? '',
    callbacks: callbacksCadastroSidebarComanda(holder, onAposSalvar),
  };
}

/**
 * Botões «Informações» da sidebar de cliente (`app-agenda-novo-client-sidebar`)
 * com comanda aberta — reutiliza o drawer global de ficha (`ClienteCadastroDrawerService`).
 */
export function abrirCadastroClienteDesdeSidebarComanda(
  cadastro: ClienteCadastroDrawerService,
  holder: ComandaDrawerContextoHolder,
  payload: AbrirCadastroClientePayload = {},
  onAposSalvar?: (clienteId: string) => void,
): void {
  const cid = holder.get()?.clienteId?.trim();
  if (!cid) return;
  cadastro.abrirEdicaoPorLinkSidebar(cid, payload, {
    ...opcoesCadastroSidebarComanda(holder, onAposSalvar),
  });
}
