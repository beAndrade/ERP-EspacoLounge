import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { Component, computed, LOCALE_ID, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';

registerLocaleData(localePt);

export type FinComissaoTab = 'detalhadas' | 'resumidas' | 'pagas' | 'configuracoes';

export interface FinComissaoProfissionalUi {
  id: number;
  nome: string;
  telefone: string;
}

export interface FinComissaoLinhaUi {
  id: number;
  dataYmd: string;
  clienteNome: string;
  clienteNumero: number;
  servico: string;
  quantidade: number;
  valor: number;
  taxaAcumulada: string | null;
  comissaoPct: number;
  comissaoTipo: string;
  descontoAuxiliares: string | null;
  disponivel: number;
}

const PROFISSIONAIS_MOCK: FinComissaoProfissionalUi[] = [
  { id: 1, nome: 'Bernardo', telefone: '+55 (22) 99899-5484' },
];

const LINHAS_DETALHE_MOCK: FinComissaoLinhaUi[] = [
  {
    id: 1,
    dataYmd: '2026-05-14',
    clienteNome: 'Bruna',
    clienteNumero: 1,
    servico: 'Corte Masculino',
    quantidade: 1,
    valor: 20,
    taxaAcumulada: null,
    comissaoPct: 50,
    comissaoTipo: 'Normal',
    descontoAuxiliares: null,
    disponivel: 10,
  },
  {
    id: 2,
    dataYmd: '2026-05-14',
    clienteNome: 'Julia',
    clienteNumero: 2,
    servico: 'Corte Feminino',
    quantidade: 1,
    valor: 35,
    taxaAcumulada: null,
    comissaoPct: 50,
    comissaoTipo: 'Normal',
    descontoAuxiliares: null,
    disponivel: 17.5,
  },
  {
    id: 3,
    dataYmd: '2026-05-15',
    clienteNome: 'Jessica',
    clienteNumero: 3,
    servico: 'Corte Masculino',
    quantidade: 1,
    valor: 20,
    taxaAcumulada: null,
    comissaoPct: 50,
    comissaoTipo: 'Normal',
    descontoAuxiliares: null,
    disponivel: 10,
  },
  {
    id: 4,
    dataYmd: '2026-05-16',
    clienteNome: 'Bruna',
    clienteNumero: 1,
    servico: 'Corte Feminino',
    quantidade: 1,
    valor: 35,
    taxaAcumulada: null,
    comissaoPct: 50,
    comissaoTipo: 'Normal',
    descontoAuxiliares: null,
    disponivel: 17.5,
  },
  {
    id: 5,
    dataYmd: '2026-05-17',
    clienteNome: 'Julia',
    clienteNumero: 2,
    servico: 'Corte Masculino',
    quantidade: 1,
    valor: 20,
    taxaAcumulada: null,
    comissaoPct: 50,
    comissaoTipo: 'Normal',
    descontoAuxiliares: null,
    disponivel: 10,
  },
  {
    id: 6,
    dataYmd: '2026-05-18',
    clienteNome: 'Jessica',
    clienteNumero: 3,
    servico: 'Corte Feminino',
    quantidade: 1,
    valor: 35,
    taxaAcumulada: null,
    comissaoPct: 50,
    comissaoTipo: 'Normal',
    descontoAuxiliares: null,
    disponivel: 17.5,
  },
];

@Component({
  selector: 'app-financeiro-comissoes',
  standalone: true,
  imports: [CurrencyPipe, DecimalPipe, FormsModule],
  providers: [{ provide: LOCALE_ID, useValue: 'pt-BR' }],
  templateUrl: './financeiro-comissoes.component.html',
  styleUrl: './financeiro-comissoes.component.scss',
})
export class FinanceiroComissoesComponent {
  readonly tabs: { id: FinComissaoTab; label: string }[] = [
    { id: 'detalhadas', label: 'Detalhadas' },
    { id: 'resumidas', label: 'Resumidas' },
    { id: 'pagas', label: 'Pagas' },
    { id: 'configuracoes', label: 'Configurações' },
  ];

  readonly profissionais = PROFISSIONAIS_MOCK;
  readonly linhasDetalhe = LINHAS_DETALHE_MOCK;

  readonly vista = signal<'filtros' | 'detalhe'>('filtros');
  readonly tabAtiva = signal<FinComissaoTab>('detalhadas');
  readonly profissionalSelecionado = signal<FinComissaoProfissionalUi | null>(
    null,
  );

  periodoInicio = '2026-04-21';
  periodoFim = '2026-05-21';
  mostrarAnteriores = false;
  profissionalIdSidebar: number | null = 1;

  private readonly selecionados = signal<ReadonlySet<number>>(new Set());

  readonly totalComissoes = computed(() => {
    const sel = this.selecionados();
    let sum = 0;
    for (const row of this.linhasDetalhe) {
      if (!sel.has(row.id)) continue;
      sum += row.disponivel;
    }
    return Math.round(sum * 100) / 100;
  });

  readonly podePagar = computed(() => this.selecionados().size > 0);

  periodoLabel(): string {
    return `${this.ymdParaDdMm(this.periodoInicio)} → ${this.ymdParaDdMm(this.periodoFim)}`;
  }

  formatarData(ymd: string): string {
    return this.ymdParaDdMm(ymd);
  }

  selecionarTab(id: FinComissaoTab): void {
    this.tabAtiva.set(id);
  }

  abrirProfissional(prof: FinComissaoProfissionalUi): void {
    this.profissionalSelecionado.set(prof);
    this.profissionalIdSidebar = prof.id;
    this.selecionados.set(new Set());
    this.vista.set('detalhe');
  }

  voltarFiltros(): void {
    this.vista.set('filtros');
    this.profissionalSelecionado.set(null);
    this.selecionados.set(new Set());
  }

  linhaSelecionada(id: number): boolean {
    return this.selecionados().has(id);
  }

  todosSelecionados(): boolean {
    const linhas = this.linhasDetalhe;
    return (
      linhas.length > 0 && linhas.every((r) => this.selecionados().has(r.id))
    );
  }

  toggleLinha(id: number, ev: Event): void {
    const checked = (ev.target as HTMLInputElement).checked;
    this.selecionados.update((atual) => {
      const next = new Set(atual);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  toggleTodos(ev: Event): void {
    const checked = (ev.target as HTMLInputElement).checked;
    if (checked) {
      this.selecionados.set(new Set(this.linhasDetalhe.map((r) => r.id)));
    } else {
      this.selecionados.set(new Set());
    }
  }

  private ymdParaDdMm(ymd: string): string {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim().slice(0, 10));
    if (!m) return ymd;
    return `${m[3]}/${m[2]}/${m[1]}`;
  }
}
