import {
  Component,
  EventEmitter,
  inject,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  SimpleChanges,
} from '@angular/core';
import {
  minutosMeiaNoiteEmBrasilia,
  normalizarHoraHHmm,
  slotInicioFimBrasilia,
} from '../../core/utils/brasilia-time';
import {
  addMinutesToParts,
  civilNaiveSalaoParaUtcMs,
  formatSqlLocalDateTime,
  parseSqlLocalDateTime,
  ymdOfParts,
} from '../../core/utils/sql-local-datetime';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  AbstractControl,
  FormArray,
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { catchError, forkJoin, of, Subscription, switchMap } from 'rxjs';
import { SheetsApiService } from '../../core/services/sheets-api.service';
import {
  AtendimentoListaItem,
  CabeloCatalogoItem,
  Cliente,
  CreateAtendimentoPayload,
  PacoteCatalogoItem,
  ProdutoCatalogoItem,
  ProfissionalListaItem,
  RegraMegaItem,
  Servico,
  TipoAtendimento,
} from '../../core/models/api.models';
import {
  dataDdMmAaaa,
  ordenarLinhasAtendimentoInPlace,
  valorMonetarioParaNumero,
} from '../../core/utils/atendimento-display';

/** Valor de `<input type="date">`: AAAA-MM-DD válido. */
function normalizarDataIso(s: string): string | null {
  const t = s.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  const [y, m, d] = t.split('-').map((x) => parseInt(x, 10));
  const dt = new Date(y, m - 1, d);
  if (
    dt.getFullYear() !== y ||
    dt.getMonth() !== m - 1 ||
    dt.getDate() !== d
  ) {
    return null;
  }
  return t;
}

function valorCabeloPtValidator(
  control: AbstractControl,
): ValidationErrors | null {
  const v = String(control.value ?? '').trim();
  if (!v) return null;
  const n = parseFloat(v.replace(/\s/g, '').replace(',', '.'));
  return Number.isNaN(n) || n <= 0 ? { valorCabeloInvalido: true } : null;
}

function mapTipoFromApi(t: string): TipoAtendimento {
  const x = t.trim().toLowerCase();
  if (x === 'mega') return 'Mega';
  if (x === 'pacote') return 'Pacote';
  if (x === 'produto') return 'Produto';
  if (x === 'cabelo') return 'Cabelo';
  return 'Serviço';
}

function stripQtdSuffixObservacao(s: string): string {
  return s.replace(/\s*—\s*Qtd:\s*[^]*$/i, '').trim();
}

function parseQuantidadeFromDescricao(s: string): number {
  const m = /\bQtd:\s*([0-9]+(?:[.,][0-9]+)?)/i.exec(s);
  if (!m) return 0;
  const t = m[1].replace(',', '.');
  const n = parseFloat(t);
  return Number.isNaN(n) ? 0 : n;
}

/** Ordem do fluxo nas etapas Mega/Pacote (Regras Mega); outras etapas vão ao fim, A–Z. */
const ORDEM_ETAPAS_FLUXO = [
  'Retirada',
  'Preparo',
  'Escova',
  'Colocação',
] as const;

function chaveEtapa(s: string): string {
  return s.trim().toLowerCase();
}

function ordenarEtapasParaSelect(nomes: string[]): string[] {
  const ordem = new Map(
    ORDEM_ETAPAS_FLUXO.map((e, i) => [chaveEtapa(e), i]),
  );
  const visto = new Set<string>();
  const prioridade: { raw: string; idx: number }[] = [];
  const resto: string[] = [];
  for (const raw of nomes) {
    const t = raw.trim();
    if (!t || visto.has(t)) continue;
    visto.add(t);
    const i = ordem.get(chaveEtapa(t));
    if (i !== undefined) {
      prioridade.push({ raw: t, idx: i });
    } else {
      resto.push(t);
    }
  }
  prioridade.sort((a, b) => a.idx - b.idx);
  resto.sort((a, b) => a.localeCompare(b, 'pt-BR'));
  return [...prioridade.map((x) => x.raw), ...resto];
}

@Component({
  selector: 'app-agenda-novo',
  standalone: true,
  imports: [RouterLink, ReactiveFormsModule],
  templateUrl: './agenda-novo.component.html',
  styleUrl: './agenda-novo.component.scss',
})
export class AgendaNovoComponent implements OnInit, OnChanges, OnDestroy {
  private readonly api = inject(SheetsApiService);
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  /** Quando true, esconde navegação global do formulário (uso dentro de modal). */
  @Input() modoModal = false;
  /** Pré-preenche data, primeira linha de serviço e slot (hora local). */
  @Input() contextoSlot: {
    data: string;
    profissional_id: number;
    /** Vazio = abrir só com data (e opcionalmente profissional). */
    hora?: string;
  } | null = null;

  @Output() salvoComSucesso = new EventEmitter<void>();
  @Output() cancelarModal = new EventEmitter<void>();

  readonly tiposAtendimento: TipoAtendimento[] = [
    'Serviço',
    'Mega',
    'Pacote',
    'Cabelo',
    'Produto',
  ];

  readonly tamanhos = ['Curto', 'Médio', 'M/L', 'Longo'] as const;

  clientes: Cliente[] = [];
  servicos: Servico[] = [];
  servicosTipoServico: Servico[] = [];
  regrasMega: RegraMegaItem[] = [];
  pacotes: PacoteCatalogoItem[] = [];
  produtos: ProdutoCatalogoItem[] = [];
  cabelos: CabeloCatalogoItem[] = [];
  /** Linhas da Folha (`id` + nome) para selects e `profissional_id` na API. */
  profissionais: ProfissionalListaItem[] = [];

  carregandoListas = true;
  salvando = false;
  erro = '';

  /** Se definido, ao salvar remove o atendimento antigo antes de recriar as linhas. */
  idAtendimentoEmEdicao: string | null = null;
  private prefillEmCurso = false;

  /** Início/fim `YYYY-MM-DD HH:mm:ss` para a primeira linha criada (clique na grelha). */
  private slotAgenda: { inicio: string; fim: string } | null = null;

  private tipoSub?: Subscription;
  private slotFormSub?: Subscription;

  /** Seleção da calculadora Cabelos (aba planilha: Cor × Tamanho × Método → Valor base). */
  calcCabeloCor = '';
  calcCabeloTamanhoCm = '';
  calcCabeloMetodo = '';
  /** Peso medido na hora (g); preço = valor base × (gramas / 100). */
  calcCabeloGramas = '';

