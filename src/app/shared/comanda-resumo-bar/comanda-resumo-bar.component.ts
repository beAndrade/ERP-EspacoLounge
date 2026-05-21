import { Component, Input } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import {
  formataMoedaBrlResumo,
  moedaResumoAPartirDosDigitos,
  PLACEHOLDER_MOEDA_RESUMO,
} from './comanda-resumo.utils';
import { valorMonetarioParaNumero } from '../../core/utils/atendimento-display';

@Component({
  selector: 'app-comanda-resumo-bar',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './comanda-resumo-bar.component.html',
  styleUrl: './comanda-resumo-bar.component.scss',
})
export class ComandaResumoBarComponent {
  @Input({ required: true }) descontoResumoCtrl!: FormControl<string>;
  @Input({ required: true }) creditoResumoCtrl!: FormControl<string>;
  /** Desconto readonly (comanda finalizada). */
  @Input() descontoSomenteLeitura = false;
  @Input() cashbackReais = 0;
  @Input() totalReais = 0;

  readonly placeholderMoeda = PLACEHOLDER_MOEDA_RESUMO;

  brl(n: number): string {
    return formataMoedaBrlResumo(n);
  }

  onResumoMoedaInput(c: FormControl<string>, ev: Event): void {
    const el = ev.target as HTMLInputElement | null;
    if (!el) return;
    const formatted = moedaResumoAPartirDosDigitos(el.value);
    if (c.value !== formatted) {
      c.setValue(formatted, { emitEvent: true });
    }
    queueMicrotask(() => {
      const len = el.value.length;
      el.setSelectionRange(len, len);
    });
  }

  onCreditoResumoMoedaInput(ev: Event): void {
    this.creditoResumoCtrl.markAsDirty();
    this.onResumoMoedaInput(this.creditoResumoCtrl, ev);
  }

  normalizarCampoMoedaResumo(c: FormControl<string>): void {
    const n = valorMonetarioParaNumero(c.value);
    const v = n != null && Number.isFinite(n) ? Math.max(0, n) : 0;
    c.setValue(formataMoedaBrlResumo(v), { emitEvent: false });
  }
}
