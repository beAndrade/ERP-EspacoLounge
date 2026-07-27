import {
  AfterViewInit,
  Component,
  ElementRef,
  HostListener,
  inject,
  OnDestroy,
  OnInit,
  ViewChild,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SheetsApiService } from '../../../../core/services/sheets-api.service';
import { ProfissionalListaItem } from '../../../../core/models/api.models';
import { formatarCelularBr } from '../../../../core/utils/telefone-br';
import { ProfissionalCadastroDrawerService } from '../../../../shared/profissional-cadastro-drawer/profissional-cadastro-drawer.service';
import { ProfissionalAvatarComponent } from '../../../../shared/profissional-avatar/profissional-avatar.component';
import { profissionalFotoUrl } from '../../../../core/utils/profissional-foto.util';

type AbaProfissionais = 'ativos' | 'inativos';

@Component({
  selector: 'app-profissionais',
  standalone: true,
  imports: [FormsModule, NgTemplateOutlet, ProfissionalAvatarComponent],
  templateUrl: './profissionais.component.html',
  styleUrl: './profissionais.component.scss',
})
export class ProfissionaisComponent implements OnInit, AfterViewInit, OnDestroy {
  private readonly api = inject(SheetsApiService);
  private readonly profissionalDrawer = inject(ProfissionalCadastroDrawerService);

  @ViewChild('tabsNav', { read: ElementRef })
  private tabsNav?: ElementRef<HTMLElement>;

  aba: AbaProfissionais = 'ativos';
  tabsIndicatorLeft = 0;
  tabsIndicatorWidth = 0;
  busca = '';
  buscaAberta = false;
  pulsoToolbarBusca = false;
  private readonly duracaoPulsoToolbarMs = 600;
  private tPulsoBusca = 0;

  carregando = false;
  erro = '';
  itens: ProfissionalListaItem[] = [];

  infoTooltipAberto = false;
  reordenando = false;

  /** Ordem fixa no DOM durante o arraste; reordena só ao soltar. */
  listaArraste: ProfissionalListaItem[] | null = null;
  dragProfId: number | null = null;
  dragFromIndex: number | null = null;
  dragSlotIndex: number | null = null;

  /** Linha flutuante renderizada no template (dados + estilos Angular). */
  ghostProf: ProfissionalListaItem | null = null;
  ghostTop = 0;
  ghostLeft = 0;
  ghostWidth = 0;
  ghostColWidths: number[] = [];

  private ghostOffsetX = 0;
  private ghostOffsetY = 0;
  private ordemInicialArraste: number[] = [];
  private alturaLinhaArraste = 47;

  readonly profissionalFotoUrl = profissionalFotoUrl;

  ngOnInit(): void {
    this.carregar();
  }

  ngAfterViewInit(): void {
    this.sincronizarIndicadorTabs();
  }

  ngOnDestroy(): void {
    this.cancelarArraste();
  }

  carregar(): void {
    this.carregando = true;
    this.erro = '';
    this.api.listProfissionais(true).subscribe({
      next: (items) => {
        this.itens = items ?? [];
        this.carregando = false;
      },
      error: (e: Error) => {
        this.erro =
          e.message ||
          'Não foi possível carregar profissionais. Tente novamente.';
        this.carregando = false;
      },
    });
  }

  definirAba(aba: AbaProfissionais): void {
    if (this.aba === aba) return;
    this.aba = aba;
    this.sincronizarIndicadorTabs();
  }

  private sincronizarIndicadorTabs(): void {
    // Mede pela aba escolhida (não pela classe --active): o DOM ainda
    // pode não ter atualizado a classe no mesmo tick do clique.
    const medir = () => {
      const nav = this.tabsNav?.nativeElement;
      if (!nav) return;
      const alvo = nav.querySelector(
        `.list-page__tab[data-aba="${this.aba}"]`,
      ) as HTMLElement | null;
      if (!alvo) return;
      this.tabsIndicatorLeft = alvo.offsetLeft;
      this.tabsIndicatorWidth = alvo.offsetWidth;
    };
    requestAnimationFrame(medir);
  }

  get buscaPlaceholder(): string {
    return this.buscaAberta ? 'Buscar por nome…' : '';
  }

  get podeReordenar(): boolean {
    return !this.busca.trim() && !this.carregando && this.totalFiltrado() > 1;
  }

  get arrastando(): boolean {
    return this.dragProfId != null;
  }

  private dispararPulsoBusca(): void {
    window.clearTimeout(this.tPulsoBusca);
    this.pulsoToolbarBusca = false;
    queueMicrotask(() => {
      this.pulsoToolbarBusca = true;
      this.tPulsoBusca = window.setTimeout(() => {
        this.pulsoToolbarBusca = false;
      }, this.duracaoPulsoToolbarMs);
    });
  }

  fecharPainelBusca(): void {
    this.buscaAberta = false;
  }