  readonly form = this.fb.group({
    tipo: this.fb.nonNullable.control<TipoAtendimento>('Serviço', [
      Validators.required,
    ]),
    cliente_id: ['', Validators.required],
    data: ['', Validators.required],
    profissional: [null as number | null],
    observacao: [''],
    pacote: [''],
    valor_cabelo: [''],
    detalhes_cabelo: [''],
    servicosItens: this.fb.array<FormGroup>([]),
    produtosItens: this.fb.array<FormGroup>([]),
    etapas: this.fb.array<FormGroup>([]),
    /** Horário inicial (tipo Serviço); fim é calculado a partir das durações na BD. */
    hora_inicial: [''],
  });

  ngOnInit(): void {
    const hoje = new Date();
    this.form.patchValue({
      data: this.toYmd(hoje),
    });

    forkJoin({
      clientes: this.api.listClientes(),
      servicos: this.api.listServicos(),
      regrasMega: this.api.listRegrasMega(),
      pacotes: this.api.listPacotes(),
      produtos: this.api.listProdutos(),
      cabelos: this.api.listCabelos(),
      profissionais: this.api.listProfissionais().pipe(
        catchError(() => of([] as ProfissionalListaItem[])),
      ),
    }).subscribe({
      next: (r) => {
        this.clientes = r.clientes.filter(
          (cl) => Boolean(cl.id?.trim() && cl.nome?.trim()),
        );
        this.servicos = r.servicos;
        this.servicosTipoServico = r.servicos
          .filter((s) => this.isTipoServicoLinha(s))
          .sort((a, b) =>
            this.rotuloServico(a).localeCompare(this.rotuloServico(b), 'pt-BR'),
          );
        this.regrasMega = r.regrasMega;
        this.pacotes = r.pacotes;
        this.produtos = r.produtos;
        this.cabelos = r.cabelos;
        this.profissionais = r.profissionais ?? [];
        this.ajustarArraysPorTipo();
        this.aplicarValidadoresPorTipo();

        if (this.modoModal) {
          this.aplicarContextoSlotInput();
          this.carregandoListas = false;
        } else {
          const qm = this.route.snapshot.queryParamMap;
          const atEdit = qm.get('atendimento')?.trim();
          if (atEdit) {
            this.idAtendimentoEmEdicao = atEdit;
            this.erro = '';
            this.api.listAgendamentos(undefined, undefined, atEdit).subscribe({
              next: (items) => {
                if (items.length > 0) {
                  this.aplicarEdicaoNoForm(items);
                } else {
                  this.idAtendimentoEmEdicao = null;
                  this.erro =
                    'Atendimento não encontrado ou sem linhas para este ID.';
                }
                this.carregandoListas = false;
              },
              error: () => {
                this.erro =
                  'Não foi possível carregar o atendimento para edição.';
                this.idAtendimentoEmEdicao = null;
                this.carregandoListas = false;
              },
            });
          } else {
            const cid = qm.get('cliente_id')?.trim();
            const dat = qm.get('data')?.trim();
            const pidStr = qm.get('profissional_id')?.trim();
            const hora = qm.get('hora')?.trim();
            if (cid) this.form.patchValue({ cliente_id: cid });
            if (dat && /^\d{4}-\d{2}-\d{2}$/.test(dat)) {
              this.form.patchValue({ data: dat });
            }
            const datOk =
              dat && /^\d{4}-\d{2}-\d{2}$/.test(dat) ? dat : '';
            if (datOk && pidStr && /^\d+$/.test(pidStr)) {
              const pid = parseInt(pidStr, 10);
              if (pid > 0) {
                this.prefillEmCurso = true;
                this.form.patchValue(
                  { data: datOk, tipo: 'Serviço' },
                  { emitEvent: false },
                );
                this.ajustarArraysPorTipo();
                this.aplicarValidadoresPorTipo();
                const g0 = this.servicosItensArray.at(0);
                if (g0) {
                  g0.patchValue({ profissional: pid }, { emitEvent: false });
                }
                const hn = normalizarHoraHHmm(hora ?? '');
                this.form.patchValue(
                  { hora_inicial: hn ?? '' },
                  { emitEvent: false },
                );
                this.prefillEmCurso = false;
              }
            }
            if (cid || dat || pidStr || hora) {
              void this.router.navigate(['/agenda/novo'], {
                replaceUrl: true,
                queryParams: {},
              });
            }
            this.aplicarContextoSlotInput();
            this.carregandoListas = false;
          }
        }
      },
      error: () => {
        this.erro =
          'Não foi possível carregar dados. Confira a API, a base de dados e o seed (pasta api).';
        this.carregandoListas = false;
      },
    });

    this.tipoSub = this.form.controls.tipo.valueChanges.subscribe(() => {
      if (this.prefillEmCurso) return;
      this.slotAgenda = null;
      this.erro = '';
      this.calcCabeloCor = '';
      this.calcCabeloTamanhoCm = '';
      this.calcCabeloMetodo = '';
      this.calcCabeloGramas = '';
      this.form.patchValue({
        pacote: '',
        valor_cabelo: '',
        detalhes_cabelo: '',
        profissional: null,
        hora_inicial: '',
      });
      this.ajustarArraysPorTipo();
      this.aplicarValidadoresPorTipo();
    });

    this.slotFormSub = this.form.valueChanges.subscribe(() => {
      if (this.prefillEmCurso) return;
      if (this.form.controls.tipo.value !== 'Serviço') return;
      this.slotAgenda = null;
    });
  }

  ngOnChanges(ch: SimpleChanges): void {
    if (!ch['contextoSlot'] && !ch['modoModal']) return;
    if (this.carregandoListas) return;
    this.aplicarContextoSlotInput();
  }

  ngOnDestroy(): void {
    this.tipoSub?.unsubscribe();
    this.slotFormSub?.unsubscribe();
  }

  get etapasArray(): FormArray<FormGroup> {
    return this.form.controls.etapas;
  }

  get servicosItensArray(): FormArray<FormGroup> {
    return this.form.controls.servicosItens;
  }

  get produtosItensArray(): FormArray<FormGroup> {
    return this.form.controls.produtosItens;
  }

