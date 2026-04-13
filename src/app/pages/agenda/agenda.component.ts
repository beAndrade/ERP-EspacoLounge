import { Component, inject, LOCALE_ID, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DecimalPipe, registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import { SheetsApiService } from '../../core/services/sheets-api.service';
import { AtendimentoListaItem } from '../../core/models/api.models';
import {
  dataDdMmBarraAaaa,
  linhaResumoAtendimentoLista,
  ordenarLinhasAtendimentoInPlace,
  toYmd,
  valorMonetarioParaNumero,
} from '../../core/utils/atendimento-display';

registerLocaleData(localePt);

/** Célula do calendário: vazio (fora do mês) ou número do dia. */
type CelulaCalendario = { dia: number | null; ymd: string | null };

/** Atendimentos do dia agrupados (mesmo ID = mesmo card). */
interface AgendaGrupoDia {
  trackId: string;
  nomeCliente: string;
  linhas: AtendimentoListaItem[];
  total: number | null;
}

@Component({
  selector: 'app-agenda',
  standalone: true,
  imports: [RouterLink, DecimalPipe],
  providers: [{ provide: LOCALE_ID, useValue: 'pt-BR' }],
  templateUrl: './agenda.component.html',
  styleUrl: './agenda.component.scss',
})
export class AgendaComponent implements OnInit {
  private readonly api = inject(SheetsApiService);

  readonly dataDdMmBarraAaaa = dataDdMmBarraAaaa;
  readonly valorNum = valorMonetarioParaNumero;
  readonly linhaResumoAtendimentoLista = linhaResumoAtendimentoLista;

  /** Primeiro dia do mês em exibição (hora local). */
  mesRef = this.inicioDoMes(new Date());

  carregando = false;
  erro = '';
  itensMes: AtendimentoListaItem[] = [];
  /** Contagem por AAAA-MM-DD */
  porDia = new Map<string, number>();

  /** Dia selecionado para o painel (AAAA-MM-DD). */
  diaSelecionado: string | null = null;

  readonly diasSemana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

  ngOnInit(): void {
    this.carregarMes();
  }

  tituloMes(): string {
    return this.mesRef.toLocaleDateString('pt-BR', {
      month: 'long',
      year: 'numeric',
    });
  }

  celulas(): CelulaCalendario[] {
    const y = this.mesRef.getFullYear();
    const m = this.mesRef.getMonth();
    const primeiroDow = new Date(y, m, 1).getDay();
    const diasNoMes = new Date(y, m + 1, 0).getDate();
    const out: CelulaCalendario[] = [];
    for (let i = 0; i < primeiroDow; i++) {
      out.push({ dia: null, ymd: null });
    }
    for (let d = 1; d <= diasNoMes; d++) {
      const ymd = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      out.push({ dia: d, ymd });
    }
    while (out.length % 7 !== 0) {
      out.push({ dia: null, ymd: null });
    }
    return out;
  }

  contagem(ymd: string | null): number {
    if (!ymd) return 0;
    return this.porDia.get(ymd) ?? 0;
  }

  /** Linhas do dia agrupadas por atendimento (ID), com total por grupo. */
  gruposDia(): AgendaGrupoDia[] {
    if (!this.diaSelecionado) return [];
    const key = this.diaSelecionado;
    const items = this.itensMes.filter((a) => (a.data || '').slice(0, 10) === key);
    const map = new Map<string, AtendimentoListaItem[]>();
    for (const a of items) {
      const idAt = String(a.id || '').trim();
      const grupKey = idAt
        ? `id:${idAt}`
        : `nome:${(a.nomeCliente || '').trim().toLowerCase()}`;
      if (!map.has(grupKey)) map.set(grupKey, []);
      map.get(grupKey)!.push(a);
    }
    const grupos: AgendaGrupoDia[] = [];
    for (const [trackId, linhas] of map) {
      ordenarLinhasAtendimentoInPlace(linhas);
      let sum = 0;
      let tem = false;
      for (const l of linhas) {
        const v = valorMonetarioParaNumero(l.valor);
        if (v !== null) {
          sum += v;
          tem = true;
        }
      }
      grupos.push({
        trackId,
        nomeCliente: linhas[0].nomeCliente?.trim() || '—',
        linhas,
        total: tem ? Math.round(sum * 100) / 100 : null,
      });
    }
    return grupos.sort((a, b) =>
      a.nomeCliente.localeCompare(b.nomeCliente, 'pt-BR'),
    );
  }

  tituloDiaSelecionado(): string {
    if (!this.diaSelecionado) return '';
    return dataDdMmBarraAaaa(this.diaSelecionado);
  }

  abrirDia(ymd: string | null): void {
    if (!ymd) return;
    this.diaSelecionado = ymd;
  }

  fecharPainel(): void {
    this.diaSelecionado = null;
  }

  mesAnterior(): void {
    const y = this.mesRef.getFullYear();
    const m = this.mesRef.getMonth();
    this.mesRef = this.inicioDoMes(new Date(y, m - 1, 1));
    this.diaSelecionado = null;
    this.carregarMes();
  }

  mesSeguinte(): void {
    const y = this.mesRef.getFullYear();
    const m = this.mesRef.getMonth();
    this.mesRef = this.inicioDoMes(new Date(y, m + 1, 1));
    this.diaSelecionado = null;
    this.carregarMes();
  }

  irMesAtual(): void {
    this.mesRef = this.inicioDoMes(new Date());
    this.diaSelecionado = null;
    this.carregarMes();
  }

  hojeYmd(): string {
    return toYmd(new Date());
  }

  private inicioDoMes(d: Date): Date {
    return new Date(d.getFullYear(), d.getMonth(), 1);
  }

  private carregarMes(): void {
    this.carregando = true;
    this.erro = '';
    const y = this.mesRef.getFullYear();
    const m = this.mesRef.getMonth();
    const inicio = new Date(y, m, 1);
    const fim = new Date(y, m + 1, 0);
    const di = toYmd(inicio);
    const df = toYmd(fim);
    this.api.listAgendamentos(di, df).subscribe({
      next: (items) => {
        this.itensMes = items;
        const map = new Map<string, Set<string>>();
        for (const a of items) {
          const key = (a.data || '').slice(0, 10);
          if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) continue;
          const idAt = String(a.id || '').trim();
          const grupKey = idAt
            ? `id:${idAt}`
            : `nome:${(a.nomeCliente || '').trim().toLowerCase()}`;
          if (!map.has(key)) map.set(key, new Set());
          map.get(key)!.add(grupKey);
        }
        const out = new Map<string, number>();
        for (const [k, set] of map) {
          out.set(k, set.size);
        }
        this.porDia = out;
        this.carregando = false;
      },
      error: (e: Error) => {
        this.erro =
          e.message ||
          'Não foi possível carregar a agenda. Tente novamente.';
        this.carregando = false;
      },
    });
  }
}
