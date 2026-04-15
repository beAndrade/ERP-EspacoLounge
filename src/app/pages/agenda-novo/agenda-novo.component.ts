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
  TipoLinhaAtendimento,
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

  readonly tiposLinhaAtendimento: TipoLinhaAtendimento[] = [
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
  /** Lista de profissionais (`id` + nome) para selects e `profissional_id` na API. */
  profissionais: ProfissionalListaItem[] = [];

  carregandoListas = true;
  salvando = false;
  erro = '';

  /** Se definido, ao salvar remove o atendimento antigo antes de recriar as linhas. */
  idAtendimentoEmEdicao: string | null = null;
  private prefillEmCurso = false;

  /** Início/fim `YYYY-MM-DD HH:mm:ss` para a primeira linha criada (clique na grelha). */
  private slotAgenda: { inicio: string; fim: string } | null = null;

  private slotFormSub?: Subscription;

  readonly form = this.fb.group({
    cliente_id: ['', Validators.required],
    data: ['', Validators.required],
    observacao: [''],
    /** Horário inicial para linhas de Serviço (catálogo); sequência na ordem das linhas. */
    hora_inicial: [''],
    /** Cada linha: tipo + campos específicos (Serviço, Mega, Pacote, Cabelo, Produto). */
    linhasItens: this.fb.array<FormGroup>([]),
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
        this.garantirMinUmaLinha();
        this.aplicarValidadoresLinhas();

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
                this.form.patchValue({ data: datOk }, { emitEvent: false });
                this.garantirMinUmaLinha();
                this.aplicarValidadoresLinhas();
                const g0 = this.linhasItensArray.at(0);
                if (g0) {
                  g0.patchValue(
                    {
                      itemTipo: 'Serviço',
                      profissional: pid,
                    },
                    { emitEvent: false },
                  );
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

    this.slotFormSub = this.form.valueChanges.subscribe(() => {
      if (this.prefillEmCurso) return;
      this.slotAgenda = null;
    });
  }

  ngOnChanges(ch: SimpleChanges): void {
    if (!ch['contextoSlot'] && !ch['modoModal']) return;
    if (this.carregandoListas) return;
    this.aplicarContextoSlotInput();
  }

  ngOnDestroy(): void {
    this.slotFormSub?.unsubscribe();
  }

  get linhasItensArray(): FormArray<FormGroup> {
    return this.form.controls.linhasItens;
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
  etapasArrayDaLinha(i: number): FormArray<FormGroup> {
    const g = this.linhasItensArray.at(i);
    return g?.get('etapas') as FormArray<FormGroup>;
  }

  /** Pacote escolhido na linha `i` (Mega / Pacote). */
  pacoteDaLinha(i: number): string {
    const g = this.linhasItensArray.at(i);
    return String(g?.get('pacote')?.value ?? '').trim();
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

  /** Sem profissionais na lista não dá para cumprir profissional obrigatório só com dropdown. */
  get profissionaisObrigatoriosSemLista(): boolean {
    if (this.profissionais.length > 0) return false;
    for (let i = 0; i < this.linhasItensArray.length; i++) {
      const g = this.linhasItensArray.at(i);
      const it = String(g.get('itemTipo')?.value ?? '') as TipoLinhaAtendimento;
      if (it === 'Serviço' || it === 'Cabelo') return true;
      if (it === 'Mega' || it === 'Pacote') {
        const et = this.etapasArrayDaLinha(i);
        if (et.length > 0) return true;
      }
    }
    return false;
  }

  temLinhaServicoCatalogo(): boolean {
    return this.linhasItensArray.controls.some(
      (c) => c.get('itemTipo')?.value === 'Serviço',
    );
  }

  /** Bloqueia salvar se alguma linha precisar de catálogo vazio. */
  salvarBloqueadoPorCatalogo(): boolean {
    for (let i = 0; i < this.linhasItensArray.length; i++) {
      const it = String(
        this.linhasItensArray.at(i)?.get('itemTipo')?.value ?? '',
      ) as TipoLinhaAtendimento;
      if (it === 'Serviço' && this.servicosTipoServico.length === 0) return true;
      if (it === 'Produto' && this.produtos.length === 0) return true;
      if (it === 'Pacote' && this.pacotes.length === 0) return true;
      if (it === 'Mega' && this.pacotesMegaUnicos.length === 0) return true;
    }
    return false;
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

  /** Etapas para o select da linha `i` (Mega / Pacote). */
  etapasSelectOptionsLinha(i: number): string[] {
    const g = this.linhasItensArray.at(i);
    const itemTipo = String(g?.get('itemTipo')?.value ?? '') as TipoLinhaAtendimento;
    const pacote = this.pacoteDaLinha(i);
    const direct = this.etapasParaPacoteSelecionado(pacote);
    if (direct.length > 0) return direct;
    if (itemTipo === 'Pacote' && pacote) {
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

  cabelosTamanhosListaLinha(i: number): string[] {
    const cor = String(
      this.linhasItensArray.at(i)?.get('calc_cor')?.value ?? '',
    ).trim();
    const s = new Set<string>();
    for (const c of this.cabelos) {
      if (cor && String(c.cor ?? '').trim() !== cor) continue;
      const x = String(c.tamanho_cm ?? '').trim();
      if (x) s.add(x);
    }
    return [...s].sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));
  }

  cabelosMetodosListaLinha(i: number): string[] {
    const cor = String(
      this.linhasItensArray.at(i)?.get('calc_cor')?.value ?? '',
    ).trim();
    const tam = String(
      this.linhasItensArray.at(i)?.get('calc_tam_cm')?.value ?? '',
    ).trim();
    const s = new Set<string>();
    for (const c of this.cabelos) {
      if (cor && String(c.cor ?? '').trim() !== cor) continue;
      if (tam && String(c.tamanho_cm ?? '').trim() !== tam) continue;
      const x = String(c.metodo ?? '').trim();
      if (x) s.add(x);
    }
    return [...s].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }

  onCalcCabeloCorChangeLinha(i: number): void {
    this.linhasItensArray.at(i)?.patchValue(
      { calc_tam_cm: '', calc_metodo: '', calc_gramas: '' },
      { emitEvent: false },
    );
  }

  onCalcCabeloTamanhoChangeLinha(i: number): void {
    this.linhasItensArray
      .at(i)
      ?.patchValue({ calc_metodo: '', calc_gramas: '' }, { emitEvent: false });
  }

  onCalcCabeloMetodoChangeLinha(i: number): void {
    this.linhasItensArray.at(i)?.patchValue({ calc_gramas: '' }, {
      emitEvent: false,
    });
  }

  onCalcCabeloGramasInputLinha(i: number, ev: Event): void {
    const v = (ev.target as HTMLInputElement).value;
    this.linhasItensArray.at(i)?.patchValue({ calc_gramas: v }, { emitEvent: false });
  }

  private parseGramasCabeloLinha(i: number): number | null {
    const t = String(
      this.linhasItensArray.at(i)?.get('calc_gramas')?.value ?? '',
    )
      .trim()
      .replace(/\s/g, '')
      .replace(',', '.');
    if (!t) return null;
    const n = parseFloat(t);
    if (Number.isNaN(n) || n <= 0) return null;
    return n;
  }

  private linhaCabeloCalculadoraEm(i: number): CabeloCatalogoItem | undefined {
    const g = this.linhasItensArray.at(i);
    if (!g) return undefined;
    const cor = String(g.get('calc_cor')?.value ?? '').trim();
    const tam = String(g.get('calc_tam_cm')?.value ?? '').trim();
    const met = String(g.get('calc_metodo')?.value ?? '').trim();
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

  private valorTotalCabeloCalculadoLinha(i: number): number | null {
    const row = this.linhaCabeloCalculadoraEm(i);
    if (!row) return null;
    const base = valorMonetarioParaNumero(row.valor_base);
    const g = this.parseGramasCabeloLinha(i);
    if (base == null || base <= 0 || g == null) return null;
    return Math.round(base * (g / 100) * 100) / 100;
  }

  valorCalculadoraCabeloPreviewLinha(i: number): string | null {
    const row = this.linhaCabeloCalculadoraEm(i);
    if (!row) return null;
    const num = valorMonetarioParaNumero(row.valor_base);
    if (num == null || num <= 0) return null;
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(num);
  }

  valorCalculadoraCabeloTotalPreviewLinha(i: number): string | null {
    const total = this.valorTotalCabeloCalculadoLinha(i);
    if (total == null) return null;
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(total);
  }

  aplicarValorCalculadoraCabeloLinha(i: number): void {
    const row = this.linhaCabeloCalculadoraEm(i);
    const g = this.linhasItensArray.at(i);
    if (!row || !g) {
      this.erro =
        'Escolha Cor, Tamanho (cm) e Método que existam juntos na aba Cabelos.';
      return;
    }
    const base = valorMonetarioParaNumero(row.valor_base);
    if (base == null || base <= 0) {
      this.erro = 'O valor base desta linha na tabela Cabelos não é válido.';
      return;
    }
    if (this.parseGramasCabeloLinha(i) == null) {
      this.erro =
        'Informe o peso em gramas medido na balança (número maior que zero).';
      return;
    }
    const total = this.valorTotalCabeloCalculadoLinha(i);
    if (total == null) {
      this.erro = 'Não foi possível calcular o valor. Confira peso e tabela.';
      return;
    }
    this.erro = '';
    const texto = total.toFixed(2).replace('.', ',');
    g.patchValue({ valor_cabelo: texto });
    g.get('valor_cabelo')?.markAsTouched();
    g.get('valor_cabelo')?.updateValueAndValidity({ emitEvent: false });

    const gStr = String(g.get('calc_gramas')?.value ?? '').trim();
    const cor = String(g.get('calc_cor')?.value ?? '').trim();
    const tam = String(g.get('calc_tam_cm')?.value ?? '').trim();
    const met = String(g.get('calc_metodo')?.value ?? '').trim();
    const linha = `Cor: ${cor}; ${tam} cm; método: ${met}; ${gStr} g`;
    const atual = String(g.get('detalhes_cabelo')?.value ?? '').trim();
    if (!atual) {
      g.patchValue({ detalhes_cabelo: linha });
    }
  }

  resumoLinhas(): string {
    const n = this.linhasItensArray.length;
    return `${n} linha(s) no pedido — cada linha tem um tipo (Serviço, Mega, Pacote, Cabelo ou Produto).`;
  }

  adicionarLinhaItens(): void {
    this.linhasItensArray.push(this.novoGrupoLinhaItem('Serviço'));
    this.aplicarValidadoresLinhas();
  }

  removerLinhaItens(i: number): void {
    if (this.linhasItensArray.length <= 1) return;
    this.linhasItensArray.removeAt(i);
    this.aplicarValidadoresLinhas();
  }

  /** Ao mudar o tipo da linha, ajusta sub-formulários (ex.: etapas Mega/Pacote). */
  onItemTipoLinhaChange(i: number): void {
    const g = this.linhasItensArray.at(i);
    if (!g) return;
    const t = String(g.get('itemTipo')?.value ?? '') as TipoLinhaAtendimento;
    const etapas = g.get('etapas') as FormArray<FormGroup>;
    while (etapas.length) etapas.removeAt(0);
    if (t === 'Mega' || t === 'Pacote') {
      etapas.push(this.novoGrupoEtapa());
    }
    this.slotAgenda = null;
    this.aplicarValidadoresLinhas();
  }

  adicionarEtapaNaLinha(i: number): void {
    this.etapasArrayDaLinha(i).push(this.novoGrupoEtapa());
    this.aplicarValidadoresLinhas();
  }

  removerEtapaNaLinha(i: number, j: number): void {
    const et = this.etapasArrayDaLinha(i);
    if (et.length <= 1) return;
    et.removeAt(j);
    this.aplicarValidadoresLinhas();
  }

  salvar(): void {
    this.erro = '';
    this.form.markAllAsTouched();
    this.aplicarValidadoresLinhas();

    if (!this.form.valid) {
      return;
    }

    const raw = this.form.getRawValue();
    if (!this.validarLinhas(raw)) {
      return;
    }

    const payloads = this.montarPayloadsDasLinhas(raw);
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

    while (this.linhasItensArray.length) {
      this.linhasItensArray.removeAt(0);
    }

    const tiposLinha = sorted.map((r) => mapTipoFromApi(r.tipo || ''));
    const edicaoServicoEProduto =
      tiposLinha.some((x) => x === 'Serviço') &&
      tiposLinha.some((x) => x === 'Produto');

    if (edicaoServicoEProduto) {
      for (const row of sorted) {
        const ta = mapTipoFromApi(row.tipo || '');
        if (ta === 'Serviço') {
          const nomeServ = (row.servicosRef || '').trim();
          const sid = this.buscarServicoIdPorNomeColuna(nomeServ);
          const g = this.novoGrupoLinhaItem('Serviço');
          g.patchValue(
            {
              servico_id: sid,
              tamanho: (row.tamanho || 'Curto').trim() || 'Curto',
              profissional: this.profissionalValorForm(row),
            },
            { emitEvent: false },
          );
          this.linhasItensArray.push(g);
        } else if (ta === 'Produto') {
          const q = parseQuantidadeFromDescricao(row.descricao || '');
          const g = this.novoGrupoLinhaItem('Produto');
          g.patchValue(
            {
              produto: row.produtoNome || '',
              quantidade: q > 0 ? q : 1,
            },
            { emitEvent: false },
          );
          this.linhasItensArray.push(g);
        }
      }
      this.garantirMinUmaLinha();
      const servRowsOnly = sorted.filter(
        (r) => mapTipoFromApi(r.tipo || '') === 'Serviço',
      );
      this.form.patchValue(
        {
          cliente_id: l0.idCliente || '',
          data: dataYmd,
          hora_inicial:
            servRowsOnly.length > 0
              ? this.menorHoraInicialServicoEdicao(servRowsOnly, dataYmd)
              : '',
          observacao: '',
        },
        { emitEvent: false },
      );
      this.prefillEmCurso = false;
      this.aplicarValidadoresLinhas();
      return;
    }

    if (tipoApi === 'Produto') {
      for (const row of sorted) {
        const q = parseQuantidadeFromDescricao(row.descricao || '');
        const g = this.novoGrupoLinhaItem('Produto');
        g.patchValue(
          {
            produto: row.produtoNome || '',
            quantidade: q > 0 ? q : 1,
          },
          { emitEvent: false },
        );
        this.linhasItensArray.push(g);
      }
      this.garantirMinUmaLinha();
      this.form.patchValue(
        {
          cliente_id: l0.idCliente || '',
          data: dataYmd,
          observacao: stripQtdSuffixObservacao(l0.descricao || ''),
          hora_inicial: '',
        },
        { emitEvent: false },
      );
    } else if (tipoApi === 'Serviço') {
      for (const row of sorted) {
        const nomeServ = (row.servicosRef || '').trim();
        const sid = this.buscarServicoIdPorNomeColuna(nomeServ);
        const g = this.novoGrupoLinhaItem('Serviço');
        g.patchValue(
          {
            servico_id: sid,
            tamanho: (row.tamanho || 'Curto').trim() || 'Curto',
            profissional: this.profissionalValorForm(row),
          },
          { emitEvent: false },
        );
        this.linhasItensArray.push(g);
      }
      this.garantirMinUmaLinha();
      this.form.patchValue(
        {
          cliente_id: l0.idCliente || '',
          data: dataYmd,
          hora_inicial: this.menorHoraInicialServicoEdicao(sorted, dataYmd),
          observacao: '',
        },
        { emitEvent: false },
      );
    } else if (tipoApi === 'Mega') {
      const g = this.novoGrupoLinhaItem('Mega');
      g.patchValue({ pacote: l0.pacote || '' }, { emitEvent: false });
      const et = g.get('etapas') as FormArray<FormGroup>;
      while (et.length) {
        et.removeAt(0);
      }
      const comEtapaMega = sorted.filter((r) => (r.etapa || '').trim());
      for (const row of comEtapaMega) {
        et.push(
          this.fb.group({
            etapa: [row.etapa || '', Validators.required],
            profissional: [
              this.profissionalValorForm(row),
              Validators.required,
            ],
          }),
        );
      }
      if (et.length < 1) {
        et.push(this.novoGrupoEtapa());
      }
      this.linhasItensArray.push(g);
      this.form.patchValue(
        {
          cliente_id: l0.idCliente || '',
          data: dataYmd,
          observacao: obsMegaPacote,
          hora_inicial: '',
        },
        { emitEvent: false },
      );
    } else if (tipoApi === 'Pacote') {
      const g = this.novoGrupoLinhaItem('Pacote');
      g.patchValue({ pacote: l0.pacote || '' }, { emitEvent: false });
      const et = g.get('etapas') as FormArray<FormGroup>;
      while (et.length) {
        et.removeAt(0);
      }
      const comEtapa = sorted.filter((r) => (r.etapa || '').trim());
      for (const row of comEtapa) {
        et.push(
          this.fb.group({
            etapa: [row.etapa || '', Validators.required],
            profissional: [
              this.profissionalValorForm(row),
              Validators.required,
            ],
          }),
        );
      }
      if (et.length < 1) {
        et.push(this.novoGrupoEtapa());
      }
      this.linhasItensArray.push(g);
      this.form.patchValue(
        {
          cliente_id: l0.idCliente || '',
          data: dataYmd,
          observacao: obsMegaPacote,
          hora_inicial: '',
        },
        { emitEvent: false },
      );
    } else if (tipoApi === 'Cabelo') {
      const row = sorted[0];
      const g = this.novoGrupoLinhaItem('Cabelo');
      g.patchValue(
        {
          profissional_cabelo: this.profissionalValorForm(row),
          valor_cabelo: this.valorCampoCabeloDeApi(row.valor),
          detalhes_cabelo: row.descricao || '',
        },
        { emitEvent: false },
      );
      this.linhasItensArray.push(g);
      this.form.patchValue(
        {
          cliente_id: row.idCliente || '',
          data: dataYmd,
          observacao: '',
          hora_inicial: '',
        },
        { emitEvent: false },
      );
    }

    this.prefillEmCurso = false;
    this.garantirMinUmaLinha();
    this.aplicarValidadoresLinhas();
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

  private novoGrupoLinhaItem(
    itemTipo: TipoLinhaAtendimento = 'Serviço',
  ): FormGroup {
    const g = this.fb.group({
      itemTipo: this.fb.nonNullable.control<TipoLinhaAtendimento>(itemTipo),
      servico_id: [''],
      tamanho: this.fb.nonNullable.control<string>('Curto'),
      profissional: [null as number | null],
      produto: [''],
      quantidade: [1, [Validators.min(0.01)]],
      pacote: [''],
      etapas: this.fb.array<FormGroup>([]),
      valor_cabelo: [''],
      detalhes_cabelo: [''],
      profissional_cabelo: [null as number | null],
      calc_cor: [''],
      calc_tam_cm: [''],
      calc_metodo: [''],
      calc_gramas: [''],
    });
    if (itemTipo === 'Mega' || itemTipo === 'Pacote') {
      (g.get('etapas') as FormArray<FormGroup>).push(this.novoGrupoEtapa());
    }
    return g;
  }

  private garantirMinUmaLinha(): void {
    while (this.linhasItensArray.length < 1) {
      this.linhasItensArray.push(this.novoGrupoLinhaItem('Serviço'));
    }
  }

  aplicarValidadoresLinhas(): void {
    const precisaHora = this.temLinhaServicoCatalogo();
    const horaIni = this.form.controls.hora_inicial;
    if (precisaHora) {
      horaIni.setValidators([Validators.required]);
    } else {
      horaIni.clearValidators();
    }
    horaIni.updateValueAndValidity({ emitEvent: false });

    for (let i = 0; i < this.linhasItensArray.length; i++) {
      const g = this.linhasItensArray.at(i);
      const tipo = String(
        g.get('itemTipo')?.value ?? '',
      ) as TipoLinhaAtendimento;
      const sid = g.get('servico_id');
      const profS = g.get('profissional');
      const prod = g.get('produto');
      const qtd = g.get('quantidade');
      const pac = g.get('pacote');
      const valC = g.get('valor_cabelo');
      const profC = g.get('profissional_cabelo');

      sid?.clearValidators();
      profS?.clearValidators();
      prod?.clearValidators();
      qtd?.clearValidators();
      pac?.clearValidators();
      valC?.clearValidators();
      profC?.clearValidators();

      if (tipo === 'Serviço') {
        sid?.setValidators([Validators.required]);
        profS?.setValidators([Validators.required]);
      } else if (tipo === 'Produto') {
        prod?.setValidators([Validators.required]);
        qtd?.setValidators([Validators.required, Validators.min(0.01)]);
      } else if (tipo === 'Mega' || tipo === 'Pacote') {
        pac?.setValidators([Validators.required]);
      } else if (tipo === 'Cabelo') {
        profC?.setValidators([Validators.required]);
        valC?.setValidators([Validators.required, valorCabeloPtValidator]);
      }

      sid?.updateValueAndValidity({ emitEvent: false });
      profS?.updateValueAndValidity({ emitEvent: false });
      prod?.updateValueAndValidity({ emitEvent: false });
      qtd?.updateValueAndValidity({ emitEvent: false });
      pac?.updateValueAndValidity({ emitEvent: false });
      valC?.updateValueAndValidity({ emitEvent: false });
      profC?.updateValueAndValidity({ emitEvent: false });

      const etapas = g.get('etapas') as FormArray<FormGroup>;
      for (let j = 0; j < etapas.length; j++) {
        const eg = etapas.at(j);
        const e = eg.get('etapa');
        const ep = eg.get('profissional');
        const reqE =
          tipo === 'Mega' || tipo === 'Pacote' ? [Validators.required] : [];
        const reqP =
          tipo === 'Mega' || tipo === 'Pacote' ? [Validators.required] : [];
        e?.setValidators(reqE);
        ep?.setValidators(reqP);
        e?.updateValueAndValidity({ emitEvent: false });
        ep?.updateValueAndValidity({ emitEvent: false });
      }
    }
  }

  private validarLinhas(raw: Record<string, unknown>): boolean {
    if (!String(raw['cliente_id'] ?? '').trim()) return false;
    const dataYmd = normalizarDataIso(String(raw['data'] ?? ''));
    if (!dataYmd) return false;
    if (
      this.temLinhaServicoCatalogo() &&
      !normalizarHoraHHmm(String(raw['hora_inicial'] ?? ''))
    ) {
      return false;
    }
    if (this.linhasItensArray.length < 1) return false;
    for (let i = 0; i < this.linhasItensArray.length; i++) {
      const g = this.linhasItensArray.at(i);
      const tipo = String(
        g.get('itemTipo')?.value ?? '',
      ) as TipoLinhaAtendimento;
      if (!this.linhaValida(g, tipo)) return false;
    }
    return true;
  }

  private linhaValida(g: FormGroup, tipo: TipoLinhaAtendimento): boolean {
    if (tipo === 'Serviço') {
      if (!String(g.get('servico_id')?.value ?? '').trim()) return false;
      const p = g.get('profissional')?.value;
      return p != null && Number(p) > 0;
    }
    if (tipo === 'Produto') {
      if (!String(g.get('produto')?.value ?? '').trim()) return false;
      const q = Number(g.get('quantidade')?.value);
      return !Number.isNaN(q) && q > 0;
    }
    if (tipo === 'Mega' || tipo === 'Pacote') {
      if (!String(g.get('pacote')?.value ?? '').trim()) return false;
      return this.etapasValidasParaGrupo(
        g.get('etapas') as FormArray<FormGroup>,
      );
    }
    if (tipo === 'Cabelo') {
      const pid = g.get('profissional_cabelo')?.value;
      if (pid == null || pid === '' || !(Number(pid) > 0)) return false;
      const v = this.parseValorPt(String(g.get('valor_cabelo')?.value ?? ''));
      return v != null && v > 0;
    }
    return false;
  }

  private etapasValidasParaGrupo(etapas: FormArray<FormGroup>): boolean {
    if (etapas.length < 1) return false;
    for (let i = 0; i < etapas.length; i++) {
      const g = etapas.at(i);
      const e = String(g.get('etapa')?.value ?? '').trim();
      const p = g.get('profissional')?.value;
      if (!e || p == null || !(Number(p) > 0)) return false;
    }
    return true;
  }

  private aplicarContextoSlotInput(): void {
    const c = this.contextoSlot;
    if (!c?.data || !/^\d{4}-\d{2}-\d{2}$/.test(c.data.trim().slice(0, 10))) {
      return;
    }
    const dataOk = c.data.trim().slice(0, 10);
    this.prefillEmCurso = true;
    this.form.patchValue({ data: dataOk }, { emitEvent: false });
    this.garantirMinUmaLinha();
    this.aplicarValidadoresLinhas();
    const g0 = this.linhasItensArray.at(0);
    if (g0 && c.profissional_id > 0) {
      g0.patchValue(
        {
          itemTipo: 'Serviço',
          profissional: c.profissional_id,
        },
        { emitEvent: false },
      );
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

  /** Exibe o fim previsto (HH:mm) para linhas de Serviço (catálogo) na ordem do formulário. */
  horarioFinalExibicao(): string {
    if (!this.temLinhaServicoCatalogo()) return '—';
    const dataYmd = normalizarDataIso(
      String(this.form.controls.data.value ?? ''),
    );
    const hi = normalizarHoraHHmm(
      String(this.form.controls.hora_inicial.value ?? ''),
    );
    if (!dataYmd || !hi) return '—';
    const totalMin = this.duracaoMinutosAgendaServicos();
    const anchor = slotInicioFimBrasilia(dataYmd, hi, 30);
    if (!anchor) return '—';
    const cur = parseSqlLocalDateTime(anchor.inicio);
    if (!cur) return '—';
    const end = addMinutesToParts(cur, totalMin);
    return `${String(end.hh).padStart(2, '0')}:${String(end.mm).padStart(2, '0')}`;
  }

  /** Soma durações (min) dos serviços de catálogo em todas as linhas Serviço (ordem do formulário). */
  private duracaoMinutosAgendaServicos(): number {
    let sum = 0;
    for (const c of this.linhasItensArray.controls) {
      if (c.get('itemTipo')?.value !== 'Serviço') continue;
      const sid = String(c.get('servico_id')?.value ?? '').trim();
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

  private montarPayloadsDasLinhas(
    raw: Record<string, unknown>,
  ): CreateAtendimentoPayload[] {
    const cliente_id = String(raw['cliente_id'] ?? '').trim();
    const dataYmd = normalizarDataIso(String(raw['data'] ?? ''));
    if (!dataYmd) return [];
    const observacao = String(raw['observacao'] ?? '').trim() || undefined;
    const horaIni = String(raw['hora_inicial'] ?? '');

    type Prep = {
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
    };
    const servicosPrep: Prep[] = [];
    for (let i = 0; i < this.linhasItensArray.length; i++) {
      const g = this.linhasItensArray.at(i);
      if (g.get('itemTipo')?.value !== 'Serviço') continue;
      const servico_id = String(g.get('servico_id')?.value ?? '').trim();
      if (!servico_id) continue;
      const profissional_id = Number(g.get('profissional')?.value);
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
      servicosPrep.push({
        servico_id,
        profissional_id,
        st,
        base,
        tamanho: String(g.get('tamanho')?.value ?? 'Curto').trim(),
      });
    }
    const slotPairs = this.slotsSequenciaisParaPayloadServico(
      dataYmd,
      horaIni,
      servicosPrep,
    );
    const out: CreateAtendimentoPayload[] = [];
    let servicoIdx = 0;
    let primeiroMerge = true;

    for (let i = 0; i < this.linhasItensArray.length; i++) {
      const g = this.linhasItensArray.at(i);
      const tipo = String(
        g.get('itemTipo')?.value ?? '',
      ) as TipoLinhaAtendimento;

      if (tipo === 'Serviço') {
        const servico_id = String(g.get('servico_id')?.value ?? '').trim();
        if (!servico_id) continue;
        const profissional_id = Number(g.get('profissional')?.value);
        if (!(profissional_id > 0)) continue;
        const pr = servicosPrep[servicoIdx];
        const sp = slotPairs[servicoIdx];
        servicoIdx += 1;
        if (!pr) continue;
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
        primeiroMerge = false;
        continue;
      }

      if (tipo === 'Produto') {
        const nome = String(g.get('produto')?.value ?? '').trim();
        if (!nome) continue;
        const q = Number(g.get('quantidade')?.value);
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
            primeiroMerge,
          ),
        );
        primeiroMerge = false;
        continue;
      }

      if (tipo === 'Mega') {
        const pacote = String(g.get('pacote')?.value ?? '').trim();
        if (!pacote) continue;
        const etapas = (
          g.get('etapas') as FormArray<FormGroup>
        ).getRawValue() as { etapa: string; profissional: number | null }[];
        out.push(
          this.mergeSlot(
            {
              tipo: 'Mega',
              cliente_id,
              data: dataYmd,
              pacote,
              etapas: etapas.map((x) => ({
                etapa: String(x.etapa ?? '').trim(),
                profissional_id: Number(x.profissional),
              })),
              observacao,
            },
            primeiroMerge,
          ),
        );
        primeiroMerge = false;
        continue;
      }

      if (tipo === 'Pacote') {
        const pacote = String(g.get('pacote')?.value ?? '').trim();
        if (!pacote) continue;
        const etapas = (
          g.get('etapas') as FormArray<FormGroup>
        ).getRawValue() as { etapa: string; profissional: number | null }[];
        out.push(
          this.mergeSlot(
            {
              tipo: 'Pacote',
              cliente_id,
              data: dataYmd,
              pacote,
              etapas: etapas.map((x) => ({
                etapa: String(x.etapa ?? '').trim(),
                profissional_id: Number(x.profissional),
              })),
              observacao,
            },
            primeiroMerge,
          ),
        );
        primeiroMerge = false;
        continue;
      }

      if (tipo === 'Cabelo') {
        const v = this.parseValorPt(String(g.get('valor_cabelo')?.value ?? ''));
        if (v == null) continue;
        const det = String(g.get('detalhes_cabelo')?.value ?? '').trim();
        const pid = Number(g.get('profissional_cabelo')?.value);
        if (!(pid > 0)) continue;
        out.push(
          this.mergeSlot(
            {
              tipo: 'Cabelo',
              cliente_id,
              data: dataYmd,
              profissional_id: pid,
              valor: v,
              observacao,
              detalhes_cabelo: det || undefined,
            },
            primeiroMerge,
          ),
        );
        primeiroMerge = false;
      }
    }

    return out;
  }

  private parseValorPt(s: string): number | null {
    const t = s.trim().replace(/\s/g, '').replace(',', '.');
    if (!t) return null;
    const n = parseFloat(t);
    return Number.isNaN(n) ? null : n;
  }
}
