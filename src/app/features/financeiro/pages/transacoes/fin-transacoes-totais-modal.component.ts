import { Component, input, output } from '@angular/core';
import { CurrencyPipe } from '@angular/common';

export interface FinTransacoesTotaisResumo {
  recebidos: number;
  aReceber: number;
  pagos: number;
  aPagar: number;
  quantidadeLinhas: number;
}

@Component({
  selector: 'app-fin-transacoes-totais-modal',
  standalone: true,
  imports: [CurrencyPipe],
  templateUrl: './fin-transacoes-totais-modal.component.html',
  styleUrl: './fin-transacoes-totais-modal.component.scss',
})
export class FinTransacoesTotaisModalComponent {
  readonly aberto = input(false);
  readonly resumo = input<FinTransacoesTotaisResumo>({
    recebidos: 0,
    aReceber: 0,
    pagos: 0,
    aPagar: 0,
    quantidadeLinhas: 0,
  });

  readonly fechar = output<void>();

  readonly cards = [
    { id: 'recebidos', titulo: 'Recebidos', tema: 'recebidos' as const },
    { id: 'a-receber', titulo: 'A Receber', tema: 'a-receber' as const },
    { id: 'pagos', titulo: 'Pagos', tema: 'pagos' as const },
    { id: 'a-pagar', titulo: 'A Pagar', tema: 'a-pagar' as const },
  ];

  valorCard(id: string): number {
    const r = this.resumo();
    switch (id) {
      case 'recebidos':
        return r.recebidos;
      case 'a-receber':
        return r.aReceber;
      case 'pagos':
        return r.pagos;
      case 'a-pagar':
        return r.aPagar;
      default:
        return 0;
    }
  }

  onOverlayClick(ev: MouseEvent): void {
    if (
      (ev.target as HTMLElement).classList.contains(
        'fin-trans-totais-modal-overlay',
      )
    ) {
      this.fechar.emit();
    }
  }
}