  onBuscaWrapClick(): void {
    if (!this.buscaAberta) {
      this.dispararPulsoBusca();
      this.buscaAberta = true;
      queueMicrotask(() => {
        document.getElementById('profissionais-busca-input')?.focus();
      });
    }
  }

  onBuscaInput(): void {}

  onBuscaEnter(ev: Event): void {
    ev.preventDefault();
  }

  private compararProfissionais(
    a: ProfissionalListaItem,
    b: ProfissionalListaItem,
  ): number {
    const oa = a.ordem ?? 0;
    const ob = b.ordem ?? 0;
    if (oa !== ob) return oa - ob;
    return a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' });
  }

  filtrados(): ProfissionalListaItem[] {
    const ativo = this.aba === 'ativos';
    let list = this.itens.filter(
      (p) => Boolean(p.nome?.trim()) && (p.ativo !== false) === ativo,
    );
    const q = this.busca.trim().toLowerCase();
    if (q) {
      list = list.filter((p) => p.nome.toLowerCase().includes(q));
    }
    return list.slice().sort((a, b) => this.compararProfissionais(a, b));
  }

  /** Corpo da tabela: ordem animada durante arraste ou lista normal. */
  listaCorpo(): ProfissionalListaItem[] {
    return this.listaArraste ?? this.filtrados();
  }

  totalFiltrado(): number {
    return this.filtrados().length;
  }

  abrirNovo(): void {
    this.profissionalDrawer.abrirNovo({
      onSalvo: () => this.carregar(),
    });
  }

  abrirEditar(p: ProfissionalListaItem): void {
    this.profissionalDrawer.abrirEdicao(p.id, {
      onSalvo: (item) => {
        if (item) {
          const foto = profissionalFotoUrl(item);
          this.itens = this.itens.map((row) =>
            row.id === item.id
              ? { ...row, ...item, fotoUrl: foto, foto_url: foto }
              : row,
          );
        }
        this.carregar();
      },
    });
  }

  onAbrirProfissionalDaCelula(
    p: ProfissionalListaItem,
    ev: Event,
    modoGhost?: boolean,
  ): void {
    if (modoGhost) return;
    if (ev instanceof KeyboardEvent) {
      ev.preventDefault();
    }
    ev.stopPropagation();
    this.abrirEditar(p);
  }

  exibirCelular(p: ProfissionalListaItem): string {
    const f = formatarCelularBr(p.celular);
    return f || '';
  }

  exibirEmail(_p: ProfissionalListaItem): string {
    return '';
  }

  ehProfissionalAdmin(p: ProfissionalListaItem): boolean {
    return p.usuario_role === 'admin';
  }

  onInfoMouseEnter(): void {
    this.infoTooltipAberto = true;
  }

  onInfoMouseLeave(): void {
    this.infoTooltipAberto = false;
  }

  onDragHandleDown(ev: PointerEvent, p: ProfissionalListaItem): void {
    if (!this.podeReordenar || this.reordenando) return;
    ev.preventDefault();
    ev.stopPropagation();

    const handle = ev.currentTarget as HTMLElement;
    const tr = handle.closest('tr[data-prof-id]') as HTMLElement | null;
    if (!tr) return;

    handle.setPointerCapture(ev.pointerId);

    const rect = tr.getBoundingClientRect();
    this.alturaLinhaArraste = rect.height || 47;
    this.ghostOffsetX = ev.clientX - rect.left;
    this.ghostOffsetY = ev.clientY - rect.top;

    this.listaArraste = this.filtrados().slice();
    this.ordemInicialArraste = this.listaArraste.map((x) => x.id);
    this.dragFromIndex = this.listaArraste.findIndex((x) => x.id === p.id);
    this.dragSlotIndex = this.dragFromIndex;
    this.dragProfId = p.id;
    this.ghostProf = p;
    this.ghostTop = rect.top;
    this.ghostLeft = rect.left;
    this.ghostWidth = rect.width;
    this.ghostColWidths = Array.from(tr.children).map(
      (cell) => (cell as HTMLElement).getBoundingClientRect().width,
    );

    document.body.classList.add('profissionais-reorder-dragging');
  }

  onArrasteMove(ev: PointerEvent): void {
    if (this.dragProfId == null) return;
    this.ghostTop = ev.clientY - this.ghostOffsetY;
    this.ghostLeft = ev.clientX - this.ghostOffsetX;

    this.atualizarSlot(ev.clientY);
  }

  private tbodyArraste(): HTMLElement | null {
    return document.querySelector(
      '.profissionais-page .profissionais-table tbody',
    );
  }

  private linhaPorId(
    tbody: HTMLElement,
    id: number,
  ): HTMLElement | null {
    return tbody.querySelector(`tr[data-prof-id="${id}"]`);
  }

  private clampSlot(slot: number): number {
    const max = (this.listaArraste?.length ?? 1) - 1;
    return Math.max(0, Math.min(max, slot));
  }

