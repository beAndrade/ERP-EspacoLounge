import { CurrencyPipe } from '@angular/common';
import { Component, Input, ViewEncapsulation } from '@angular/core';

export type OrcamentoPrintItem = {
  descricao: string;
  quantidade: number;
  valorUnitario: number;
  total: number;
};

export type OrcamentoPrintPayload = {
  idAtendimento: string;
  clienteNome: string;
  telefone?: string;
  clienteId?: string;
  dataYmd: string;
  dataFmt: string;
  numeroComanda: string;
  itens: OrcamentoPrintItem[];
  subtotal: number;
  desconto: number;
  total: number;
  observacoes?: string;
  nomeEmpresa?: string;
};

export type OrcamentoPrintModo = 'print-only' | 'preview';

@Component({
  selector: 'app-orcamento-print',
  standalone: true,
  imports: [CurrencyPipe],
  templateUrl: './orcamento-print.component.html',
  styleUrl: './orcamento-print.component.scss',
  encapsulation: ViewEncapsulation.None,
})
export class OrcamentoPrintComponent {
  @Input() dados: OrcamentoPrintPayload | null = null;
  /** `preview` = visível na tela; `print-only` = só no diálogo de impressão. */
  @Input() modo: OrcamentoPrintModo = 'print-only';

  telefoneFmt(digitos: string | undefined): string {
    const d = String(digitos ?? '').replace(/\D/g, '');
    if (d.length === 11) {
      return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
    }
    if (d.length === 10) {
      return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    }
    return d;
  }
}
