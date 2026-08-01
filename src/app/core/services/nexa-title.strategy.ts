import { Injectable, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';

export const APP_NOME = 'Nexa Beauty';

/**
 * Formata o título da aba como "Nexa Beauty | {tela}" a partir do
 * `title` definido em cada rota. Sem título de rota, fica só "Nexa Beauty".
 */
@Injectable({ providedIn: 'root' })
export class NexaTitleStrategy extends TitleStrategy {
  private readonly title = inject(Title);

  override updateTitle(snapshot: RouterStateSnapshot): void {
    const tela = this.buildTitle(snapshot);
    this.title.setTitle(tela ? `${APP_NOME} | ${tela}` : APP_NOME);
  }
}
