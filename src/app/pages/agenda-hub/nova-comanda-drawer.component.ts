import {
  Component,
  DestroyRef,
  HostListener,
  effect,
  inject,
  input,
  OnInit,
  output,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormArray, FormBuilder, FormGroup, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { forkJoin, of, catchError } from 'rxjs';
import { AgendaNovoClientSidebarComponent } from '../agenda-novo/agenda-novo-client-sidebar.component';
import { SaasSelectComponent, type SaasSelectOption } from '../agenda-novo/saas-select.component';
import type { ComandaLinhaInicial } from '../../core/models/comanda-linha-inicial';
import type {
  AtendimentoListaItem,
  ProfissionalListaItem,
  Servico,
} from '../../core/models/api.models';
import { precoUnitarioServicoCatalogo } from '../../core/utils/servico-preco';
import { SheetsApiService } from '../../core/services/sheets-api.service';
import {
  linhaResumoAtendimentoLista,
  ordenarLinhasAtendimentoInPlace,
  valorMonetarioParaNumero,
} from '../../core/utils/atendimento-display';
import type { ComandaDrawerContextoAgenda } from './comanda-drawer.types';

function formataMoedaBrl(n: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

type TipoLinhaComanda =
  | 'Serviço'
  | 'Produto'
  | 'Mega'
  | 'Pacote'
  | 'Cabelo';

/**
 * Drawer «Comanda» no hub: espelha o pedido do atendimento (agendamento) para
 * faturação; o utilizador pode acrescentar linhas extra. Não é edição do agendamento.
 */
@Component({
  selector: 'app-nova-comanda-drawer',
  standalone: true,
  imports: [AgendaNovoClientSidebarComponent, ReactiveFormsModule, SaasSelectComponent],
  templateUrl: './nova-comanda-drawer.component.html',
  styleUrl: './nova-comanda-drawer.component.scss',
})
export class NovaComandaDrawerComponent implements OnInit {
  private readonly api = inject(SheetsApiService);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  /** Preenchido ao abrir a partir do drawer de agendamento (cliente / data correntes). */
  readonly contexto = input<ComandaDrawerContextoAgenda | null>(null);
  readonly fechar = output<void>();
  /** Após excluir o atendimento (comanda) na API com sucesso. */
  readonly comandaExcluida = output<void>();

  readonly clienteComandaCtrl = new FormControl('', { nonNullable: true });

  readonly tamanhos = ['Curto', 'Médio', 'M/L', 'Longo'] as const;
  readonly tiposLinha: TipoLinhaComanda[] = [
    'Serviço',
    'Produto',
    'Mega',
    'Pacote',
    'Cabelo',
  ];

  servicos: Servico[] = [];
  servicosTipoServico: Servico[] = [];
  profissionais: ProfissionalListaItem[] = [];
  private catalogoPronto = false;
  private pendenteSyncAposCatalogo = false;

  /**
   * Linhas espelhadas do atendimento após o GET.
   * O formulário editável é `itensComandaForm` — resincroniza quando a API muda o contexto.
   */
  readonly linhasAtendimentoApi: AtendimentoListaItem[] = [];
  carregandoItens = false;
  erroItens = '';

  itensComandaForm = this.fb.group({
    linhas: this.fb.array<FormGroup>([]),
  });

  get linhasComandaArray(): FormArray<FormGroup> {
    return this.itensComandaForm.get('linhas') as FormArray<FormGroup>;
  }

  outrosMenuAberto = false;
  modalConfirmExcluirAberto = false;
  modalOutrosOpcao: 'imprimir' | 'historico' | null = null;
  excluindo = false;
  erroExcluir = '';

  constructor() {
    effect(() => {
      const ctx = this.contexto();
      const id = ctx?.clienteId?.trim() ?? '';
      if (this.clienteComandaCtrl.value !== id) {
        this.clienteComandaCtrl.setValue(id, { emitEvent: false });
      }
    });

    effect(
      (onCleanup) => {
        const ctx = this.contexto();
        const ymd = (ctx?.dataYmd ?? '').trim();
        const idAt = (ctx?.idAtendimento ?? '').trim();
        this.linhasAtendimentoApi.length = 0;
        if (!idAt || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
          this.carregandoItens = false;
          this.erroItens = '';
          this.sincronizarFormularioAposDados();
          return;
        }
        this.carregandoItens = true;
        this.erroItens = '';
        const sub = this.api
          .listAgendamentos(ymd, ymd, idAt)
          .pipe(
            takeUntilDestroyed(this.destroyRef),
            catchError((e: Error) => {
              this.erroItens =
                e.message || 'Não foi possível carregar os itens do agendamento.';
              return of([] as AtendimentoListaItem[]);
            }),
          )
          .subscribe({
            next: (rows) => {
              const copy = [...rows];
              ordenarLinhasAtendimentoInPlace(copy);
              this.linhasAtendimentoApi.length = 0;
              this.linhasAtendimentoApi.push(...copy);
              this.carregandoItens = false;
              this.sincronizarFormularioAposDados();
            },
          });
        onCleanup(() => sub.unsubscribe());
      },
    );
  }

  ngOnInit(): void {
    forkJoin({
      servicos: this.api.listServicos().pipe(
        catchError(() => of([] as Servico[])),
      ),
      profs: this.api.listProfissionais().pipe(
        catchError(() => of([] as ProfissionalListaItem[])),
      ),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ servicos, profs }) => {
          this.servicos = servicos;
          this.servicosTipoServico = servicos
            .filter((s) => this.isTipoServicoLinha(s))
            .sort((a, b) =>
              this.rotuloServico(a).localeCompare(
                this.rotuloServico(b),
                'pt-BR',
              ),
            );
          this.profissionais = profs ?? [];
          this.catalogoPronto = true;
          if (this.pendenteSyncAposCatalogo) {
            this.pendenteSyncAposCatalogo = false;
            this.sincronizarFormularioAposDados();
          } else {
            this.sincronizarFormularioAposDados();
          }
        },
      });
  }

  private isTipoServicoLinha(s: Servico): boolean {
    const t = String(s['Tipo'] ?? '')
      .trim()
      .toLowerCase();
    return (
      t === 'fixo' ||
      t === 'tamanho' ||
      t === 'serviço' ||
      t === 'servico'
    );
  }

  private rotuloServico(s: Servico): string {
    const nome = String(s['Serviço'] ?? '').trim();
    const tp = String(s['Tipo'] ?? '').trim();
    if (nome && tp) return `${nome} (${tp})`;
    return nome || tp || 'Serviço ' + s.id;
  }

  opcoesTiposLinha(): SaasSelectOption[] {
    return this.tiposLinha.map((t) => ({ value: t, label: t }));
  }

  opcoesServicosCatalogo(): SaasSelectOption[] {
    return this.servicosTipoServico.map((s) => ({
      value: String(s.id),
      label: this.rotuloServico(s),
    }));
  }

  opcoesTamanhosSelect(): SaasSelectOption[] {
    return this.tamanhos.map((t) => ({ value: t, label: t }));
  }

  opcoesProfissionaisSelect(): SaasSelectOption[] {
    return this.profissionais.map((p) => ({
      value: String(p.id),
      label: p.nome,
    }));
  }

  private servicoPorId(id: string | null | undefined): Servico | undefined {
    const sid = String(id ?? '').trim();
    if (!sid) return undefined;
    return this.servicosTipoServico.find((s) => String(s.id) === sid);
  }

  /** Catálogo completo (preço) mesmo que o tipo não entre em `servicosTipoServico`. */
  private servicoPorIdQualquer(id: string | null | undefined): Servico | undefined {
    return (
      this.servicoPorId(id) ??
      this.servicos.find((s) => String(s.id) === String(id ?? '').trim())
    );
  }

  /** Igual a `precisaTamanhoServicoId` do agendamento (catálogo completo). */
  precisaTamanhoServicoId(id: string | null | undefined): boolean {
    const s = this.servicoPorIdQualquer(id);
    if (!s) return false;
    const t = String(s['Tipo'] ?? '').trim().toLowerCase();
    return t === 'tamanho' || t === 'serviço' || t === 'servico';
  }

  /**
   * Ao escolher serviço ou tamanho na comanda, preenche o valor unitário com o preço do catálogo.
   */
  onServicoOuTamanhoComandaChange(i: number): void {
    this.atualizarValorUnitarioLinhaServico(i);
  }

  private atualizarValorUnitarioLinhaServico(i: number): void {
    const g = this.linhasComandaArray.at(i);
    if (!g) return;
    if (g.get('itemTipo')?.value !== 'Serviço') return;
    const sid = String(g.get('servico_id')?.value ?? '').trim();
    if (!sid) return;
    const tam = String(g.get('tamanho')?.value ?? 'Curto').trim();
    const svc = this.servicoPorIdQualquer(sid);
    const preco = precoUnitarioServicoCatalogo(svc, tam);
    if (preco == null || preco <= 0) return;
    g.patchValue(
      { valorUnitStr: this.formatarInputPt(preco) },
      { emitEvent: true },
    );
  }

  private mapTipoForm(l: AtendimentoListaItem): TipoLinhaComanda {
    const x = String(l.tipo ?? '')
      .trim()
      .toLowerCase();
    if (x === 'produto') return 'Produto';
    if (x === 'mega') return 'Mega';
    if (x === 'pacote') return 'Pacote';
    if (x === 'cabelo') return 'Cabelo';
    return 'Serviço';
  }

  private profissionalValorForm(l: AtendimentoListaItem): number | null {
    const itens = l.itens_catalogo ?? l.itens ?? [];
    for (const it of itens) {
      const pid = it.profissional_id;
      if (pid != null && Number(pid) > 0) {
        const id = Number(pid);
        if (this.profissionais.some((p) => p.id === id)) return id;
      }
    }
    const rid = l.profissional_id;
    if (rid != null && Number(rid) > 0) {
      const id = Number(rid);
      if (this.profissionais.some((p) => p.id === id)) return id;
    }
    const nome = (l.profissional || '').trim();
    if (!nome) return null;
    const hit = this.profissionais.find(
      (p) => p.nome.trim() === nome,
    );
    return hit ? hit.id : null;
  }

  private servicoIdDaLinha(l: AtendimentoListaItem): string {
    const itens = l.itens_catalogo ?? l.itens ?? [];
    for (const it of itens) {
      if (it.tipo === 'servico' && it.servico_id != null && it.servico_id > 0) {
        return String(it.servico_id);
      }
    }
    return '';
  }

  private tamanhoDaLinha(l: AtendimentoListaItem): string {
    const itens = l.itens_catalogo ?? l.itens ?? [];
    for (const it of itens) {
      if (it.tipo === 'servico' && it.tamanho?.trim()) {
        return it.tamanho.trim();
      }
    }
    return 'Curto';
  }

  /**
   * Quantidade da **linha da comanda** (uma linha = um item de fatura).
   * Não somar todas as entradas da pivot: vários `itens_catalogo` na mesma linha de
   * atendimento (ex.: detalhes internos) não devem multiplicar a quantidade.
   */
  private quantidadeApi(l: AtendimentoListaItem): number {
    const itens = l.itens_catalogo ?? l.itens;
    if (!itens || itens.length === 0) return 1;
    const principal =
      itens.find((it) => it.tipo === 'servico') ??
      itens.find((it) => it.tipo === 'produto') ??
      itens[0];
    const q = Number(principal?.quantidade);
    return Number.isFinite(q) && q > 0 ? q : 1;
  }

  private valoresMonetarioLinha(
    l: AtendimentoListaItem,
  ): { v: number; d: number; q: number; total: number; unit: number } {
    const v = valorMonetarioParaNumero(l.valor) ?? 0;
    const d = valorMonetarioParaNumero(l.desconto) ?? 0;
    const q = this.quantidadeApi(l);
    let total = Math.max(0, v - d);
    let unit = q > 0 ? total / q : total;
    if ((total <= 0 || unit <= 0) && this.servicoIdDaLinha(l)) {
      const cat = precoUnitarioServicoCatalogo(
        this.servicoPorIdQualquer(this.servicoIdDaLinha(l)),
        this.tamanhoDaLinha(l),
      );
      if (cat != null && cat > 0) {
        unit = cat;
        total = Math.max(0, cat * q - d);
      }
    }
    return { v, d, q, total, unit };
  }

  onItemTipoChange(i: number): void {
    const g = this.linhasComandaArray.at(i);
    if (!g) return;
    g.patchValue(
      {
        servico_id: '',
        resumoNaoServico: '',
        tamanho: 'Curto',
      },
      { emitEvent: true },
    );
  }

  private criarFormLinhaVazia(t: TipoLinhaComanda = 'Serviço'): FormGroup {
    return this.fb.group({
      itemTipo: this.fb.control<TipoLinhaComanda>(t),
      servico_id: [''],
      tamanho: this.fb.nonNullable.control<string>('Curto'),
      profissional: [null as number | null],
      resumoNaoServico: [''],
      quantidade: this.fb.control(1, { validators: [Validators.min(0.01)] }),
      valorUnitStr: ['0,00'],
      descontoStr: ['0,00'],
    });
  }

  private formFromSnapshot(row: ComandaLinhaInicial): FormGroup {
    const tipo = this.mapTipoSnapshot(row.itemTipo);
    const q = Math.max(0.01, Number(row.quantidade) || 1);
    const vu = String(row.valorUnitStr ?? '0,00').trim() || '0,00';
    const ds = String(row.descontoStr ?? '0,00').trim() || '0,00';
    if (tipo === 'Serviço') {
      return this.fb.group({
        itemTipo: this.fb.control<TipoLinhaComanda>('Serviço'),
        servico_id: [String(row.servico_id ?? '').trim()],
        tamanho: this.fb.nonNullable.control(
          String(row.tamanho ?? 'Curto').trim() || 'Curto',
        ),
        profissional: this.fb.control<number | null>(row.profissional ?? null),
        resumoNaoServico: [''],
        quantidade: this.fb.control(q, { validators: [Validators.min(0.01)] }),
        valorUnitStr: [vu],
        descontoStr: [ds],
      });
    }
    return this.fb.group({
      itemTipo: this.fb.control(tipo),
      servico_id: [''],
      tamanho: this.fb.nonNullable.control('Curto'),
      profissional: this.fb.control<number | null>(row.profissional ?? null),
      resumoNaoServico: [
        String(row.resumoNaoServico ?? '').trim() || '—',
      ],
      quantidade: this.fb.control(q, { validators: [Validators.min(0.01)] }),
      valorUnitStr: [vu],
      descontoStr: [ds],
    });
  }

  private mapTipoSnapshot(t: string): TipoLinhaComanda {
    const x = String(t ?? '').trim();
    if (
      x === 'Produto' ||
      x === 'Mega' ||
      x === 'Pacote' ||
      x === 'Cabelo'
    ) {
      return x;
    }
    return 'Serviço';
  }

  private formFromApi(l: AtendimentoListaItem): FormGroup {
    const tipo = this.mapTipoForm(l);
    const { d, q, unit } = this.valoresMonetarioLinha(l);
    if (tipo === 'Serviço') {
      const sid = this.servicoIdDaLinha(l);
      return this.fb.group({
        itemTipo: this.fb.control<TipoLinhaComanda>('Serviço'),
        servico_id: [sid ? String(sid) : ''],
        tamanho: this.fb.nonNullable.control(this.tamanhoDaLinha(l)),
        profissional: this.fb.control<number | null>(
          this.profissionalValorForm(l),
        ),
        resumoNaoServico: [''],
        quantidade: this.fb.control(q, { validators: [Validators.min(0.01)] }),
        valorUnitStr: [this.formatarInputPt(unit)],
        descontoStr: [d > 0 ? this.formatarInputPt(d) : '0,00'],
      });
    }
    const vm = this.valoresMonetarioLinha(l);
    return this.fb.group({
      itemTipo: this.fb.control(tipo),
      servico_id: [''],
      tamanho: this.fb.nonNullable.control('Curto'),
      profissional: this.fb.control<number | null>(
        this.profissionalValorForm(l),
      ),
      resumoNaoServico: [linhaResumoAtendimentoLista(l) || l.descricao || '—'],
      quantidade: this.fb.control(q, { validators: [Validators.min(0.01)] }),
      valorUnitStr: [this.formatarInputPt(vm.unit)],
      descontoStr: [vm.d > 0 ? this.formatarInputPt(vm.d) : '0,00'],
    });
  }

  private formatarInputPt(n: number): string {
    return n.toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  private parsePtDecimal(s: string): number {
    const t = String(s ?? '')
      .trim()
      .replace(/\s/g, '')
      .replace(/\./g, '')
      .replace(',', '.');
    const n = parseFloat(t);
    return Number.isFinite(n) ? n : 0;
  }

  resumoComandaTotais(): {
    desconto: number;
    credito: number;
    cashback: number;
    total: number;
  } {
    let bruto = 0;
    let desconto = 0;
    for (const c of this.linhasComandaArray.controls) {
      const g = c as FormGroup;
      const q = Math.max(0.01, Number(g.get('quantidade')?.value) || 1);
      const vu = this.parsePtDecimal(
        String(g.get('valorUnitStr')?.value ?? '0'),
      );
      const d = this.parsePtDecimal(
        String(g.get('descontoStr')?.value ?? '0'),
      );
      bruto += vu * q;
      desconto += d;
    }
    return {
      desconto,
      credito: 0,
      cashback: 0,
      total: Math.max(0, bruto - desconto),
    };
  }

  totalLinhaForm(i: number): string {
    const g = this.linhasComandaArray.at(i);
    if (!g) return formataMoedaBrl(0);
    const q = Math.max(0.01, Number(g.get('quantidade')?.value) || 1);
    const vu = this.parsePtDecimal(
      String(g.get('valorUnitStr')?.value ?? '0'),
    );
    const d = this.parsePtDecimal(
      String(g.get('descontoStr')?.value ?? '0'),
    );
    return formataMoedaBrl(Math.max(0, vu * q - d));
  }

  adicionarLinhaComanda(): void {
    this.linhasComandaArray.push(this.criarFormLinhaVazia('Serviço'));
  }

  removerLinhaComanda(i: number): void {
    if (this.linhasComandaArray.length <= 1) return;
    this.linhasComandaArray.removeAt(i);
  }

  private sincronizarFormularioAposDados(): void {
    if (!this.catalogoPronto) {
      this.pendenteSyncAposCatalogo = true;
      return;
    }
    const ctx = this.contexto();
    const idOk = (ctx?.idAtendimento ?? '').trim();
    const snap = ctx?.linhasSnapshot;

    this.linhasComandaArray.clear();

    if (idOk && this.linhasAtendimentoApi.length > 0) {
      for (const l of this.linhasAtendimentoApi) {
        this.linhasComandaArray.push(this.formFromApi(l));
      }
      return;
    }

    if (snap && snap.length > 0) {
      for (const row of snap) {
        this.linhasComandaArray.push(this.formFromSnapshot(row));
      }
      return;
    }

    this.linhasComandaArray.push(this.criarFormLinhaVazia('Serviço'));
  }

  @HostListener('click', ['$event'])
  onHostClickFecharOutros(ev: MouseEvent): void {
    if (!this.outrosMenuAberto) return;
    const el = ev.target as HTMLElement | null;
    if (el && !el.closest('.nc-outros-wrap')) {
      this.fecharOutrosMenu();
    }
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(ev: MouseEvent): void {
    const el = ev.target as HTMLElement | null;
    if (this.outrosMenuAberto && el && !el.closest('.nc-outros-wrap')) {
      this.fecharOutrosMenu();
    }
  }

  podeExcluirComanda(): boolean {
    return Boolean(this.contexto()?.idAtendimento?.trim());
  }

  toggleOutrosMenu(ev?: MouseEvent): void {
    ev?.stopPropagation();
    this.outrosMenuAberto = !this.outrosMenuAberto;
  }

  fecharOutrosMenu(): void {
    this.outrosMenuAberto = false;
  }

  abrirModalExcluir(): void {
    if (!this.podeExcluirComanda() || this.excluindo) return;
    this.fecharOutrosMenu();
    this.erroExcluir = '';
    this.modalConfirmExcluirAberto = true;
  }

  fecharModalExcluir(): void {
    if (this.excluindo) return;
    this.modalConfirmExcluirAberto = false;
    this.erroExcluir = '';
  }

  confirmarExcluirComanda(): void {
    const id = this.contexto()?.idAtendimento?.trim();
    if (!id || this.excluindo) return;
    this.erroExcluir = '';
    this.excluindo = true;
    this.api.excluirAtendimento(id).subscribe({
      next: () => {
        this.excluindo = false;
        this.modalConfirmExcluirAberto = false;
        this.comandaExcluida.emit();
      },
      error: (e: Error) => {
        this.excluindo = false;
        this.erroExcluir =
          e.message ||
          'Não foi possível excluir. Verifique a internet e tente de novo.';
      },
    });
  }

  onOutrosImprimir(): void {
    this.fecharOutrosMenu();
    this.modalOutrosOpcao = 'imprimir';
  }

  onOutrosHistorico(): void {
    this.fecharOutrosMenu();
    this.modalOutrosOpcao = 'historico';
  }

  fecharModalOutrosOpcao(): void {
    this.modalOutrosOpcao = null;
  }

  dataComandaExibicao(): string {
    const ymd = this.contexto()?.dataYmd?.trim();
    if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return '—';
    const p = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd);
    return p ? `${p[3]}/${p[2]}/${p[1]}` : ymd;
  }

  tituloComandaDrawer(): string {
    const n = this.contexto()?.numeroComandaTitulo;
    const num = typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : 1;
    return `Editando comanda #${num}`;
  }

  brl(n: number): string {
    return formataMoedaBrl(n);
  }

  contextoPodeSincronizarItens(): boolean {
    return Boolean(
      (this.contexto()?.idAtendimento ?? '').trim() &&
        /^\d{4}-\d{2}-\d{2}$/.test(
          (this.contexto()?.dataYmd ?? '').trim(),
        ),
    );
  }
}
