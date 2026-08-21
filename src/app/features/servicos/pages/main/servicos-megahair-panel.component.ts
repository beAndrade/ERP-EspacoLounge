import { CurrencyPipe } from '@angular/common';
import {
  Component,
  HostListener,
  Input,
  OnChanges,
  SimpleChanges,
  inject,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { SheetsApiService } from '../../../../core/services/sheets-api.service';
import type {
  CabeloCatalogoItem,
  PacoteCatalogoItem,
  RegraMegaItem,
} from '../../../../core/models/api.models';
import { TableEmptyComponent } from '../../../../shared/table-empty/table-empty.component';
import { formataMoedaBrl } from '../../../../core/utils/brl-digit-input';
import { valorMonetarioParaNumero } from '../../../../core/utils/atendimento-display';

export type MegahairSubAba =
  | 'mega'
  | 'pacote'
  | 'pacote_queratina'
  | 'cabelo';

const DURACOES = [15, 20, 30, 45, 60, 90, 120];

@Component({
  selector: 'app-servicos-megahair-panel',
  standalone: true,
  imports: [FormsModule, TableEmptyComponent, CurrencyPipe],
  templateUrl: './servicos-megahair-panel.component.html',
  styleUrl: './servicos-megahair-panel.component.scss',
})
export class ServicosMegahairPanelComponent implements OnChanges {
  private readonly api = inject(SheetsApiService);

  @Input() subAba: MegahairSubAba = 'mega';
  /** Busca do header da página (mesma estrutura de Serviços / Produtos). */
  @Input() busca = '';

  carregando = false;
  private jaCarregou = false;
  erro = '';
  salvando = false;
  formErro = '';

  regrasMega: RegraMegaItem[] = [];
  regrasQueratina: RegraMegaItem[] = [];
  pacotes: PacoteCatalogoItem[] = [];
  pacotesQueratina: PacoteCatalogoItem[] = [];
  cabelos: CabeloCatalogoItem[] = [];

  /** Mesma ideia da aba Serviços: seleção por checkbox. */
  selecionados = new Set<string>();

  modalAberto = false;
  modalPanelOpen = false;
  modalTitulo = '';
  modalModo: 'regra' | 'pacote' | 'cabelo' = 'regra';
  editId: number | null = null;
  private tModalClose = 0;

  formPacote = '';
  formEtapa = '';
  formValor = '';
  formComissao = '';
  formDuracao = 30;
  formPreco = '';
  formCor = '';
  formTamanho = '';
  formMetodo = '';
  formValorBase = '';

  excluirModalAberto = false;
  excluindo = false;
  excluirAlvo:
    | { tipo: 'regra' | 'pacote' | 'cabelo'; id: number; label: string }
    | null = null;
  excluirErro = '';

  readonly opcoesDuracao = DURACOES;

  get opcoesDuracaoForm(): number[] {
    const base = [...DURACOES];
    const d = Number(this.formDuracao);
    if (Number.isFinite(d) && d >= 5 && !base.includes(d)) {
      base.push(d);
      base.sort((a, b) => a - b);
    }
    return base;
  }

  /** Carrega só na primeira vez (troca de aba sem stutter). */
  carregarSeNecessario(): void {
    if (this.jaCarregou || this.carregando) return;
    this.carregar();
  }

  ngOnChanges(ch: SimpleChanges): void {
    if (ch['subAba'] && !ch['subAba'].firstChange) {
      this.selecionados.clear();
    }
  }

  carregar(): void {
    this.carregando = true;
    this.erro = '';
    this.selecionados.clear();
    forkJoin({
      regrasMega: this.api.listRegrasMega(),
      regrasQueratina: this.api.listRegrasMegaQueratina(),
      pacotes: this.api.listPacotes(),
      pacotesQueratina: this.api.listPacotesQueratina(),
      cabelos: this.api.listCabelos(),
    }).subscribe({
      next: (r) => {
        this.regrasMega = r.regrasMega ?? [];
        this.regrasQueratina = r.regrasQueratina ?? [];
        this.pacotes = r.pacotes ?? [];
        this.pacotesQueratina = r.pacotesQueratina ?? [];
        this.cabelos = r.cabelos ?? [];
        this.jaCarregou = true;
        this.carregando = false;
      },
      error: (e: Error) => {
        this.erro =
          e.message || 'Não foi possível carregar o catálogo Megahair.';
        this.carregando = false;
      },
    });
  }

  chaveRegra(r: RegraMegaItem): string | null {
    return r.id != null ? `regra:${r.id}` : null;
  }

  chavePacote(p: PacoteCatalogoItem): string | null {
    return p.id != null ? `pacote:${p.id}` : null;
  }

  chaveCabelo(c: CabeloCatalogoItem): string | null {
    return c.id != null ? `cabelo:${c.id}` : null;
  }

  estaSelecionado(chave: string | null): boolean {
    return chave != null && this.selecionados.has(chave);
  }

  toggleSelecionado(chave: string | null, ev: Event): void {
    if (chave == null) return;
    const checked = (ev.target as HTMLInputElement).checked;
    if (checked) this.selecionados.add(chave);
    else this.selecionados.delete(chave);
  }

  todosRegrasMegaSelecionados(): boolean {
    const itens = this.regrasFiltradasMega.filter((r) => r.id != null);
    return (
      itens.length > 0 &&
      itens.every((r) => this.selecionados.has(`regra:${r.id}`))
    );
  }

  toggleSelecionarTodosRegrasMega(ev: Event): void {
    const checked = (ev.target as HTMLInputElement).checked;
    for (const r of this.regrasFiltradasMega) {
      if (r.id == null) continue;
      const k = `regra:${r.id}`;
      if (checked) this.selecionados.add(k);
      else this.selecionados.delete(k);
    }
  }

  todosPacotesSelecionados(): boolean {
    const itens = this.pacotesFiltrados().filter((p) => p.id != null);
    return (
      itens.length > 0 &&
      itens.every((p) => this.selecionados.has(`pacote:${p.id}`))
    );
  }

  toggleSelecionarTodosPacotes(ev: Event): void {
    const checked = (ev.target as HTMLInputElement).checked;
    for (const p of this.pacotesFiltrados()) {
      if (p.id == null) continue;
      const k = `pacote:${p.id}`;
      if (checked) this.selecionados.add(k);
      else this.selecionados.delete(k);
    }
  }

  todosRegrasPacoteSelecionados(): boolean {
    const itens = this.regrasParaAbaPacote().filter((r) => r.id != null);
    return (
      itens.length > 0 &&
      itens.every((r) => this.selecionados.has(`regra:${r.id}`))
    );
  }

  toggleSelecionarTodosRegrasPacote(ev: Event): void {
    const checked = (ev.target as HTMLInputElement).checked;
    for (const r of this.regrasParaAbaPacote()) {
      if (r.id == null) continue;
      const k = `regra:${r.id}`;
      if (checked) this.selecionados.add(k);
      else this.selecionados.delete(k);
    }
  }

  todosCabelosSelecionados(): boolean {
    const itens = this.cabelosFiltrados().filter((c) => c.id != null);
    return (
      itens.length > 0 &&
      itens.every((c) => this.selecionados.has(`cabelo:${c.id}`))
    );
  }

  toggleSelecionarTodosCabelos(ev: Event): void {
    const checked = (ev.target as HTMLInputElement).checked;
    for (const c of this.cabelosFiltrados()) {
      if (c.id == null) continue;
      const k = `cabelo:${c.id}`;
      if (checked) this.selecionados.add(k);
      else this.selecionados.delete(k);
    }
  }

  get regrasFiltradasMega(): RegraMegaItem[] {
    const q = this.busca.trim().toLowerCase();
    const base = this.regrasMega;
    if (!q) return [...base].sort(this.sortRegra);
    return base
      .filter(
        (r) =>
          r.pacote.toLowerCase().includes(q) ||
          r.etapa.toLowerCase().includes(q),
      )
      .sort(this.sortRegra);
  }

  get pacotesAtivos(): PacoteCatalogoItem[] {
    return this.subAba === 'pacote_queratina'
      ? this.pacotesQueratina
      : this.pacotes;
  }

  /** Na aba Pacote/Queratina: etapas do catálogo de regras correspondente. */
  regrasParaAbaPacote(): RegraMegaItem[] {
    const base =
      this.subAba === 'pacote_queratina'
        ? this.regrasQueratina
        : this.regrasMega;
    const nomes = new Set(
      this.pacotesAtivos.map((p) => p.pacote.trim().toLowerCase()),
    );
    const q = this.busca.trim().toLowerCase();
    return base
      .filter((r) => {
        if (nomes.size && !nomes.has(r.pacote.trim().toLowerCase())) {
          /* ainda mostra etapas órfãs (só regras, sem cabeça) */
        }
        if (!q) return true;
        return (
          r.pacote.toLowerCase().includes(q) ||
          r.etapa.toLowerCase().includes(q)
        );
      })
      .sort(this.sortRegra);
  }

  pacotesFiltrados(): PacoteCatalogoItem[] {
    const q = this.busca.trim().toLowerCase();
    const base = this.pacotesAtivos;
    if (!q) return [...base].sort((a, b) => a.pacote.localeCompare(b.pacote, 'pt-BR'));
    return base
      .filter((p) => p.pacote.toLowerCase().includes(q))
      .sort((a, b) => a.pacote.localeCompare(b.pacote, 'pt-BR'));
  }

  cabelosFiltrados(): CabeloCatalogoItem[] {
    const q = this.busca.trim().toLowerCase();
    if (!q) return [...this.cabelos];
    return this.cabelos.filter(
      (c) =>
        c.cor.toLowerCase().includes(q) ||
        String(c.tamanho_cm ?? '')
          .toLowerCase()
          .includes(q) ||
        c.metodo.toLowerCase().includes(q),
    );
  }

  private sortRegra = (a: RegraMegaItem, b: RegraMegaItem): number => {
    const p = a.pacote.localeCompare(b.pacote, 'pt-BR');
    if (p !== 0) return p;
    return a.etapa.localeCompare(b.etapa, 'pt-BR');
  };

  rotuloDuracao(m: number | null | undefined): string {
    const n = Number(m);
    if (!Number.isFinite(n) || n <= 0) return '—';
    return `${n} min`;
  }

  valorNum(v: unknown): number | null {
    return valorMonetarioParaNumero(v);
  }

  rotuloMoeda(v: unknown): string {
    const n = valorMonetarioParaNumero(v);
    if (n == null) return '—';
    return formataMoedaBrl(n);
  }

  private abrirDrawer(): void {
    window.clearTimeout(this.tModalClose);
    this.modalAberto = true;
    this.modalPanelOpen = false;
    queueMicrotask(() => {
      requestAnimationFrame(() => {
        this.modalPanelOpen = true;
      });
    });
  }

  abrirNovo(): void {
    this.formErro = '';
    this.editId = null;
    this.formPacote = '';
    this.formEtapa = '';
    this.formValor = '';
    this.formComissao = '';
    this.formDuracao = 30;
    this.formPreco = '';
    this.formCor = '';
    this.formTamanho = '';
    this.formMetodo = '';
    this.formValorBase = '';
    if (this.subAba === 'cabelo') {
      this.modalModo = 'cabelo';
      this.modalTitulo = 'Novo cabelo';
    } else if (this.subAba === 'pacote' || this.subAba === 'pacote_queratina') {
      this.modalModo = 'pacote';
      this.modalTitulo =
        this.subAba === 'pacote'
          ? 'Novo pacote'
          : 'Novo pacote adesivo+queratina';
    } else {
      this.modalModo = 'regra';
      this.modalTitulo = 'Nova etapa Mega';
    }
    this.abrirDrawer();
  }

  abrirEditarRegra(r: RegraMegaItem): void {
    if (r.id == null) return;
    this.formErro = '';
    this.editId = r.id;
    this.modalModo = 'regra';
    this.modalTitulo = 'Editar etapa';
    this.formPacote = r.pacote;
    this.formEtapa = r.etapa;
    this.formValor = this.rotuloMoeda(r.valor) === '—' ? '' : this.rotuloMoeda(r.valor);
    this.formComissao =
      this.rotuloMoeda(r.comissao) === '—' ? '' : this.rotuloMoeda(r.comissao);
    this.formDuracao =
      Number(r.duracao_minutos) > 0 ? Number(r.duracao_minutos) : 30;
    this.abrirDrawer();
  }

  abrirEditarPacote(p: PacoteCatalogoItem): void {
    if (p.id == null) return;
    this.formErro = '';
    this.editId = p.id;
    this.modalModo = 'pacote';
    this.modalTitulo = 'Editar pacote';
    this.formPacote = p.pacote;
    this.formPreco =
      this.rotuloMoeda(p.preco) === '—' ? '' : this.rotuloMoeda(p.preco);
    this.abrirDrawer();
  }

  abrirEditarCabelo(c: CabeloCatalogoItem): void {
    if (c.id == null) return;
    this.formErro = '';
    this.editId = c.id;
    this.modalModo = 'cabelo';
    this.modalTitulo = 'Editar cabelo';
    this.formCor = c.cor;
    this.formTamanho = String(c.tamanho_cm ?? '');
    this.formMetodo = c.metodo;
    this.formValorBase =
      this.rotuloMoeda(c.valor_base) === '—'
        ? ''
        : this.rotuloMoeda(c.valor_base);
    this.abrirDrawer();
  }

  abrirNovaEtapaParaPacote(pacoteNome: string): void {
    this.formErro = '';
    this.editId = null;
    this.modalModo = 'regra';
    this.modalTitulo = 'Nova etapa';
    this.formPacote = pacoteNome;
    this.formEtapa = '';
    this.formValor = '';
    this.formComissao = '';
    this.formDuracao = 30;
    this.abrirDrawer();
  }

  fecharModal(): void {
    if (this.salvando) return;
    this.modalPanelOpen = false;
    window.clearTimeout(this.tModalClose);
    this.tModalClose = window.setTimeout(() => {
      this.modalAberto = false;
    }, 280);
  }

  @HostListener('document:keydown.escape', ['$event'])
  onEscape(ev: KeyboardEvent): void {
    if (this.excluirModalAberto) {
      ev.preventDefault();
      this.fecharExcluir();
      return;
    }
    if (this.modalAberto) {
      ev.preventDefault();
      this.fecharModal();
    }
  }

  salvarModal(): void {
    this.formErro = '';
    this.salvando = true;
    const done = (ok: boolean, msg?: string) => {
      this.salvando = false;
      if (!ok) {
        this.formErro = msg || 'Não foi possível salvar.';
        return;
      }
      this.fecharModal();
      this.carregar();
    };

    if (this.modalModo === 'regra') {
      const body = {
        pacote: this.formPacote.trim(),
        etapa: this.formEtapa.trim(),
        valor: this.formValor.trim() || null,
        comissao: this.formComissao.trim() || null,
        duracao_minutos: this.formDuracao,
      };
      const saveQueratina = this.subAba === 'pacote_queratina';
      if (this.editId != null) {
        const req = saveQueratina
          ? this.api.updateRegraMegaQueratina(this.editId, body)
          : this.api.updateRegraMega(this.editId, body);
        req.subscribe({
          next: () => done(true),
          error: (e: Error) => done(false, e.message),
        });
      } else {
        const req = saveQueratina
          ? this.api.createRegraMegaQueratina(body)
          : this.api.createRegraMega(body);
        req.subscribe({
          next: () => done(true),
          error: (e: Error) => done(false, e.message),
        });
      }
      return;
    }

    if (this.modalModo === 'pacote') {
      const body = {
        pacote: this.formPacote.trim(),
        preco: this.formPreco.trim() || null,
      };
      const saveQueratina = this.subAba === 'pacote_queratina';
      if (this.editId != null) {
        const req = saveQueratina
          ? this.api.updatePacoteQueratina(this.editId, body)
          : this.api.updatePacote(this.editId, body);
        req.subscribe({
          next: () => done(true),
          error: (e: Error) => done(false, e.message),
        });
      } else {
        const req = saveQueratina
          ? this.api.createPacoteQueratina(body)
          : this.api.createPacote(body);
        req.subscribe({
          next: () => done(true),
          error: (e: Error) => done(false, e.message),
        });
      }
      return;
    }

    const body = {
      cor: this.formCor.trim(),
      tamanho_cm: this.formTamanho.trim(),
      metodo: this.formMetodo.trim(),
      valor_base: this.formValorBase.trim() || null,
    };
    if (this.editId != null) {
      this.api.updateCabelo(this.editId, body).subscribe({
        next: () => done(true),
        error: (e: Error) => done(false, e.message),
      });
    } else {
      this.api.createCabelo(body).subscribe({
        next: () => done(true),
        error: (e: Error) => done(false, e.message),
      });
    }
  }

  pedirExcluirRegra(r: RegraMegaItem): void {
    if (r.id == null) return;
    this.excluirAlvo = {
      tipo: 'regra',
      id: r.id,
      label: `${r.pacote} · ${r.etapa}`,
    };
    this.excluirErro = '';
    this.excluirModalAberto = true;
  }

  pedirExcluirPacote(p: PacoteCatalogoItem): void {
    if (p.id == null) return;
    this.excluirAlvo = { tipo: 'pacote', id: p.id, label: p.pacote };
    this.excluirErro = '';
    this.excluirModalAberto = true;
  }

  pedirExcluirCabelo(c: CabeloCatalogoItem): void {
    if (c.id == null) return;
    this.excluirAlvo = {
      tipo: 'cabelo',
      id: c.id,
      label: `${c.cor} · ${c.tamanho_cm} · ${c.metodo}`,
    };
    this.excluirErro = '';
    this.excluirModalAberto = true;
  }

  fecharExcluir(): void {
    if (this.excluindo) return;
    this.excluirModalAberto = false;
    this.excluirAlvo = null;
  }

  confirmarExcluir(): void {
    const alvo = this.excluirAlvo;
    if (!alvo) return;
    this.excluindo = true;
    this.excluirErro = '';
    const finish = (ok: boolean, msg?: string) => {
      this.excluindo = false;
      if (!ok) {
        this.excluirErro = msg || 'Não foi possível excluir.';
        return;
      }
      this.excluirModalAberto = false;
      this.excluirAlvo = null;
      this.carregar();
    };

    if (alvo.tipo === 'cabelo') {
      this.api.deleteCabelo(alvo.id).subscribe({
        next: () => finish(true),
        error: (e: Error) => finish(false, e.message),
      });
      return;
    }
    if (alvo.tipo === 'pacote') {
      const req =
        this.subAba === 'pacote_queratina'
          ? this.api.deletePacoteQueratina(alvo.id)
          : this.api.deletePacote(alvo.id);
      req.subscribe({
        next: () => finish(true),
        error: (e: Error) => finish(false, e.message),
      });
      return;
    }
    const req2 =
      this.subAba === 'mega' || this.subAba === 'pacote'
        ? this.api.deleteRegraMega(alvo.id)
        : this.api.deleteRegraMegaQueratina(alvo.id);
    req2.subscribe({
      next: () => finish(true),
      error: (e: Error) => finish(false, e.message),
    });
  }
}