  get tipoAtual(): TipoAtendimento {
    return this.form.controls.tipo.getRawValue();
  }

  /** Título da página/modal: edição vs criação. */
  tituloFormulario(): string {
    return this.idAtendimentoEmEdicao?.trim()
      ? 'Editar atendimento'
      : 'Novo atendimento';
  }

  /** `HH:mm` para `<input type="time">` a partir de `inicio` (SQL local ou ISO legado). */
  private horaInicialEdicaoDeInicio(
    inicio: string | null | undefined,
    dataYmd: string,
  ): string {
    const dia = dataYmd.trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return '';
    const raw = String(inicio ?? '').trim();
    if (!raw) return '';
    const p = parseSqlLocalDateTime(raw);
    if (p && ymdOfParts(p) === dia) {
      return normalizarHoraHHmm(`${p.hh}:${p.mm}`) ?? '';
    }
    const m = minutosMeiaNoiteEmBrasilia(raw, dia);
    if (m == null) return '';
    const hh = Math.floor(m / 60) % 24;
    const mm = Math.floor(m) % 60;
    return normalizarHoraHHmm(`${hh}:${mm}`) ?? '';
  }

  /** Primeira hora do dia (menor instante) entre linhas de serviço em edição. */
  private menorHoraInicialServicoEdicao(
    rows: AtendimentoListaItem[],
    dataYmd: string,
  ): string {
    const dia = dataYmd.slice(0, 10);
    let best: ReturnType<typeof parseSqlLocalDateTime> = null;
    let bestMs = Infinity;
    for (const row of rows) {
      const p = parseSqlLocalDateTime(String(row.inicio ?? '').trim());
      if (!p || ymdOfParts(p) !== dia) continue;
      const ms = civilNaiveSalaoParaUtcMs(p);
      if (Number.isFinite(ms) && ms < bestMs) {
        bestMs = ms;
        best = p;
      }
    }
    if (best) {
      return normalizarHoraHHmm(`${best.hh}:${best.mm}`) ?? '';
    }
    return this.horaInicialEdicaoDeInicio(rows[0]?.inicio, dataYmd);
  }

  /** Data do formulário em dd-mm-aaaa (valor interno continua AAAA-MM-DD). */
  dataExibicao(): string {
    const ymd = String(this.form.controls.data.value ?? '').trim();
    return dataDdMmAaaa(ymd);
  }

  /**
   * O texto visível fica por cima do `input type="date"`; com opacity 0 o clique
   * muitas vezes não abre o calendário. Abre via API (com fallback).
   */
  abrirPickerData(input: HTMLInputElement, ev?: Event): void {
    ev?.preventDefault();
    const el = input as HTMLInputElement & {
      showPicker?: () => Promise<void>;
    };
    if (typeof el.showPicker === 'function') {
      void Promise.resolve(el.showPicker()).catch(() => {
        input.focus();
        input.click();
      });
    } else {
      input.focus();
      input.click();
    }
  }

  /** Pacote escolhido (Mega ou Pacote comercial) para filtrar etapas em Regras Mega. */
  get pacoteSelecionado(): string {
    return String(this.form.controls.pacote.value ?? '').trim();
  }

  servicoPorId(id: string | null | undefined): Servico | undefined {
    const sid = String(id ?? '').trim();
    if (!sid) return undefined;
    return this.servicosTipoServico.find((s) => String(s.id) === sid);
  }

  /** Fixo não usa tamanho no payload; Tamanho (e legado Serviço) enviam tamanho. */
  precisaTamanhoServicoId(id: string | null | undefined): boolean {
    const s = this.servicoPorId(id);
    if (!s) return false;
    const t = String(s['Tipo'] ?? '').trim().toLowerCase();
    return t === 'tamanho' || t === 'serviço' || t === 'servico';
  }

  /** Sem nomes na Folha não dá para cumprir profissional obrigatório só com dropdown. */
  get profissionaisObrigatoriosSemLista(): boolean {
    if (this.profissionais.length > 0) return false;
    const t = this.tipoAtual;
    return (
      t === 'Serviço' ||
      t === 'Mega' ||
      t === 'Pacote' ||
      t === 'Cabelo'
    );
  }

  get pacotesMegaUnicos(): string[] {
    const set = new Set(
      this.regrasMega.map((r) => r.pacote.trim()).filter(Boolean),
    );
    return [...set].sort((a, b) => this.ordenarNomePacoteMecha(a, b));
  }

  /** Catálogo Pacote no select: 1/2 mecha antes de 1 mecha; depois 2, 5, 7… */
  get pacotesOrdenados(): PacoteCatalogoItem[] {
    return [...this.pacotes].sort((a, b) =>
      this.ordenarNomePacoteMecha(a.pacote, b.pacote),
    );
  }

  /**
   * Ordena nomes tipo "1/2 mecha", "1 mecha", "2 mechas": frações primeiro (menor valor),
   * depois inteiros crescentes, depois o resto alfabético.
   */
  private ordenarNomePacoteMecha(a: string, b: string): number {
    const ka = this.chaveOrdenacaoNomePacote(a);
    const kb = this.chaveOrdenacaoNomePacote(b);
    if (ka.grupo !== kb.grupo) return ka.grupo - kb.grupo;
    if (ka.sort !== kb.sort) return ka.sort < kb.sort ? -1 : ka.sort > kb.sort ? 1 : 0;
    return a.localeCompare(b, 'pt-BR');
  }

  private chaveOrdenacaoNomePacote(nome: string): { grupo: number; sort: number } {
    const s = nome.trim().toLowerCase();
    const frac = /^(\d+)\s*\/\s*(\d+)/.exec(s);
    if (frac) {
      const num = parseInt(frac[1], 10);
      const den = parseInt(frac[2], 10);
      const v = den > 0 ? num / den : num;
      return { grupo: 0, sort: v };
    }
    const intLead = /^(\d+)(?=\s|\.|,|$)/.exec(s);
    if (intLead) {
      return { grupo: 1, sort: parseInt(intLead[1], 10) };
    }
    return { grupo: 2, sort: 0 };
  }

  etapasParaPacoteSelecionado(pacote: string): string[] {
    const p = pacote.trim();
    if (!p) return [];
    const set = new Set(
      this.regrasMega
        .filter((r) => r.pacote.trim() === p)
        .map((r) => r.etapa.trim())
        .filter(Boolean),
    );
    return ordenarEtapasParaSelect([...set]);
  }

