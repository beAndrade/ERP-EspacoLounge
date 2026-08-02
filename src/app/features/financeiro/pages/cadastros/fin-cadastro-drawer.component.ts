import { Component, EventEmitter, Input, OnChanges, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { FinFormaPrazoFaixa } from '../../../../core/models/api.models';
import { UiTipTriggerComponent } from '../../../../shared/ui-tip-trigger/ui-tip-trigger.component';

export type FinCadastroDrawerModo = 'categoria' | 'forma';

export type FinCadastroFaixaDraft = {
  key: string;
  parcelas_de: number;
  parcelas_ate: number;
  dias_ate_primeira: number;
  intervalo_dias: number;
  taxa_percentual_texto: string;
  juros_cliente: boolean;
};

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

  readonly tipFaixas =
    'Cada faixa define quando o dinheiro da operadora entra no caixa, conforme a quantidade de parcelas. Amanhã você ajusta os dias/taxas pelo contrato.';

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
  /** Grade 1x/2x/3x+ no lugar do prazo único (cartão de crédito). */
  @Input() usarPrazosFaixas = false;
  @Input() prazosFaixas: FinFormaPrazoFaixa[] = [];

  @Output() fechar = new EventEmitter<void>();
  @Output() salvar = new EventEmitter<{
    nome: string;
    natureza?: 'receita' | 'despesa';
    taxa_percentual?: number;
    taxa_fixa?: number;
    prazo_recebimento?: number;
    baixa_automatica?: boolean;
    ativo?: boolean;
    prazos_faixas?: {
      parcelas_de: number;
      parcelas_ate: number;
      dias_ate_primeira: number;
      intervalo_dias: number;
      taxa_percentual: number | null;
      juros_cliente: boolean;
    }[];
  }>();

  taxaPctTexto = '';
  taxaFixaDigitos = '';
  prazoRecebimentoTexto = '';
  faixasDraft: FinCadastroFaixaDraft[] = [];

  ngOnChanges(): void {
    if (this.modo !== 'forma') return;
    this.taxaPctTexto = this.formatTaxaPctExibicao(this.taxaPercentual);
    this.taxaFixaDigitos = String(Math.round(this.taxaFixa * 100));
    this.prazoRecebimentoTexto =
      this.prazoRecebimento > 0 ? String(this.prazoRecebimento) : '';
    this.faixasDraft = (this.prazosFaixas ?? []).map((f, i) =>
      this.faixaToDraft(f, i),
    );
    if (this.usarPrazosFaixas && this.faixasDraft.length === 0) {
      this.faixasDraft = [
        this.faixaToDraft(
          {
            parcelas_de: 1,
            parcelas_ate: 1,
            dias_ate_primeira: 30,
            intervalo_dias: 0,
            taxa_percentual: null,
            juros_cliente: false,
          },
          0,
        ),
        this.faixaToDraft(
          {
            parcelas_de: 2,
            parcelas_ate: 2,
            dias_ate_primeira: 30,
            intervalo_dias: 30,
            taxa_percentual: null,
            juros_cliente: false,
          },
          1,
        ),
        this.faixaToDraft(
          {
            parcelas_de: 3,
            parcelas_ate: 18,
            dias_ate_primeira: 30,
            intervalo_dias: 30,
            taxa_percentual: null,
            juros_cliente: true,
          },
          2,
        ),
      ];
    }
  }

  private faixaToDraft(f: FinFormaPrazoFaixa, i: number): FinCadastroFaixaDraft {
    return {
      key: `f-${i}-${f.parcelas_de}-${f.parcelas_ate}`,
      parcelas_de: f.parcelas_de,
      parcelas_ate: f.parcelas_ate,
      dias_ate_primeira: f.dias_ate_primeira,
      intervalo_dias: f.intervalo_dias,
      taxa_percentual_texto:
        f.taxa_percentual != null && f.taxa_percentual > 0
          ? this.formatTaxaPctExibicao(f.taxa_percentual)
          : '',
      juros_cliente: f.juros_cliente === true,
    };
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

  onFaixaNumInput(
    ev: Event,
    faixa: FinCadastroFaixaDraft,
    campo:
      | 'parcelas_de'
      | 'parcelas_ate'
      | 'dias_ate_primeira'
      | 'intervalo_dias',
  ): void {
    const el = ev.target as HTMLInputElement;
    const d = el.value.replace(/\D/g, '').slice(0, 4);
    el.value = d;
    const n = parseInt(d || '0', 10);
    faixa[campo] = Number.isFinite(n) ? n : 0;
  }

  onFaixaTaxaInput(ev: Event, faixa: FinCadastroFaixaDraft): void {
    let v = (ev.target as HTMLInputElement).value.replace(/[^\d,]/g, '');
    const parts = v.split(',');
    if (parts.length > 2) v = `${parts[0]},${parts.slice(1).join('')}`;
    if (parts.length === 2 && parts[1].length > 3) {
      v = `${parts[0]},${parts[1].slice(0, 3)}`;
    }
    faixa.taxa_percentual_texto = v;
    (ev.target as HTMLInputElement).value = v;
  }

  adicionarFaixa(): void {
    const last = this.faixasDraft[this.faixasDraft.length - 1];
    const de = last ? last.parcelas_ate + 1 : 1;
    this.faixasDraft = [
      ...this.faixasDraft,
      this.faixaToDraft(
        {
          parcelas_de: de,
          parcelas_ate: de,
          dias_ate_primeira: 30,
          intervalo_dias: 30,
          taxa_percentual: null,
          juros_cliente: false,
        },
        this.faixasDraft.length,
      ),
    ];
  }

  removerFaixa(key: string): void {
    this.faixasDraft = this.faixasDraft.filter((f) => f.key !== key);
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

  private parseFaixaTaxa(texto: string): number | null {
    const t = texto.trim();
    if (!t) return null;
    const n = parseFloat(t.replace(',', '.'));
    if (!Number.isFinite(n) || n < 0) return null;
    return Math.min(100, Math.round(n * 1000) / 1000);
  }

  onSalvar(): void {
    const nome = String(this.nome ?? '').trim();
    if (!nome) return;
    if (this.modo === 'categoria') {
      this.salvar.emit({ nome, natureza: this.natureza });
      return;
    }
    const payload: {
      nome: string;
      taxa_percentual: number;
      taxa_fixa: number;
      prazo_recebimento?: number;
      baixa_automatica: boolean;
      ativo: boolean;
      prazos_faixas?: {
        parcelas_de: number;
        parcelas_ate: number;
        dias_ate_primeira: number;
        intervalo_dias: number;
        taxa_percentual: number | null;
        juros_cliente: boolean;
      }[];
    } = {
      nome,
      taxa_percentual: this.parseTaxaPct(),
      taxa_fixa: this.parseTaxaFixa(),
      baixa_automatica: this.baixaAutomatica,
      ativo: this.ativo,
    };
    if (this.usarPrazosFaixas) {
      payload.prazos_faixas = this.faixasDraft.map((f) => ({
        parcelas_de: Math.max(1, Math.floor(f.parcelas_de) || 1),
        parcelas_ate: Math.max(
          Math.max(1, Math.floor(f.parcelas_de) || 1),
          Math.floor(f.parcelas_ate) || 1,
        ),
        dias_ate_primeira: Math.max(0, Math.floor(f.dias_ate_primeira) || 0),
        intervalo_dias: Math.max(0, Math.floor(f.intervalo_dias) || 0),
        taxa_percentual: this.parseFaixaTaxa(f.taxa_percentual_texto),
        juros_cliente: f.juros_cliente,
      }));
      payload.prazo_recebimento =
        payload.prazos_faixas[0]?.dias_ate_primeira ?? 0;
    } else {
      payload.prazo_recebimento = this.parsePrazoRecebimento();
    }
    this.salvar.emit(payload);
  }
}
