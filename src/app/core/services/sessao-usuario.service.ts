import { Injectable } from '@angular/core';

/**
 * Nome do utilizador autenticado para saudações na UI.
 * Substituir por dados reais quando existir login.
 */
@Injectable({ providedIn: 'root' })
export class SessaoUsuarioService {
  nomeExibicao(): string {
    return 'usuário logado';
  }
}
