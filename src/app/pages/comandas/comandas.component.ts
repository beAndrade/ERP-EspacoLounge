import {
  Component,
  HostListener,
  inject,
  LOCALE_ID,
  OnInit,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CurrencyPipe, registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import { FormsModule } from '@angular/forms';
import { SheetsApiService } from '../../core/services/sheets-api.service';
import { AtendimentoListaItem } from '../../core/models/api.models';
import {
  dataDdMmBarraAaaa,
  parseFiltroDataDdMm,
  toDdMmYyyy,
  ordenarLinhasAtendimentoInPlace,
  valorMonetarioParaNumero,
} from '../../core/utils/atendimento-display';

registerLocaleData(localePt);

/** Um grupo por ID de atendimento (mesma lógica que `atendimentos`). */
interface ComandaGrupo {
  id: string;
  data: string;
  nomeCliente: string;
  linhas: AtendimentoListaItem[];
  valorSubtotal: number | null;
  descontoValor: number | null;
  valorTotal: number | null;
}

@Component({
  selector: 'app-comandas',
  standalone: true,
  imports: [RouterLink, FormsModule, CurrencyPipe],
  providers: [{ provide: LOCALE_ID, useValue: 'pt-BR' }],
  templateUrl: './comandas.component.html',
  styleUrl: './comandas.component.scss',
})
export class ComandasComponent implements OnInit {
  private readonly api = inject(SheetsApiService);
  private readonly router = inject(Router);

  readonly dataDdMmBarraAaaa = dataDdMmBarraAaaa;

  carregando = false;
  erro = '';
  grupos: ComandaGrupo[] = [];

  dataInicio = '';
  dataFim = '';
  filtrosAbertos = false;
  buscaAberta = false;
  busca = '';

  pagina = 1;
  itensPorPagina = 20;
  readonly opcoesItensPorPagina = [10, 20, 50];

  selecionados = new Set<string>();
  menuAbertoParaId: string | null = null;
  excluindoIdAt: string | null = null;

  ngOnInit(): void {
    const hoje = new Date();
    const inicio = new Date(hoje);
    inicio.setDate(hoje.getDate() - 90);
    this.dataInicio = toDdMmYyyy(inicio);
    this.dataFim = toDdMmYyyy(hoje);
    this.carregar();
  }

  @HostListener('document:click', ['$event'])
  fecharMenuPorClickFora(ev: MouseEvent): void {
    const t = ev.target as HTMLElement | null;
    if (t?.closest?.('.comandas-row-menu')) return;
    this.menuAbertoParaId = null;
  }

  carregar(): void {
    this.carregando = true;
    this.erro = '';
    const di = parseFiltroDataDdMm(this.dataInicio);
    const df = parseFiltroDataDdMm(this.dataFim);
    if (!di || !df) {
      this.carregando = false;
      this.erro =
        'Use o formato dia-mês-ano nas duas datas (ex.: 09-04-2026). Também aceita barras.';
      return;
    }
    if (di > df) {
      this.carregando = false;
      this.erro = 'A data “De” não pode ser depois da data “Até”.';
      return;
    }
    this.api.listAgendamentos(di, df).subscribe({
      next: (items) => {
        this.grupos = this.agruparPorIdAtendimento(items);
        this.selecionados.clear();
        this.pagina = 1;
        this.carregando = false;
      },
      error: (e: Error) => {
        this.erro =
          e.message ||
          'Não foi possível carregar as comandas. Tente novamente.';
        this.carregando = false;
      },
    });
  }

  toggleFiltros(): void {
    this.filtrosAbertos = !this.filtrosAbertos;
  }

  toggleBusca(): void {
    this.buscaAberta = !this.buscaAberta;
  }

  /** Enter / botão direito: fecha o teclado; a lista já filtra em tempo real. */
  onBuscaSubmit(): void {
    const el = document.getElementById('comandas-busca-input');
    if (el instanceof HTMLInputElement) {
      el.blur();
    }
  }

  onBuscaEnter(ev: Event): void {
    ev.preventDefault();
    this.onBuscaSubmit();
  }

  gruposFiltrados(): ComandaGrupo[] {
    const q = this.busca.trim().toLowerCase();
    let list = this.grupos;
    if (q) {
      list = list.filter((g) => {
        const nome = (g.nomeCliente || '').toLowerCase();
        const idAt = (g.linhas[0]?.id || '').toLowerCase();
        const ticket = this.rotuloTicket(g).toLowerCase();
        return (
          nome.includes(q) || idAt.includes(q) || ticket.includes(q)
        );
      });
    }
    return list.slice().sort((a, b) => {
      const c = b.data.localeCompare(a.data);
      return c !== 0
        ? c
        : a.nomeCliente.localeCompare(b.nomeCliente, 'pt-BR');
    });
  }

  totalFiltrado(): number {
    return this.gruposFiltrados().length;
  }

  gruposPagina(): ComandaGrupo[] {
    const all = this.gruposFiltrados();
    const start = (this.pagina - 1) * this.itensPorPagina;
    return all.slice(start, start + this.itensPorPagina);
  }

  totalPaginas(): number {
    const n = this.totalFiltrado();
    return Math.max(1, Math.ceil(n / this.itensPorPagina));
  }

  aoMudarItensPorPagina(): void {
    this.pagina = 1;
  }

  paginaAnterior(): void {
    if (this.pagina > 1) this.pagina--;
  }

  paginaSeguinte(): void {
    if (this.pagina < this.totalPaginas()) this.pagina++;
  }

  cobrancaFinalizada(g: ComandaGrupo): boolean {
    return g.linhas[0]?.cobrancaStatus === 'finalizada';
  }

  pagamentoConfirmado(g: ComandaGrupo): boolean {
    return (g.linhas[0]?.pagamentoStatus ?? '') === 'confirmado';
  }

  rotuloStatus(g: ComandaGrupo): string {
    if (!this.cobrancaFinalizada(g)) return 'Pendente';
    if (!this.pagamentoConfirmado(g)) return 'Cobrança finalizada';
    return 'Pago';
  }

  rotuloPagamento(g: ComandaGrupo): string {
    if (!this.cobrancaFinalizada(g)) return 'Em aberto';
    if (this.pagamentoConfirmado(g)) {
      const m = this.metodoPagamentoNoGrupo(g);
      return m ? m : 'Pago';
    }
    return 'Em aberto';
  }

  private metodoPagamentoNoGrupo(g: ComandaGrupo): string {
    for (const l of g.linhas) {
      const m = (l.pagamentoMetodo ?? '').trim();
      if (m) return m;
    }
    return '';
  }

  valorExibicao(g: ComandaGrupo): number | null {
    return g.valorTotal;
  }

  rotuloTicket(g: ComandaGrupo): string {
    const lid = g.linhas[0]?.linha_id;
    if (lid != null && Number.isFinite(lid)) return `#${lid}`;
    const raw = String(g.linhas[0]?.id ?? '').replace(/\D/g, '');
    const tail = raw.replace(/^0+/, '') || raw;
    return tail ? `#${tail}` : '#—';
  }

  idCliente(g: ComandaGrupo): string | null {
    const id = g.linhas[0]?.idCliente?.trim();
    return id || null;
  }

  idAtendimento(g: ComandaGrupo): string | null {
    const id = g.linhas[0]?.id?.trim();
    return id || null;
  }

  editar(g: ComandaGrupo, ev: Event): void {
    ev.stopPropagation();
    this.menuAbertoParaId = null;
    const idAt = this.idAtendimento(g);
    if (!idAt) return;
    void this.router.navigate(['/agenda/novo'], {
      queryParams: { atendimento: idAt },
    });
  }

  excluir(g: ComandaGrupo, ev: Event): void {
    ev.stopPropagation();
    this.menuAbertoParaId = null;
    const idAt = this.idAtendimento(g);
    if (!idAt) return;
    const nome = g.nomeCliente?.trim() || 'este cliente';
    const dataTxt = dataDdMmBarraAaaa(g.data);
    const msg =
      `Deseja confirmar a exclusão do atendimento?\n\n` +
      `Cliente: ${nome}\n` +
      `Data: ${dataTxt}\n\n` +
      `Todas as linhas deste atendimento serão apagadas. Esta ação não pode ser desfeita.`;
    if (!window.confirm(msg)) return;
    this.excluindoIdAt = idAt;
    this.erro = '';
    this.api.excluirAtendimento(idAt).subscribe({
      next: () => {
        this.excluindoIdAt = null;
        this.carregar();
      },
      error: (e: Error) => {
        this.excluindoIdAt = null;
        this.erro =
          e.message || 'Não foi possível excluir. Tente novamente.';
      },
    });
  }

  toggleMenu(g: ComandaGrupo, ev: Event): void {
    ev.stopPropagation();
    const id = g.id;
    this.menuAbertoParaId = this.menuAbertoParaId === id ? null : id;
  }

  estaSelecionado(g: ComandaGrupo): boolean {
    return this.selecionados.has(g.id);
  }

  toggleSelecionar(g: ComandaGrupo, ev: Event): void {
    ev.stopPropagation();
    if (this.selecionados.has(g.id)) this.selecionados.delete(g.id);
    else this.selecionados.add(g.id);
    this.selecionados = new Set(this.selecionados);
  }

  toggleSelecionarTodos(ev: Event): void {
    const alvo = ev.target as HTMLInputElement;
    const pag = this.gruposPagina();
    if (alvo.checked) {
      for (const g of pag) this.selecionados.add(g.id);
    } else {
      for (const g of pag) this.selecionados.delete(g.id);
    }
    this.selecionados = new Set(this.selecionados);
  }

  todosDaPaginaSelecionados(): boolean {
    const pag = this.gruposPagina();
    return pag.length > 0 && pag.every((g) => this.selecionados.has(g.id));
  }

  private agruparPorIdAtendimento(
    items: AtendimentoListaItem[],
  ): ComandaGrupo[] {
    const map = new Map<string, AtendimentoListaItem[]>();
    let legacyIdx = 0;
    for (const a of items) {
      const ymd = (a.data || '').slice(0, 10);
      const idAt = String(a.id || '').trim();
      const nome = (a.nomeCliente || '').trim().toLowerCase();
      const key = idAt
        ? `${ymd}\u0001${idAt}`
        : `${ymd}\u0001legacy:${nome}:${legacyIdx++}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(a);
    }

    const grupos: ComandaGrupo[] = [];
    for (const [key, linhas] of map) {
      ordenarLinhasAtendimentoInPlace(linhas);
      const metodoGrupo =
        linhas.map((l) => (l.pagamentoMetodo ?? '').trim()).find(Boolean) ?? '';
      if (metodoGrupo) {
        for (const l of linhas) {
          if (!(l.pagamentoMetodo ?? '').trim()) {
            l.pagamentoMetodo = metodoGrupo;
          }
        }
      }
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
      const subtotal = temValor ? sum : null;
      const descontoN = valorMonetarioParaNumero(linhas[0]?.desconto);
      const descontoValor =
        descontoN !== null && descontoN > 0 ? descontoN : null;
      let valorTotal = subtotal;
      if (subtotal !== null && descontoValor !== null) {
        valorTotal = Math.max(
          0,
          Math.round((subtotal - descontoValor) * 100) / 100,
        );
      }
      grupos.push({
        id: key,
        data,
        nomeCliente,
        linhas,
        valorSubtotal: subtotal,
        descontoValor,
        valorTotal,
      });
    }

    return grupos.sort((a, b) => {
      const c = a.data.localeCompare(b.data);
      return c !== 0 ? c : a.nomeCliente.localeCompare(b.nomeCliente, 'pt-BR');
    });
  }
}
