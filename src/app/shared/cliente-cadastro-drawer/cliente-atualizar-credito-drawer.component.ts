import {
  Component,
  DestroyRef,
  inject,
  input,
  OnInit,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { catchError, of } from 'rxjs';
import { SheetsApiService } from '../../core/services/sheets-api.service';
import { extractApiErrorMessage } from '../../core/utils/api-error-message';
import type { CriarClienteCreditoMovimentoPayload } from '../../core/models/api.models';
import {
  formataMoedaBrl,
  moedaAPartirDosDigitos,
} from '../../core/utils/brl-digit-input';

function parsePtDecimal(s: string): number {
  const t = String(s ?? '')
    .trim()
    .replace(/R\$/gi, '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s/g, '')
    .replace(/\./g, '')
    .replace(',', '.');
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : 0;
}

const PLACEHOLDER_MOEDA = 'R$ 0,00';
const MOTIVO_MAX = 400;

export type MovimentacaoCreditoForm = 'adicionar' | 'retirar';

@Component({
  selector: 'app-cliente-atualizar-credito-drawer',
  standalone: true,
  imports: [ReactiveFormsModule, FormsModule],
  templateUrl: './cliente-atualizar-credito-drawer.component.html',
  styleUrl: './cliente-atualizar-credito-drawer.component.scss',
})
export class ClienteAtualizarCreditoDrawerComponent implements OnInit {
  readonly clienteId = input.required<string>();

  readonly salvo = output<{ saldo: number }>();
  readonly fechar = output<void>();

  private readonly api = inject(SheetsApiService);
  private readonly destroyRef = inject(DestroyRef);

  readonly valorCtrl = new FormControl(PLACEHOLDER_MOEDA, { nonNullable: true });
  movimentacao: MovimentacaoCreditoForm = 'adicionar';
  gerarMovimentacaoFinanceira = false;
  motivo = '';

  readonly placeholderMoeda = PLACEHOLDER_MOEDA;
  readonly motivoMax = MOTIVO_MAX;
  readonly salvando = signal(false);
  erro: string | null = null;

  ngOnInit(): void {
    this.valorCtrl.setValue(PLACEHOLDER_MOEDA, { emitEvent: false });
  }

  onValorMoedaInput(ev: Event): void {
    const el = ev.target as HTMLInputElement | null;
    if (!el) return;
    const fmt = moedaAPartirDosDigitos(el.value);
    this.valorCtrl.setValue(fmt, { emitEvent: false });
    el.value = fmt;
  }

  onValorBlur(): void {
    const v = parsePtDecimal(this.valorCtrl.value);
    this.valorCtrl.setValue(formataMoedaBrl(v), { emitEvent: false });
  }

  onMotivoInput(ev: Event): void {
    const el = ev.target as HTMLTextAreaElement | null;
    if (!el) return;
    this.motivo = el.value.slice(0, MOTIVO_MAX);
    el.value = this.motivo;
  }

  toggleGerarMovimentacaoFinanceira(): void {
    this.gerarMovimentacaoFinanceira = !this.gerarMovimentacaoFinanceira;
  }

  onToggleFinKeydown(ev: KeyboardEvent): void {
    if (ev.key === ' ' || ev.key === 'Enter') {
      ev.preventDefault();
      this.toggleGerarMovimentacaoFinanceira();
    }
  }

  cancelar(): void {
    this.fechar.emit();
  }

  salvar(): void {
    if (this.salvando()) return;
    const cid = String(this.clienteId() ?? '').trim();
    if (!cid) return;

    const valor = parsePtDecimal(this.valorCtrl.value);
    if (!Number.isFinite(valor) || valor <= 0) {
      this.erro = 'Informe um valor maior que zero.';
      return;
    }

    const tipo: CriarClienteCreditoMovimentoPayload['tipo'] =
      this.movimentacao === 'retirar' ? 'retirar' : 'adicionar';

    this.erro = null;
    this.salvando.set(true);

    this.api
      .criarClienteCreditoMovimento(cid, {
        valor,
        tipo,
        motivo: this.motivo.trim() || undefined,
        gerar_movimentacao_financeira: this.gerarMovimentacaoFinanceira,
      })
      .pipe(
        catchError((err) => {
          this.erro = extractApiErrorMessage(err);
          return of(null);
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((res) => {
        this.salvando.set(false);
        if (!res) return;
        this.salvo.emit({ saldo: res.saldo });
      });
  }
}
