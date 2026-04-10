import { Component, inject, LOCALE_ID, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DecimalPipe, registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import { SheetsApiService } from '../../core/services/sheets-api.service';
import { AtendimentoListaItem } from '../../core/models/api.models';
import {
  dataDdMmAaaa,
  toYmd,
  valorMonetarioParaNumero,
} from '../../core/utils/atendimento-display';

registerLocaleData(localePt);

export type DiaCards = 'hoje' | 'amanha';

/** Um card por cliente no mesmo dia (várias linhas = vários serviços). */
interface GrupoClienteDia {
  id: string;
  /** AAAA-MM-DD */
  data: string;
  nomeCliente: string;
  linhas: AtendimentoListaItem[];
  /** Soma dos valores quando existe pelo menos um numérico */
  valorTotal: number | null;
}

@Component({
  selector: 'app-atendimentos',
  standalone: true,
  imports: [RouterLink, DecimalPipe],
  providers: [{ provide: LOCALE_ID, useValue: 'pt-BR' }],
  templateUrl: './atendimentos.component.html',
  styleUrl: './atendimentos.component.scss',
})
export class AtendimentosComponent implements OnInit {
  private readonly api = inject(SheetsApiService);

  readonly dataDdMmAaaa = dataDdMmAaaa;
  readonly valorNum = valorMonetarioParaNumero;

  dia: DiaCards = 'hoje';
  carregando = false;
  erro = '';
  grupos: GrupoClienteDia[] = [];
  /** `id` do grupo com detalhes abertos, ou null */
  grupoExpandidoId: string | null = null;

  ngOnInit(): void {
    this.carregar();
  }

  setDia(d: DiaCards): void {
    if (this.dia === d) return;
    this.dia = d;
    this.grupoExpandidoId = null;
    this.carregar();
  }

  private dataAlvo(): Date {
    const d = new Date();
    if (this.dia === 'amanha') {
      d.setDate(d.getDate() + 1);
    }
    return d;
  }

  tituloPeriodo(): string {
    return this.dia === 'hoje' ? 'Hoje' : 'Amanhã';
  }

  toggleGrupo(id: string): void {
    this.grupoExpandidoId = this.grupoExpandidoId === id ? null : id;
  }

  isExpandido(g: GrupoClienteDia): boolean {
    return this.grupoExpandidoId === g.id;
  }

  resumoCard(g: GrupoClienteDia): string {
    if (g.linhas.length === 1) {
      return g.linhas[0].descricao?.trim() || '—';
    }
    return `${g.linhas.length} serviços`;
  }

  finalizandoIdAt: string | null = null;

  cobrancaFinalizada(g: GrupoClienteDia): boolean {
    return g.linhas[0]?.cobrancaStatus === 'finalizada';
  }

  /** Fase operacional: em aberto vs pronto para cobrança (cobranca_status). */
  statusCobrancaLabel(g: GrupoClienteDia): string {
    return this.cobrancaFinalizada(g) ? 'Pronto para cobrança' : 'Em aberto';
  }

  finalizar(g: GrupoClienteDia, ev: Event): void {
    ev.stopPropagation();
    const idAt = g.linhas[0]?.id?.trim();
    if (!idAt || this.cobrancaFinalizada(g)) return;
    this.finalizandoIdAt = idAt;
    this.erro = '';
    this.api.finalizarCobranca(idAt).subscribe({
      next: () => {
        this.finalizandoIdAt = null;
        for (const l of g.linhas) {
          l.cobrancaStatus = 'finalizada';
        }
      },
      error: (e: Error) => {
        this.finalizandoIdAt = null;
        this.erro =
          e.message ||
          'Não foi possível finalizar. Tente novamente.';
      },
    });
  }

  carregar(): void {
    this.carregando = true;
    this.erro = '';
    const d = this.dataAlvo();
    const ymd = toYmd(d);
    this.api.listAgendamentos(ymd, ymd).subscribe({
      next: (items) => {
        this.grupos = this.agruparPorClienteDia(items);
        this.carregando = false;
      },
      error: (e: Error) => {
        this.erro =
          e.message ||
          'Não foi possível carregar os atendimentos. Tente novamente.';
        this.carregando = false;
      },
    });
  }

  private agruparPorClienteDia(items: AtendimentoListaItem[]): GrupoClienteDia[] {
    const map = new Map<string, AtendimentoListaItem[]>();
    for (const a of items) {
      const ymd = (a.data || '').slice(0, 10);
      const nome = (a.nomeCliente || '').trim();
      const key = `${ymd}\0${nome.toLowerCase()}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(a);
    }

    const grupos: GrupoClienteDia[] = [];
    for (const [key, linhas] of map) {
      linhas.sort((x, y) =>
        (x.descricao || '').localeCompare(y.descricao || '', 'pt-BR'),
      );
      const nomeCliente = linhas[0].nomeCliente?.trim() || '—';
      const data = (linhas[0].data || '').slice(0, 10);
      let sum = 0;
      let temValor = false;
      for (const l of linhas) {
        const v = valorMonetarioParaNumero(l.valor);
        if (v !== null) {
          sum += v;
          temValor = true;
        }
      }
      grupos.push({
        id: key,
        data,
        nomeCliente,
        linhas,
        valorTotal: temValor ? sum : null,
      });
    }

    return grupos.sort((a, b) => {
      const c = a.data.localeCompare(b.data);
      return c !== 0 ? c : a.nomeCliente.localeCompare(b.nomeCliente, 'pt-BR');
    });
  }
}
