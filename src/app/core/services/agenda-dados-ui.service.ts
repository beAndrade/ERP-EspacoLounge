import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

/**
 * Sinaliza que a agenda mudou (criar / editar / excluir),
 * para o painel e outros ecrãs recarregarem agregados (ex.: mapa de calor).
 */
@Injectable({ providedIn: 'root' })
export class AgendaDadosUiService {
  private readonly mudou$ = new Subject<void>();
  readonly mudancas$ = this.mudou$.asObservable();

  notificarMudanca(): void {
    this.mudou$.next();
  }
}
