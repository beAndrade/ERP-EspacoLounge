import { Component, EventEmitter, Input, OnChanges, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { UiTipTriggerComponent } from '../../../../shared/ui-tip-trigger/ui-tip-trigger.component';

export type FinCadastroDrawerModo = 'categoria' | 'forma';

@Component({
  selector: 'app-fin-cadastro-drawer',
  standalone: true,
  imports: [FormsModule, UiTipTriggerComponent],
  templateUrl: './fin-cadastro-drawer.component.html',
  styleUrl: './fin-cadastro-drawer.component.scss',
})
export class FinCadastroDrawerComponent implements OnChanges {
  readonly tipTelaPadrao =
    'Se definir a tela padrão para uma categoria, ela será usada automaticamente ao executar uma ação naquela tela (ex.: categoria «Pacotes» ao criar pacotes). No Espaço Lounge este vínculo ainda não está disponível.';

  @Input({ required: true }) modo!: FinCadastroDrawerModo;
  @Input() titulo = 'Novo';
  @Input() nome = '';
  @Input() natureza: 'receita' | 'despesa' = 'despesa';
  @Input() naturezaBloqueada = false;
  @Input() taxaPercentual = 0;
  @Input() taxaFixa = 0;
  @Input() prazoRecebimento = 0;
  @Input() baixaAutomatica = false;
  @Input() ativo = true;
  @Input() salvando = false;

  @Output() fechar = new EventEmitter<void>();
  @Output() salvar = new EventEmitter<{
    nome: string;
    natureza?: 'receita' | 'despesa';
    taxa_percentual?: number;
    taxa_fixa?: number;
    prazo_recebimento?: number;
    baixa_automatica?: boolean;
    ativo?: boolean;
  }>();

  taxaPctTexto = '';
  taxaFixaDigitos = '';
  prazoRecebimentoTexto = '';

  ngOnChanges(): void {
    if (this.modo !== 'forma') return;
    this.taxaPctTexto = this.formatTaxaPctExibicao(this.taxaPercentual);
    this.taxaFixaDigitos = String(Math.round(this.taxaFixa * 100));
    this.prazoRecebimentoTexto =
      this.prazoRecebimento > 0 ? String(this.prazoRecebimento) : '';
  }

  rotuloTaxaFixa(): string {
    if (!this.taxaFixaDigitos.trim()) return 'R$ 0,00';
    const v = (parseInt(this.taxaFixaDigitos, 10) || 0) / 100;
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(v);
  }

  onTaxaPctInput(ev: Event): void {
    let v = (ev.target as HTMLInputElement).value.replace(/[^\d,]/g, '');
    const parts = v.split(',');
    if (parts.length > 2) {
      v = `${parts[0]},${parts.slice(1).join('')}`;
    }
    if (parts.length === 2 && parts[1].length > 3) {
      v = `${parts[0]},${parts[1].slice(0, 3)}`;
    }
    this.taxaPctTexto = v;
    (ev.target as HTMLInputElement).value = v;
  }

  onTaxaFixaInput(ev: Event): void {
    const el = ev.target as HTMLInputElement;
    const d = el.value.replace(/\D/g, '').slice(0, 15);
    this.taxaFixaDigitos = d;
    el.value = this.rotuloTaxaFixa();
  }

  onPrazoInput(ev: Event): void {
    const el = ev.target as HTMLInputElement;
    const d = el.value.replace(/\D/g, '').slice(0, 4);
    this.prazoRecebimentoTexto = d;
    el.value = d;
  }

  private formatTaxaPctExibicao(v: number): string {
    if (!Number.isFinite(v) || v <= 0) return '';
    return v.toLocaleString('pt-BR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 3,
    });
  }

  private parseTaxaPct(): number {
    const t = this.taxaPctTexto.trim();
    if (!t) return 0;
    const n = parseFloat(t.replace(',', '.'));
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.min(100, Math.round(n * 1000) / 1000);
  }

  private parseTaxaFixa(): number {
    return (parseInt(this.taxaFixaDigitos || '0', 10) || 0) / 100;
  }

  private parsePrazoRecebimento(): number {
    const n = parseInt(this.prazoRecebimentoTexto || '0', 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }

  onSalvar(): void {
    const nome = String(this.nome ?? '').trim();
    if (!nome) return;
    if (this.modo === 'categoria') {
      this.salvar.emit({ nome, natureza: this.natureza });
      return;
    }
    this.salvar.emit({
      nome,
      taxa_percentual: this.parseTaxaPct(),
      taxa_fixa: this.parseTaxaFixa(),
      prazo_recebimento: this.parsePrazoRecebimento(),
      baixa_automatica: this.baixaAutomatica,
      ativo: this.ativo,
    });
  }
}