  /** Etapas para o select; em Pacote, se o nome não bater com Regras Mega, lista todas as etapas (lookup no servidor ainda exige par Pacote+Etapa). */
  etapasSelectOptions(): string[] {
    const direct = this.etapasParaPacoteSelecionado(this.pacoteSelecionado);
    if (direct.length > 0) return direct;
    if (this.tipoAtual === 'Pacote' && this.pacoteSelecionado) {
      const all = new Set(
        this.regrasMega.map((r) => r.etapa.trim()).filter(Boolean),
      );
      return ordenarEtapasParaSelect([...all]);
    }
    return [];
  }

  cabelosCoresLista(): string[] {
    const s = new Set<string>();
    for (const c of this.cabelos) {
      const x = String(c.cor ?? '').trim();
      if (x) s.add(x);
    }
    return [...s].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }

  cabelosTamanhosLista(): string[] {
    const cor = this.calcCabeloCor.trim();
    const s = new Set<string>();
    for (const c of this.cabelos) {
      if (cor && String(c.cor ?? '').trim() !== cor) continue;
      const x = String(c.tamanho_cm ?? '').trim();
      if (x) s.add(x);
    }
    return [...s].sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));
  }

  cabelosMetodosLista(): string[] {
    const cor = this.calcCabeloCor.trim();
    const tam = this.calcCabeloTamanhoCm.trim();
    const s = new Set<string>();
    for (const c of this.cabelos) {
      if (cor && String(c.cor ?? '').trim() !== cor) continue;
      if (tam && String(c.tamanho_cm ?? '').trim() !== tam) continue;
      const x = String(c.metodo ?? '').trim();
      if (x) s.add(x);
    }
    return [...s].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }

  onCalcCabeloCorChange(ev: Event): void {
    this.calcCabeloCor = (ev.target as HTMLSelectElement).value;
    this.calcCabeloTamanhoCm = '';
    this.calcCabeloMetodo = '';
  }

  onCalcCabeloTamanhoChange(ev: Event): void {
    this.calcCabeloTamanhoCm = (ev.target as HTMLSelectElement).value;
    this.calcCabeloMetodo = '';
  }

  onCalcCabeloMetodoChange(ev: Event): void {
    this.calcCabeloMetodo = (ev.target as HTMLSelectElement).value;
  }

  onCalcCabeloGramasInput(ev: Event): void {
    this.calcCabeloGramas = (ev.target as HTMLInputElement).value;
  }

  /** Gramas > 0 a partir do campo (aceita vírgula decimal). */
  private parseGramasCabelo(): number | null {
    const t = String(this.calcCabeloGramas ?? '')
      .trim()
      .replace(/\s/g, '')
      .replace(',', '.');
    if (!t) return null;
    const n = parseFloat(t);
    if (Number.isNaN(n) || n <= 0) return null;
    return n;
  }

  /**
   * Preço do atendimento: valor da tabela × (gramas / 100), 2 casas decimais.
   */
  private valorTotalCabeloCalculado(): number | null {
    const row = this.linhaCabeloCalculadora();
    if (!row) return null;
    const base = valorMonetarioParaNumero(row.valor_base);
    const g = this.parseGramasCabelo();
    if (base == null || base <= 0 || g == null) return null;
    return Math.round(base * (g / 100) * 100) / 100;
  }

  private linhaCabeloCalculadora(): CabeloCatalogoItem | undefined {
    const cor = this.calcCabeloCor.trim();
    const tam = this.calcCabeloTamanhoCm.trim();
    const met = this.calcCabeloMetodo.trim();
    if (!cor || !tam || !met) return undefined;
    const exato = (c: CabeloCatalogoItem) =>
      String(c.cor ?? '').trim() === cor &&
      String(c.tamanho_cm ?? '').trim() === tam &&
      String(c.metodo ?? '').trim() === met;
    let row = this.cabelos.find(exato);
    if (row) return row;
    const n = (s: string) => s.trim().toLowerCase();
    return this.cabelos.find(
      (c) =>
        n(String(c.cor ?? '')) === n(cor) &&
        n(String(c.tamanho_cm ?? '')) === n(tam) &&
        n(String(c.metodo ?? '')) === n(met),
    );
  }

  /** Pré-visualização do valor base da linha da tabela (quando há match). */
  valorCalculadoraCabeloPreview(): string | null {
    const row = this.linhaCabeloCalculadora();
    if (!row) return null;
    const num = valorMonetarioParaNumero(row.valor_base);
    if (num == null || num <= 0) return null;
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(num);
  }

  /** Total com fórmula base × (g/100), quando base e gramas são válidos. */
  valorCalculadoraCabeloTotalPreview(): string | null {
    const total = this.valorTotalCabeloCalculado();
    if (total == null) return null;
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(total);
  }

  aplicarValorCalculadoraCabelo(): void {
    const row = this.linhaCabeloCalculadora();
    if (!row) {
      this.erro =
        'Escolha Cor, Tamanho (cm) e Método que existam juntos na aba Cabelos.';
      return;
    }
    const base = valorMonetarioParaNumero(row.valor_base);
    if (base == null || base <= 0) {
      this.erro = 'O valor base desta linha na tabela Cabelos não é válido.';
      return;
    }
    const g = this.parseGramasCabelo();
    if (g == null) {
      this.erro =
        'Informe o peso em gramas medido na balança (número maior que zero).';
      return;
    }
    const total = this.valorTotalCabeloCalculado();
    if (total == null) {
      this.erro = 'Não foi possível calcular o valor. Confira peso e tabela.';
      return;
    }
    this.erro = '';
    const texto = total.toFixed(2).replace('.', ',');
    this.form.patchValue({ valor_cabelo: texto });
    this.form.controls.valor_cabelo.markAsTouched();
    this.form.controls.valor_cabelo.updateValueAndValidity();

    const gStr = String(this.calcCabeloGramas ?? '').trim();
    const linha = `Cor: ${this.calcCabeloCor.trim()}; ${this.calcCabeloTamanhoCm.trim()} cm; método: ${this.calcCabeloMetodo.trim()}; ${gStr} g`;
    const atual = String(this.form.controls.detalhes_cabelo.value ?? '').trim();
    if (!atual) {
      this.form.patchValue({ detalhes_cabelo: linha });
    }
  }

  resumoLinhas(): string {
    const t = this.tipoAtual;
    if (t === 'Mega') {
      const n = this.etapasArray.length;
      return `${n} linha(s) em Atendimentos (mesmo ID)`;
    }
    if (t === 'Pacote') {
      const n = 1 + this.etapasArray.length;
      return `${n} linha(s): 1 cobrança + ${this.etapasArray.length} etapa(s)`;
    }
    if (t === 'Serviço') {
      const n = this.servicosItensArray.length;
      return `${n} linha(s) em Atendimentos (um registo por serviço)`;
    }
    if (t === 'Produto') {
      const n = this.produtosItensArray.length;
      return `${n} linha(s) em Atendimentos (um registo por produto)`;
    }
    return '1 linha em Atendimentos';
  }

  adicionarProduto(): void {
    this.produtosItensArray.push(this.novoGrupoProduto());
    this.aplicarValidadoresPorTipo();
  }

  removerProduto(i: number): void {
    if (this.produtosItensArray.length <= 1) return;
    this.produtosItensArray.removeAt(i);
    this.aplicarValidadoresPorTipo();
  }

  adicionarServico(): void {
    this.servicosItensArray.push(this.novoGrupoServico());
    this.aplicarValidadoresPorTipo();
  }

  removerServico(i: number): void {
    if (this.servicosItensArray.length <= 1) return;
    this.servicosItensArray.removeAt(i);
    this.aplicarValidadoresPorTipo();
  }

  adicionarEtapa(): void {
    this.etapasArray.push(this.novoGrupoEtapa());
    this.aplicarValidadoresPorTipo();
  }

  removerEtapa(i: number): void {
    if (this.etapasArray.length <= 1) return;
    this.etapasArray.removeAt(i);
    this.aplicarValidadoresPorTipo();
  }

  salvar(): void {
    this.erro = '';
    this.form.markAllAsTouched();
    this.aplicarValidadoresPorTipo();

    if (!this.form.valid) {
      return;
    }

    const raw = this.form.getRawValue();
    const tipo = raw.tipo;
    if (!this.validarPorTipo(tipo, raw)) {
      return;
    }

    const payloads = this.montarPayloads(tipo, raw);
    if (payloads.length === 0) {
      this.erro =
        'Confira os campos obrigatórios (data válida, cliente, serviços, etc.).';
      return;
    }

    const editId = this.idAtendimentoEmEdicao?.trim();
    const criar$ = forkJoin(
      payloads.map((p) => this.api.createAgendamento(p)),
    );

    this.salvando = true;
    (editId
      ? this.api.excluirAtendimento(editId).pipe(switchMap(() => criar$))
      : criar$
    ).subscribe({
      next: () => {
        this.salvando = false;
        this.idAtendimentoEmEdicao = null;
        this.slotAgenda = null;
        if (this.modoModal) {
          this.salvoComSucesso.emit();
        } else {
          void this.router.navigate(['/agenda']);
        }
      },
      error: (e: Error) => {
        this.erro =
          e.message ||
          'Não foi possível salvar. Verifique a internet e tente de novo.';
        this.salvando = false;
      },
    });
  }

  rotuloServico(s: Servico): string {
    const nome = String(s['Serviço'] ?? '').trim();
    const tp = String(s['Tipo'] ?? '').trim();
    if (nome && tp) return `${nome} (${tp})`;
    return nome || tp || 'Serviço linha ' + s.id;
  }

  rotuloPacoteCatalogo(p: PacoteCatalogoItem): string {
    const precoRaw =
      p.preco != null && p.preco !== '' ? String(p.preco).trim() : '';
    if (!precoRaw) return String(p.pacote || '').trim();
    return `${p.pacote} — R$ ${precoRaw}`;
  }

  /** Mega: só o nome do pacote (quantidade de mechas), sem sufixo de moeda. */
  rotuloPacoteMegaOpcao(nomePacote: string): string {
    return String(nomePacote || '').trim();
  }

  /** ID Folha para o form a partir da linha da API (id gravado ou nome legado). */
  private profissionalValorForm(row: AtendimentoListaItem): number | null {
    const rid = row.profissional_id;
    if (rid != null && Number(rid) > 0) {
      const id = Number(rid);
      if (this.profissionais.some((p) => p.id === id)) return id;
    }
    const nome = (row.profissional || '').trim();
    if (!nome) return null;
    const hit = this.profissionais.find((p) => p.nome.trim() === nome);
    return hit ? hit.id : null;
  }

  private aplicarEdicaoNoForm(items: AtendimentoListaItem[]): void {
    if (!items.length) return;
    const sorted = [...items];
    ordenarLinhasAtendimentoInPlace(sorted);
    const l0 = sorted[0];
    const tipoApi = mapTipoFromApi(l0.tipo || '');
    const dataYmd = (l0.data || '').slice(0, 10);
    const obsMegaPacote = stripQtdSuffixObservacao(l0.descricao || '');

    this.prefillEmCurso = true;

    while (this.etapasArray.length) {
      this.etapasArray.removeAt(0);
    }
    while (this.servicosItensArray.length) {
      this.servicosItensArray.removeAt(0);
    }
    while (this.produtosItensArray.length) {
      this.produtosItensArray.removeAt(0);
    }

    if (tipoApi === 'Produto') {
      for (const row of sorted) {
        const q = parseQuantidadeFromDescricao(row.descricao || '');
        this.produtosItensArray.push(
          this.fb.group({
            produto: [row.produtoNome || '', Validators.required],
            quantidade: [
              q > 0 ? q : 1,
              [Validators.required, Validators.min(0.01)],
            ],
          }),
        );
      }
      if (this.produtosItensArray.length < 1) {
        this.produtosItensArray.push(this.novoGrupoProduto());
      }
      this.form.patchValue(
        {
          tipo: 'Produto',
          cliente_id: l0.idCliente || '',
          data: dataYmd,
          profissional: null,
          observacao: stripQtdSuffixObservacao(l0.descricao || ''),
          pacote: '',
          valor_cabelo: '',
          detalhes_cabelo: '',
        },
        { emitEvent: false },
      );
    } else if (tipoApi === 'Serviço') {
      for (const row of sorted) {
        const nomeServ = (row.servicosRef || '').trim();
        const sid = this.buscarServicoIdPorNomeColuna(nomeServ);
        this.servicosItensArray.push(
          this.fb.group({
            servico_id: [sid, Validators.required],
            tamanho: this.fb.nonNullable.control<string>(
              (row.tamanho || 'Curto').trim() || 'Curto',
            ),
            profissional: [
              this.profissionalValorForm(row),
              Validators.required,
            ],
          }),
        );
      }
      this.form.patchValue(
        {
          tipo: 'Serviço',
          cliente_id: l0.idCliente || '',
          data: dataYmd,
          hora_inicial: this.menorHoraInicialServicoEdicao(sorted, dataYmd),
          observacao: '',
          pacote: '',
          valor_cabelo: '',
          detalhes_cabelo: '',
        },
        { emitEvent: false },
      );
    } else if (tipoApi === 'Mega') {
      const comEtapaMega = sorted.filter((r) => (r.etapa || '').trim());
      for (const row of comEtapaMega) {
        this.etapasArray.push(
          this.fb.group({
            etapa: [row.etapa || '', Validators.required],
            profissional: [
              this.profissionalValorForm(row),
              Validators.required,
            ],
          }),
        );
      }
      if (this.etapasArray.length < 1) {
        this.etapasArray.push(this.novoGrupoEtapa());
      }
      this.form.patchValue(
        {
          tipo: 'Mega',
          cliente_id: l0.idCliente || '',
          data: dataYmd,
          pacote: l0.pacote || '',
          observacao: obsMegaPacote,
          valor_cabelo: '',
          detalhes_cabelo: '',
        },
        { emitEvent: false },
      );
    } else if (tipoApi === 'Pacote') {
      const comEtapa = sorted.filter((r) => (r.etapa || '').trim());
      for (const row of comEtapa) {
        this.etapasArray.push(
          this.fb.group({
            etapa: [row.etapa || '', Validators.required],
            profissional: [
              this.profissionalValorForm(row),
              Validators.required,
            ],
          }),
        );
      }
      if (this.etapasArray.length < 1) {
        this.etapasArray.push(this.novoGrupoEtapa());
      }
      this.form.patchValue(
        {
          tipo: 'Pacote',
          cliente_id: l0.idCliente || '',
          data: dataYmd,
          pacote: l0.pacote || '',
          profissional: null,
          observacao: obsMegaPacote,
          valor_cabelo: '',
          detalhes_cabelo: '',
        },
        { emitEvent: false },
      );
    } else if (tipoApi === 'Cabelo') {
      const row = sorted[0];
      this.form.patchValue(
        {
          tipo: 'Cabelo',
          cliente_id: row.idCliente || '',
          data: dataYmd,
          profissional: this.profissionalValorForm(row),
          valor_cabelo: this.valorCampoCabeloDeApi(row.valor),
          detalhes_cabelo: row.descricao || '',
          observacao: '',
          pacote: '',
        },
        { emitEvent: false },
      );
    }

    this.prefillEmCurso = false;
    this.ajustarArraysPorTipo();
    this.aplicarValidadoresPorTipo();
  }

  private buscarServicoIdPorNomeColuna(nome: string): string {
    const n = nome.trim().toLowerCase();
    if (!n) return '';
    const exato = this.servicosTipoServico.find(
      (s) => String(s['Serviço'] ?? '').trim().toLowerCase() === n,
    );
    if (exato) return String(exato.id);
    const parcial = this.servicosTipoServico.find((s) => {
      const sn = String(s['Serviço'] ?? '').trim().toLowerCase();
      return sn && (n.includes(sn) || sn.includes(n));
    });
    return parcial ? String(parcial.id) : '';
  }

  private valorCampoCabeloDeApi(v: unknown): string {
    const n = valorMonetarioParaNumero(v);
    if (n === null) return '';
    const s = String(n);
    return s.includes('.') ? s.replace('.', ',') : s;
  }

  private toYmd(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
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

  private novoGrupoEtapa(): FormGroup {
    return this.fb.group({
      etapa: ['', Validators.required],
      profissional: [null as number | null, Validators.required],
    });
  }

  private novoGrupoServico(): FormGroup {
    return this.fb.group({
      servico_id: ['', Validators.required],
      tamanho: this.fb.nonNullable.control<string>('Curto'),
      profissional: [null as number | null, Validators.required],
    });
  }

  private novoGrupoProduto(): FormGroup {
    return this.fb.group({
      produto: ['', Validators.required],
      quantidade: [1, [Validators.required, Validators.min(0.01)]],
    });
  }

  private ajustarArraysPorTipo(): void {
    const t = this.tipoAtual;
    if (t === 'Mega' || t === 'Pacote') {
      while (this.etapasArray.length < 1) {
        this.etapasArray.push(this.novoGrupoEtapa());
      }
    } else {
      while (this.etapasArray.length > 0) {
        this.etapasArray.removeAt(0);
      }
    }
    if (t === 'Serviço') {
      while (this.servicosItensArray.length < 1) {
        this.servicosItensArray.push(this.novoGrupoServico());
      }
    } else {
      while (this.servicosItensArray.length > 0) {
        this.servicosItensArray.removeAt(0);
      }
    }
    if (t === 'Produto') {
      while (this.produtosItensArray.length < 1) {
        this.produtosItensArray.push(this.novoGrupoProduto());
      }
    } else {
      while (this.produtosItensArray.length > 0) {
        this.produtosItensArray.removeAt(0);
      }
    }
  }

  private aplicarValidadoresPorTipo(): void {
    const t = this.tipoAtual;

    /** Só **Cabelo** usa o `profissional` raiz; Mega/Pacote usam profissional por **etapa** (comissão). */
    const profRoot = this.form.controls.profissional;
    if (t === 'Cabelo') {
      profRoot.enable({ emitEvent: false });
      profRoot.setValidators([Validators.required]);
    } else {
      profRoot.clearValidators();
      profRoot.reset(null, { emitEvent: false });
      profRoot.disable({ emitEvent: false });
    }

    this.form.controls.pacote.setValidators(
      t === 'Mega' || t === 'Pacote' ? [Validators.required] : [],
    );

    this.form.controls.valor_cabelo.setValidators(
      t === 'Cabelo'
        ? [Validators.required, valorCabeloPtValidator]
        : [],
    );

    for (let i = 0; i < this.servicosItensArray.length; i++) {
      const g = this.servicosItensArray.at(i);
      const sid = g.get('servico_id');
      const profLinha = g.get('profissional');
      const req = t === 'Serviço' ? [Validators.required] : [];
      sid?.setValidators(req);
      profLinha?.setValidators(req);
      sid?.updateValueAndValidity({ emitEvent: false });
      profLinha?.updateValueAndValidity({ emitEvent: false });
    }

    for (let i = 0; i < this.produtosItensArray.length; i++) {
      const g = this.produtosItensArray.at(i);
      const pr = g.get('produto');
      const qtd = g.get('quantidade');
      const req = t === 'Produto' ? [Validators.required] : [];
      const reqQ =
        t === 'Produto' ? [Validators.required, Validators.min(0.01)] : [];
      pr?.setValidators(req);
      qtd?.setValidators(reqQ);
      pr?.updateValueAndValidity({ emitEvent: false });
      qtd?.updateValueAndValidity({ emitEvent: false });
    }

    const horaIni = this.form.controls.hora_inicial;
    if (t === 'Serviço') {
      horaIni.setValidators([Validators.required]);
    } else {
      horaIni.clearValidators();
    }
    horaIni.updateValueAndValidity({ emitEvent: false });

    for (const k of ['profissional', 'pacote', 'valor_cabelo'] as const) {
      this.form.controls[k].updateValueAndValidity({ emitEvent: false });
    }
  }

  private validarPorTipo(
    tipo: TipoAtendimento,
    raw: Record<string, unknown>,
  ): boolean {
    if (!String(raw['cliente_id'] ?? '').trim()) return false;
    const dataYmd = normalizarDataIso(String(raw['data'] ?? ''));
    if (!dataYmd) return false;

    if (tipo === 'Serviço') {
      if (!normalizarHoraHHmm(String(raw['hora_inicial'] ?? ''))) return false;
      const itens = this.servicosItensArray.getRawValue() as {
        servico_id: string;
        tamanho: string;
        profissional: number | null;
      }[];
      if (itens.length < 1) return false;
      for (const it of itens) {
        if (!String(it.servico_id ?? '').trim()) return false;
        if (it.profissional == null || !(Number(it.profissional) > 0)) {
          return false;
        }
      }
      return true;
    }
    if (tipo === 'Mega') {
      if (!String(raw['pacote'] ?? '').trim()) return false;
      return this.etapasValidas();
    }
    if (tipo === 'Pacote') {
      if (!String(raw['pacote'] ?? '').trim()) return false;
      return this.etapasValidas();
    }
    if (tipo === 'Produto') {
      const itens = this.produtosItensArray.getRawValue() as {
        produto: string;
        quantidade: number;
      }[];
      if (itens.length < 1) return false;
      for (const it of itens) {
        if (!String(it.produto ?? '').trim()) return false;
        const q = Number(it.quantidade);
        if (Number.isNaN(q) || q <= 0) return false;
      }
      return true;
    }
    if (tipo === 'Cabelo') {
      const pid = raw['profissional'];
      if (pid == null || pid === '' || !(Number(pid) > 0)) return false;
      const v = this.parseValorPt(String(raw['valor_cabelo'] ?? ''));
      return v != null && v > 0;
    }
    return false;
  }

  private etapasValidas(): boolean {
    for (let i = 0; i < this.etapasArray.length; i++) {
      const g = this.etapasArray.at(i);
      const e = String(g.get('etapa')?.value ?? '').trim();
      const p = g.get('profissional')?.value;
      if (!e || p == null || !(Number(p) > 0)) return false;
    }
    return this.etapasArray.length >= 1;
  }

  private aplicarContextoSlotInput(): void {
    const c = this.contextoSlot;
    if (!c?.data || !/^\d{4}-\d{2}-\d{2}$/.test(c.data.trim().slice(0, 10))) {
      return;
    }
    const dataOk = c.data.trim().slice(0, 10);
    this.prefillEmCurso = true;
    this.form.patchValue(
      { data: dataOk, tipo: 'Serviço' },
      { emitEvent: false },
    );
    this.ajustarArraysPorTipo();
    this.aplicarValidadoresPorTipo();
    const g0 = this.servicosItensArray.at(0);
    if (g0 && c.profissional_id > 0) {
      g0.patchValue({ profissional: c.profissional_id }, { emitEvent: false });
    }
    const horaBruta = String(c.hora ?? '').trim();
    const hn = normalizarHoraHHmm(horaBruta);
    this.form.patchValue(
      { hora_inicial: hn ?? '' },
      { emitEvent: false },
    );
    this.prefillEmCurso = false;
    this.slotAgenda = null;
  }

  /** Exibe o fim previsto (HH:mm em Brasília no dia da data) para tipo Serviço. */
  horarioFinalExibicao(): string {
    if (this.form.controls.tipo.value !== 'Serviço') return '—';
    const dataYmd = normalizarDataIso(
      String(this.form.controls.data.value ?? ''),
    );
    const hi = normalizarHoraHHmm(
      String(this.form.controls.hora_inicial.value ?? ''),
    );
    if (!dataYmd || !hi) return '—';
    const totalMin = this.duracaoTotalServicosSelecionados();
    const anchor = slotInicioFimBrasilia(dataYmd, hi, 30);
    if (!anchor) return '—';
    const cur = parseSqlLocalDateTime(anchor.inicio);
    if (!cur) return '—';
    const end = addMinutesToParts(cur, totalMin);
    return `${String(end.hh).padStart(2, '0')}:${String(end.mm).padStart(2, '0')}`;
  }

  private duracaoTotalServicosSelecionados(): number {
    if (this.form.controls.tipo.value !== 'Serviço') return 0;
    const itens = this.servicosItensArray.getRawValue() as { servico_id: string }[];
    let sum = 0;
    for (const it of itens) {
      const sid = String(it.servico_id ?? '').trim();
      if (!sid) continue;
      sum += this.duracaoMinutosDoServico(this.servicoPorId(sid));
    }
    return Math.max(15, sum || 15);
  }

  private duracaoMinutosDoServico(s: Servico | undefined): number {
    if (!s) return 30;
    const raw =
      s['duracao_minutos'] ??
      s['Duração Minutos'] ??
      s['Duracao Minutos'] ??
      s['duracaoMinutos'];
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 5 && n <= 24 * 60) return Math.round(n);
    return 30;
  }

  private slotsSequenciaisParaPayloadServico(
    dataYmd: string,
    horaIniBruto: string,
    preparados: { servico_id: string }[],
  ): ({ inicio: string; fim: string } | null)[] {
    const hi = normalizarHoraHHmm(horaIniBruto);
    if (!hi || !/^\d{4}-\d{2}-\d{2}$/.test(dataYmd)) {
      return preparados.map(() => null);
    }
    const anchor = slotInicioFimBrasilia(dataYmd, hi, 30);
    let cur = anchor ? parseSqlLocalDateTime(anchor.inicio) : null;
    if (!cur) return preparados.map(() => null);
    return preparados.map((pr) => {
      const svc = this.servicoPorId(pr.servico_id);
      const d = this.duracaoMinutosDoServico(svc);
      const ini = formatSqlLocalDateTime(cur!);
      const next = addMinutesToParts(cur!, d);
      const fim = formatSqlLocalDateTime(next);
      cur = next;
      return { inicio: ini, fim };
    });
  }

  private mergeSlot(
    p: CreateAtendimentoPayload,
    usar: boolean,
  ): CreateAtendimentoPayload {
    if (!usar || !this.slotAgenda) return p;
    return {
      ...p,
      inicio: this.slotAgenda.inicio,
      fim: this.slotAgenda.fim,
    };
  }

  private montarPayloads(
    tipo: TipoAtendimento,
    raw: Record<string, unknown>,
  ): CreateAtendimentoPayload[] {
    const cliente_id = String(raw['cliente_id'] ?? '').trim();
    const dataYmd = normalizarDataIso(String(raw['data'] ?? ''));
    if (!dataYmd) return [];
    const observacao = String(raw['observacao'] ?? '').trim() || undefined;

    if (tipo === 'Serviço') {
      const itens = this.servicosItensArray.getRawValue() as {
        servico_id: string;
        tamanho: string;
        profissional: number | null;
      }[];
      const horaIni = String(raw['hora_inicial'] ?? '');
      const preparados: {
        servico_id: string;
        profissional_id: number;
        st: string;
        base: {
          tipo: 'Serviço';
          cliente_id: string;
          data: string;
          profissional_id: number;
          servico_id: string;
          observacao?: string;
        };
        tamanho?: string;
      }[] = [];
      for (const it of itens) {
        const servico_id = String(it.servico_id ?? '').trim();
        if (!servico_id) continue;
        const profissional_id = Number(it.profissional);
        if (!(profissional_id > 0)) continue;
        const svc = this.servicoPorId(servico_id);
        const base = {
          tipo: 'Serviço' as const,
          cliente_id,
          data: dataYmd,
          profissional_id,
          servico_id,
          observacao,
        };
        const st = String(svc?.['Tipo'] ?? '').toLowerCase();
        preparados.push({
          servico_id,
          profissional_id,
          st,
          base,
          tamanho: String(it.tamanho ?? 'Curto').trim(),
        });
      }
      const slotPairs = this.slotsSequenciaisParaPayloadServico(
        dataYmd,
        horaIni,
        preparados,
      );
      const out: CreateAtendimentoPayload[] = [];
      for (let i = 0; i < preparados.length; i++) {
        const pr = preparados[i];
        const sp = slotPairs[i];
        const slotPatch =
          sp != null ? { inicio: sp.inicio, fim: sp.fim } : {};
        if (pr.st === 'fixo') {
          out.push({ ...pr.base, ...slotPatch });
        } else {
          out.push({
            ...pr.base,
            tamanho: pr.tamanho ?? 'Curto',
            ...slotPatch,
          });
        }
      }
      return out;
    }
    if (tipo === 'Mega') {
      const pacote = String(raw['pacote'] ?? '').trim();
      const etapas = this.etapasArray.getRawValue() as {
        etapa: string;
        profissional: number | null;
      }[];
      return [
        this.mergeSlot(
          {
            tipo: 'Mega',
            cliente_id,
            data: dataYmd,
            pacote,
            etapas: etapas.map((x) => ({
              etapa: x.etapa.trim(),
              profissional_id: Number(x.profissional),
            })),
            observacao,
          },
          true,
        ),
      ];
    }
    if (tipo === 'Pacote') {
      const pacote = String(raw['pacote'] ?? '').trim();
      const etapas = this.etapasArray.getRawValue() as {
        etapa: string;
        profissional: number | null;
      }[];
      const cob = raw['profissional'];
      const cobId =
        cob != null && cob !== '' && Number(cob) > 0 ? Number(cob) : undefined;
      return [
        this.mergeSlot(
          {
            tipo: 'Pacote',
            cliente_id,
            data: dataYmd,
            ...(cobId != null ? { profissional_id: cobId } : {}),
            pacote,
            etapas: etapas.map((x) => ({
              etapa: x.etapa.trim(),
              profissional_id: Number(x.profissional),
            })),
            observacao,
          },
          true,
        ),
      ];
    }
    if (tipo === 'Produto') {
      const itens = this.produtosItensArray.getRawValue() as {
        produto: string;
        quantidade: number;
      }[];
      const out: CreateAtendimentoPayload[] = [];
      for (const it of itens) {
        const nome = String(it.produto ?? '').trim();
        if (!nome) continue;
        const q = Number(it.quantidade);
        if (Number.isNaN(q) || q <= 0) continue;
        out.push(
          this.mergeSlot(
            {
              tipo: 'Produto',
              cliente_id,
              data: dataYmd,
              produto: nome,
              quantidade: q,
              observacao,
            },
            out.length === 0,
          ),
        );
      }
      return out;
    }
    if (tipo === 'Cabelo') {
      const v = this.parseValorPt(String(raw['valor_cabelo'] ?? ''));
      if (v == null) return [];
      const det = String(raw['detalhes_cabelo'] ?? '').trim();
      return [
        this.mergeSlot(
          {
            tipo: 'Cabelo',
            cliente_id,
            data: dataYmd,
            profissional_id: Number(raw['profissional']),
            valor: v,
            observacao,
            detalhes_cabelo: det || undefined,
          },
          true,
        ),
      ];
    }
    return [];
  }

  private parseValorPt(s: string): number | null {
    const t = s.trim().replace(/\s/g, '').replace(',', '.');
    if (!t) return null;
    const n = parseFloat(t);
    return Number.isNaN(n) ? null : n;
  }
}
