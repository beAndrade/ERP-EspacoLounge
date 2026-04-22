import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import { CategoriaFinanceiraItem } from '../../core/models/api.models';

function todayYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Estado partilhado entre o shell (filtros na toolbar) e `FinanceiroComponent`. */
@Injectable()
export class FinanceiroResumoUiService {
  dataYmd = todayYmd();
  filtroCategoriaMovimentos: number | null = null;
  categorias: CategoriaFinanceiraItem[] = [];

  private readonly atualizar$ = new Subject<void>();
  readonly solicitacaoAtualizacao$ = this.atualizar$.asObservable();

  solicitarRecarregar(): void {
    this.atualizar$.next();
  }
}