  private calcularSlot(clientY: number): number {
    const list = this.listaArraste!;
    const from = this.dragFromIndex!;
    const tbody = this.tbodyArraste();
    const dragId = this.dragProfId!;
    if (!tbody) return from;

    const tbodyRect = tbody.getBoundingClientRect();
    if (clientY < tbodyRect.top - 48 || clientY > tbodyRect.bottom + 48) {
      return this.dragSlotIndex ?? from;
    }

    const edge = this.alturaLinhaArraste * 0.34;

    for (let i = 0; i < list.length; i++) {
      const p = list[i]!;
      if (p.id === dragId) continue;

      const el = this.linhaPorId(tbody, p.id);
      if (!el) continue;

      const r = el.getBoundingClientRect();
      if (clientY < r.top + edge) {
        return this.clampSlot(i < from ? i : i - 1);
      }
      if (clientY <= r.bottom - edge) {
        const mid = r.top + r.height * 0.5;
        if (clientY < mid) {
          return this.clampSlot(i < from ? i : i - 1);
        }
        return this.clampSlot(i < from ? i + 1 : i);
      }
    }

    return list.length - 1;
  }

  private atualizarSlot(clientY: number): void {
    if (this.dragFromIndex == null) return;
    const slot = this.calcularSlot(clientY);
    if (slot !== this.dragSlotIndex) {
      this.dragSlotIndex = slot;
    }
  }

  /** Deslocamento visual das linhas de fundo (sem reordenar o DOM). */
  offsetVisualLinha(index: number): string | null {
    if (
      this.dragFromIndex == null ||
      this.dragSlotIndex == null ||
      this.dragProfId == null
    ) {
      return null;
    }
    if (index === this.dragFromIndex) return null;

    const from = this.dragFromIndex;
    const slot = this.dragSlotIndex;
    const h = this.alturaLinhaArraste;
    if (from === slot) return null;

    let y = 0;
    if (from < slot) {
      if (index > from && index <= slot) y = -h;
    } else if (index >= slot && index < from) {
      y = h;
    }

    return y ? `translate3d(0, ${y}px, 0)` : null;
  }

  onDragHandleUp(ev: PointerEvent): void {
    this.finalizarArraste();
    try {
      (ev.currentTarget as HTMLElement)?.releasePointerCapture?.(ev.pointerId);
    } catch {
      /* pointer já libertado */
    }
  }

  private finalizarArraste(): void {
    if (this.dragProfId == null) return;

    const from = this.dragFromIndex;
    const slot = this.dragSlotIndex;
    let ordemFinal = this.ordemInicialArraste;

    if (
      from != null &&
      slot != null &&
      from !== slot &&
      this.listaArraste
    ) {
      const list = this.listaArraste.slice();
      const [item] = list.splice(from, 1);
      if (item) list.splice(slot, 0, item);
      ordemFinal = list.map((p) => p.id);
    }

    const mudou = ordemFinal.some(
      (id, i) => id !== this.ordemInicialArraste[i],
    );

    this.cancelarArraste();

    if (mudou) {
      this.persistirOrdem(ordemFinal);
    }
  }

  private cancelarArraste(): void {
    this.ghostProf = null;
    this.ghostColWidths = [];
    this.listaArraste = null;
    this.dragProfId = null;
    this.dragFromIndex = null;
    this.dragSlotIndex = null;
    this.ordemInicialArraste = [];
    document.body.classList.remove('profissionais-reorder-dragging');
  }

  private persistirOrdem(ids: number[]): void {
    ids.forEach((id, i) => {
      const ordem = (i + 1) * 10;
      const row = this.itens.find((x) => x.id === id);
      if (row) row.ordem = ordem;
    });

    this.reordenando = true;
    this.api.reordenarProfissionais(ids).subscribe({
      next: () => {
        this.reordenando = false;
      },
      error: () => {
        this.reordenando = false;
        this.carregar();
      },
    });
  }

  linhaPlaceholder(p: ProfissionalListaItem): boolean {
    return this.dragProfId === p.id;
  }

  @HostListener('document:pointermove', ['$event'])
  onDocumentPointerMove(ev: PointerEvent): void {
    this.onArrasteMove(ev);
  }

  @HostListener('document:pointerup')
  onDocumentPointerUp(): void {
    this.finalizarArraste();
  }

  @HostListener('document:keydown.escape', ['$event'])
  onEscape(ev: KeyboardEvent): void {
    if (this.profissionalDrawer.aberto) {
      return;
    }
    if (this.dragProfId != null) {
      ev.preventDefault();
      this.cancelarArraste();
      return;
    }
    if (this.buscaAberta) {
      ev.preventDefault();
      this.fecharPainelBusca();
    }
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(ev: MouseEvent): void {
    const t = ev.target as HTMLElement | null;
    if (this.buscaAberta && !t?.closest?.('.list-head__busca-wrap')) {
      this.fecharPainelBusca();
    }
  }
}
