import { Injectable, inject, signal } from '@angular/core';
import { Subject } from 'rxjs';
import { SheetsApiService } from '../../core/services/sheets-api.service';
import type { Servico, ServicoWritePayload } from '../../core/models/api.models';
import { AppToastService } from '../app-toast/app-toast.service';
import { DRAWER_ANIM_MS } from '../cliente-cadastro-drawer/cliente-cadastro-drawer.service';
import { CategoriaCadastroDrawerService } from '../categoria-cadastro-drawer/categoria-cadastro-drawer.service';
import { extractApiErrorMessage } from '../../core/utils/api-error-message';
import {
  formataMoedaBrl,
  moedaAPartirDosDigitos,
  moedaParaPayload,
  normalizarMoedaExibicao,
  normalizarPercentualExibicao,
  percentualAPartirDosDigitos,
  percentualParaPayload,
  valorDigitosVazio,
} from '../../core/utils/brl-digit-input';
import { lerServicoTexto } from '../../core/utils/servico-campos';
import { valorMonetarioParaNumero } from '../../core/utils/atendimento-display';
import type { SaasSelectOption } from '../../features/agenda/pages/novo/saas-select.component';

export type ServicoMoedaCampo =
  | 'valorBase'
  | 'precoCurto'
  | 'precoMedio'
  | 'precoMl'
  | 'precoLongo'
  | 'custoAdicional';

export const SERVICO_ABAS = [
  'Cadastro',
  'Configurações',
  'Cashback',
  'Cuidados',
  'Retorno',
  'Comissões e Auxiliares',
  'Personalizar',
  'Produtos consumidos',
  'Configurar nota fiscal',
] as const;

export type ServicoCadastroAba = (typeof SERVICO_ABAS)[number];

export type ServicoDrawerCallbacks = {
  onSalvo?: (item: Servico) => void;
};

@Injectable({ providedIn: 'root' })
export class ServicoCadastroDrawerService {
  private readonly api = inject(SheetsApiService);
  private readonly toast = inject(AppToastService);
  private readonly categoriaDrawer = inject(CategoriaCadastroDrawerService);

  readonly salvo$ = new Subject<Servico>();

  readonly aberto = signal(false);
  readonly panelOpen = signal(false);

  modo: 'novo' | 'editar' = 'novo';
  idEdicao: string | null = null;
  abaAtiva: ServicoCadastroAba = 'Cadastro';
  salvando = false;
  erro = '';

  nome = '';
  categoria = '';
  tipo: 'Fixo' | 'Tamanho' = 'Fixo';
  valorBase = '';
  precoCurto = '';
  precoMedio = '';
  precoMl = '';
  precoLongo = '';
  /**
   * Comissão R$ por faixa (`servicos.curto` / `medio` / `m_l` / `longo`).
   * Em tipo Tamanho a UI edita % e estas colunas são calculadas no save.
   */
  comissaoCurto = '';
  comissaoMedio = '';
  comissaoMl = '';
  comissaoLongo = '';
  custoAdicional = '';
  /** Fixo → `fixa` (R$); Tamanho → `pct` (%). */
  comissaoUnidade: 'pct' | 'fixa' = 'fixa';
  comissaoValor = '';
  /** Texto no input composto (sem R$ / sem %), sincronizado com o modelo. */
  valorBaseUi = '';
  comissaoValorUi = '';
  duracaoMinutos = 30;
  /** Minutos por faixa quando `tipo === Tamanho` (null = usar `duracaoMinutos`). */
  duracaoCurto: number | null = null;
  duracaoMedio: number | null = null;
  duracaoMl: number | null = null;
  duracaoLongo: number | null = null;
  descricao = '';
  mostraNoSite = true;
  fotoUrl = '';

  readonly opcoesDuracaoMinutos = [15, 20, 30, 45, 60, 90, 120];

  readonly opcoesTipoSelect: SaasSelectOption[] = [
    { value: 'Fixo', label: 'Preço fixo' },
    { value: 'Tamanho', label: 'Por tamanho do cabelo' },
  ];

  categoriasOpcoes: string[] = [];

  private callbacks: ServicoDrawerCallbacks | null = null;
  private closeTimer: ReturnType<typeof setTimeout> | null = null;
  private pageScrollLockAtivo = false;
  private bodyScrollPreDrawer = 0;

  get titulo(): string {
    return this.modo === 'editar' ? 'Editando serviço' : 'Novo serviço';
  }

  abaAtivaIndex(): number {
    const i = SERVICO_ABAS.indexOf(this.abaAtiva);
    return i >= 0 ? i : 0;
  }

  /** Opções de duração incluindo valor actual (ex.: legado fora da lista). */
  opcoesDuracaoCom(atual: number | null | undefined): number[] {
    const base = [...this.opcoesDuracaoMinutos];
    if (atual != null && Number.isFinite(atual) && atual > 0 && !base.includes(atual)) {
      base.push(atual);
      base.sort((a, b) => a - b);
    }
    return base;
  }

  /**
   * Opções do select de duração.
   * Com `incluirPadrao`, valor vazio = null («Padrão» nas faixas por tamanho).
   */
  opcoesDuracaoSelect(
    atual?: number | null,
    incluirPadrao = false,
  ): SaasSelectOption[] {
    const opts: SaasSelectOption[] = [];
    if (incluirPadrao) {
      opts.push({ value: '', label: 'Padrão' });
    }
    for (const m of this.opcoesDuracaoCom(atual)) {
      opts.push({ value: String(m), label: `${m} min` });
    }
    return opts;
  }

  /** Opções do select de categoria (catálogo + valor actual se legado). */
  opcoesCategoriaSelect(): SaasSelectOption[] {
    const nomes = [...this.categoriasOpcoes];
    const atual = String(this.categoria ?? '').trim();
    if (atual && !nomes.includes(atual)) {
      nomes.unshift(atual);
    }
    return nomes.map((nome) => ({ value: nome, label: nome }));
  }

  /** Recarrega categorias ativas do catálogo (`GET /api/categorias`). */
  carregarCategorias(): void {
    this.api.listCategoriasCatalogo(false).subscribe({
      next: (cats) => {
        this.categoriasOpcoes = (cats ?? [])
          .map((c) => String(c.nome ?? '').trim())
          .filter(Boolean)
          .sort((a, b) => a.localeCompare(b, 'pt-BR'));
      },
      error: () => {
        /* Mantém lista já passada pelo caller (página Serviços). */
      },
    });
  }

  /** Abre drawer «Nova categoria» a partir do rodapé do select. */
  abrirCriarCategoria(): void {
    this.categoriaDrawer.abrirNovo({
      onSalvo: (nome) => {
        const n = String(nome ?? '').trim();
        if (!n) return;
        if (!this.categoriasOpcoes.some((c) => c === n)) {
          this.categoriasOpcoes = [...this.categoriasOpcoes, n].sort((a, b) =>
            a.localeCompare(b, 'pt-BR'),
          );
        }
        this.categoria = n;
        this.carregarCategorias();
      },
    });
  }

  abrirNovo(opts?: ServicoDrawerCallbacks & { categorias?: string[] }): void {
    this.resetForm();
    this.modo = 'novo';
    this.idEdicao = null;
    this.callbacks = opts ?? null;
    this.categoriasOpcoes = opts?.categorias ?? [];
    this.carregarCategorias();
    this.abrirPainel({ focarNome: true });
  }

  abrirEdicao(
    item: Servico,
    opts?: ServicoDrawerCallbacks & { categorias?: string[] },
  ): void {
    this.resetForm();
    this.modo = 'editar';
    this.idEdicao = String(item.id);
    this.callbacks = opts ?? null;
    this.categoriasOpcoes = opts?.categorias ?? [];
    this.preencherDeItem(item);
    this.carregarCategorias();
    this.abrirPainel();
  }

  fechar(): void {
    if (!this.aberto()) return;
    this.panelOpen.set(false);
    this.desbloquearScrollPagina();
    if (this.closeTimer != null) clearTimeout(this.closeTimer);
    this.closeTimer = setTimeout(() => {
      this.closeTimer = null;
      this.aberto.set(false);
      this.callbacks = null;
      this.erro = '';
      this.salvando = false;
      this.modo = 'novo';
      this.idEdicao = null;
      this.resetForm();
    }, DRAWER_ANIM_MS);
  }

  setAba(aba: ServicoCadastroAba): void {
    this.abaAtiva = aba;
  }

  onMoedaInput(campo: ServicoMoedaCampo, ev: Event): void {
    const el = ev.target as HTMLInputElement | null;
    if (!el) return;
    const fmt = moedaAPartirDosDigitos(el.value);
    this[campo] = fmt;
    el.value = fmt;
    this.colocarCursorNoFim(el);
  }

  /** Input composto com prefixo R$ (Valor fixo ou preço por faixa). */
  onMoedaCompostaInput(
    campo: 'valorBase' | Exclude<ServicoMoedaCampo, 'custoAdicional'>,
    ev: Event,
  ): void {
    const el = ev.target as HTMLInputElement | null;
    if (!el) return;
    const fmt = moedaAPartirDosDigitos(el.value);
    if (campo === 'valorBase') {
      this.valorBase = fmt;
      this.valorBaseUi = this.moedaSemPrefixo(fmt);
      el.value = this.valorBaseUi;
    } else {
      this[campo] = fmt;
      el.value = this.moedaSemPrefixo(fmt);
    }
    this.colocarCursorNoFim(el);
  }

  onComissaoValorInput(ev: Event): void {
    const el = ev.target as HTMLInputElement | null;
    if (!el) return;
    if (this.comissaoUnidade === 'pct') {
      const fmt = percentualAPartirDosDigitos(el.value);
      this.comissaoValor = fmt;
      this.comissaoValorUi = this.percentualSemSufixo(fmt);
      el.value = this.comissaoValorUi;
      this.colocarCursorNoFim(el);
      return;
    }
    const fmt = moedaAPartirDosDigitos(el.value);
    this.comissaoValor = fmt;
    this.comissaoValorUi = this.moedaSemPrefixo(fmt);
    el.value = this.comissaoValorUi;
    this.colocarCursorNoFim(el);
  }

  /** Exibição no input composto (prefixo R$ fora do campo). */
  moedaSemPrefixo(raw: string): string {
    const s = String(raw ?? '').trim();
    if (!s) return '';
    return s.replace(/^R\$\s*/i, '').trim();
  }

  /** Exibição no input composto (sufixo % fora do campo). */
  percentualSemSufixo(raw: string): string {
    const s = String(raw ?? '').trim();
    if (!s) return '';
    return s.replace(/%/g, '').trim();
  }

  private syncValorUi(): void {
    this.valorBaseUi = this.moedaSemPrefixo(this.valorBase);
    this.comissaoValorUi =
      this.comissaoUnidade === 'pct'
        ? this.percentualSemSufixo(this.comissaoValor)
        : this.moedaSemPrefixo(this.comissaoValor);
  }

  /** Caret no fim — síncrono (digitação). */
  private colocarCursorNoFim(el: HTMLInputElement): void {
    const len = el.value.length;
    try {
      el.setSelectionRange(len, len);
    } catch {
      /* ignore */
    }
  }

  /** Preço fixo → comissão em R$; por tamanho → comissão em %. */
  onTipoChange(tipo: string): void {
    const nextTipo: 'Fixo' | 'Tamanho' =
      tipo === 'Tamanho' ? 'Tamanho' : 'Fixo';
    const nextUnidade: 'pct' | 'fixa' =
      nextTipo === 'Fixo' ? 'fixa' : 'pct';
    this.tipo = nextTipo;
    if (this.comissaoUnidade !== nextUnidade) {
      this.comissaoUnidade = nextUnidade;
      this.comissaoValor = '';
      this.comissaoValorUi = '';
    }
  }

  /** Comissão R$ calculada a partir do % e do preço da faixa (exibição). */
  comissaoFaixaCalculada(precoFmt: string): string {
    const fmt = this.calcularComissaoReaisDePreco(precoFmt);
    return fmt ?? '—';
  }

  private static readonly FOTO_URL_MAX_CHARS = 520_000;

  salvar(): void {
    if (this.salvando) return;
    const nome = this.nome.trim();
    if (!nome) {
      this.erro = 'Informe o nome do serviço.';
      this.abaAtiva = 'Cadastro';
      return;
    }
    const categoria = this.categoria.trim();
    if (!categoria) {
      this.erro = 'Informe a categoria.';
      this.abaAtiva = 'Cadastro';
      return;
    }
    if (this.tipo === 'Fixo') {
      if (valorDigitosVazio(this.valorBase) && valorDigitosVazio(this.valorBaseUi)) {
        this.erro = 'Informe o valor do serviço.';
        this.abaAtiva = 'Cadastro';
        return;
      }
    }
    if (this.tipo === 'Tamanho') {
      const temPreco = [
        this.precoCurto,
        this.precoMedio,
        this.precoMl,
        this.precoLongo,
      ].some((p) => !valorDigitosVazio(p));
      if (!temPreco) {
        this.erro =
          'Informe pelo menos um preço (Curto, Médio, M/L ou Longo).';
        this.abaAtiva = 'Cadastro';
        return;
      }
    }
    const foto = this.fotoUrl.trim();
    if (foto && foto.length > ServicoCadastroDrawerService.FOTO_URL_MAX_CHARS) {
      this.erro =
        'A foto é grande demais para gravar. Escolha outra imagem ou grave sem foto.';
      this.abaAtiva = 'Cadastro';
      return;
    }

    const payload = this.montarPayload(nome, categoria);
    this.salvando = true;
    this.erro = '';
    const criando = !(this.modo === 'editar' && this.idEdicao);
    const req = criando
      ? this.api.createServico(payload)
      : this.api.updateServico(this.idEdicao!, payload);

    req.subscribe({
      next: (item) => {
        this.salvando = false;
        this.toast.show(
          criando
            ? 'Serviço criado com sucesso!'
            : 'Serviço atualizado com sucesso!',
        );
        this.callbacks?.onSalvo?.(item);
        this.salvo$.next(item);
        this.fechar();
      },
      error: (e: unknown) => {
        this.salvando = false;
        this.erro =
          extractApiErrorMessage(e) ||
          'Não foi possível salvar o serviço.';
      },
    });
  }

  private abrirPainel(opts?: { focarNome?: boolean }): void {
    this.abaAtiva = 'Cadastro';
    this.erro = '';
    this.panelOpen.set(false);
    this.aberto.set(true);
    this.bloquearScrollPagina();
    queueMicrotask(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          this.panelOpen.set(true);
          if (opts?.focarNome) {
            queueMicrotask(() => {
              document.getElementById('servico-cadastro-nome')?.focus();
            });
          }
        });
      });
    });
  }

  private obterLarguraScrollbar(): number {
    if (typeof window === 'undefined') return 0;
    return Math.max(0, window.innerWidth - document.documentElement.clientWidth);
  }

  private bloquearScrollPagina(): void {
    if (this.pageScrollLockAtivo) return;
    this.bodyScrollPreDrawer = window.scrollY || 0;
    const gutter = this.obterLarguraScrollbar();
    const body = document.body;
    body.style.position = 'fixed';
    body.style.top = `-${this.bodyScrollPreDrawer}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.width = '100%';
    if (gutter > 0) {
      body.style.paddingRight = `${gutter}px`;
    }
    this.pageScrollLockAtivo = true;
  }

  private desbloquearScrollPagina(): void {
    if (!this.pageScrollLockAtivo) return;
    const body = document.body;
    body.style.position = '';
    body.style.top = '';
    body.style.left = '';
    body.style.right = '';
    body.style.width = '';
    body.style.paddingRight = '';
    this.pageScrollLockAtivo = false;
    window.scrollTo(0, this.bodyScrollPreDrawer);
  }

  private resetForm(): void {
    this.nome = '';
    this.categoria = '';
    this.tipo = 'Fixo';
    this.valorBase = '';
    this.precoCurto = '';
    this.precoMedio = '';
    this.precoMl = '';
    this.precoLongo = '';
    this.comissaoCurto = '';
    this.comissaoMedio = '';
    this.comissaoMl = '';
    this.comissaoLongo = '';
    this.custoAdicional = '';
    this.comissaoUnidade = 'fixa';
    this.comissaoValor = '';
    this.valorBaseUi = '';
    this.comissaoValorUi = '';
    this.duracaoMinutos = 30;
    this.duracaoCurto = null;
    this.duracaoMedio = null;
    this.duracaoMl = null;
    this.duracaoLongo = null;
    this.descricao = '';
    this.mostraNoSite = true;
    this.fotoUrl = '';
    this.erro = '';
  }

  private preencherDeItem(item: Servico): void {
    this.nome = lerServicoTexto(item, 'Serviço', 'nome', 'servico');
    this.categoria = lerServicoTexto(item, 'Categoria', 'categoria');
    const tipoRaw = lerServicoTexto(item, 'Tipo', 'tipo').toLowerCase();
    this.tipo = tipoRaw === 'tamanho' ? 'Tamanho' : 'Fixo';
    this.valorBase = normalizarMoedaExibicao(
      lerServicoTexto(item, 'Valor Base', 'valor_base'),
    );
    this.precoCurto = normalizarMoedaExibicao(
      lerServicoTexto(item, 'Preço Curto', 'preco_curto'),
    );
    this.precoMedio = normalizarMoedaExibicao(
      lerServicoTexto(item, 'Preço Médio', 'preco_medio'),
    );
    this.precoMl = normalizarMoedaExibicao(
      lerServicoTexto(item, 'Preço Médio/Longo', 'preco_medio_longo'),
    );
    this.precoLongo = normalizarMoedaExibicao(
      lerServicoTexto(item, 'Preço Longo', 'preco_longo'),
    );
    this.comissaoCurto = normalizarMoedaExibicao(
      lerServicoTexto(item, 'Curto', 'curto'),
    );
    this.comissaoMedio = normalizarMoedaExibicao(
      lerServicoTexto(item, 'Médio', 'medio'),
    );
    this.comissaoMl = normalizarMoedaExibicao(
      lerServicoTexto(item, 'M/L', 'm_l'),
    );
    this.comissaoLongo = normalizarMoedaExibicao(
      lerServicoTexto(item, 'Longo', 'longo'),
    );
    this.custoAdicional = normalizarMoedaExibicao(
      lerServicoTexto(item, 'Custo Fixo', 'custo_fixo'),
    );
    const pct = lerServicoTexto(item, 'Comissão %', 'comissao_pct');
    const fixaRaw = lerServicoTexto(item, 'Comissão Fixa', 'comissao_fixa');
    this.comissaoUnidade = this.tipo === 'Fixo' ? 'fixa' : 'pct';
    if (this.tipo === 'Fixo') {
      this.comissaoValor = normalizarMoedaExibicao(fixaRaw);
    } else {
      const pctFmt = normalizarPercentualExibicao(pct);
      this.comissaoValor =
        pctFmt ||
        this.derivarPctDeFaixa(this.precoCurto, this.comissaoCurto) ||
        this.derivarPctDeFaixa(this.precoMedio, this.comissaoMedio) ||
        this.derivarPctDeFaixa(this.precoMl, this.comissaoMl) ||
        this.derivarPctDeFaixa(this.precoLongo, this.comissaoLongo);
    }
    const dur = Number(item['duracao_minutos'] ?? 30);
    this.duracaoMinutos = Number.isFinite(dur) && dur > 0 ? dur : 30;
    this.duracaoCurto = this.lerDuracaoOuNull(item['duracao_curto']);
    this.duracaoMedio = this.lerDuracaoOuNull(item['duracao_medio']);
    this.duracaoMl = this.lerDuracaoOuNull(item['duracao_m_l']);
    this.duracaoLongo = this.lerDuracaoOuNull(item['duracao_longo']);
    this.descricao = lerServicoTexto(item, 'Descrição', 'descricao');
    this.mostraNoSite = item['mostra_no_site'] !== false;
    this.fotoUrl = String(item['foto_url'] ?? '').trim();
    this.syncValorUi();
  }

  private montarPayload(nome: string, categoria: string): ServicoWritePayload {
    // Garante modelo alinhado à UI composta (prefixo fora do input).
    if (this.tipo === 'Fixo') {
      if (this.valorBaseUi.trim() && valorDigitosVazio(this.valorBase)) {
        this.valorBase = moedaAPartirDosDigitos(this.valorBaseUi);
      }
      if (this.comissaoValorUi.trim() && valorDigitosVazio(this.comissaoValor)) {
        this.comissaoValor = moedaAPartirDosDigitos(this.comissaoValorUi);
      }
    }
    if (
      this.tipo === 'Tamanho' &&
      this.comissaoValorUi.trim() &&
      valorDigitosVazio(this.comissaoValor)
    ) {
      this.comissaoValor = percentualAPartirDosDigitos(this.comissaoValorUi);
    }

    const comissaoPct =
      this.tipo === 'Tamanho'
        ? percentualParaPayload(this.comissaoValor)
        : null;
    const comissaoFixa =
      this.tipo === 'Fixo' ? moedaParaPayload(this.comissaoValor) : null;

    const base: ServicoWritePayload = {
      nome,
      tipo: this.tipo,
      categoria,
      mostra_no_site: this.mostraNoSite,
      descricao: this.descricao.trim() || null,
      foto_url: this.fotoUrl.trim() || null,
      custo_fixo: moedaParaPayload(this.custoAdicional),
      comissao_pct: comissaoPct,
      comissao_fixa: comissaoFixa,
      duracao_minutos: this.duracaoMinutos,
    };

    if (this.tipo === 'Fixo') {
      return {
        ...base,
        valor_base: moedaParaPayload(this.valorBase),
        // Backend também zera faixas; envio explícito evita lixo residual no PATCH.
        preco_curto: null,
        preco_medio: null,
        preco_medio_longo: null,
        preco_longo: null,
        curto: null,
        medio: null,
        m_l: null,
        longo: null,
        duracao_curto: null,
        duracao_medio: null,
        duracao_m_l: null,
        duracao_longo: null,
      };
    }

    return {
      ...base,
      // `duracao_minutos` = duração base (faixas null usam este valor na agenda).
      valor_base: null,
      preco_curto: moedaParaPayload(this.precoCurto),
      preco_medio: moedaParaPayload(this.precoMedio),
      preco_medio_longo: moedaParaPayload(this.precoMl),
      preco_longo: moedaParaPayload(this.precoLongo),
      // Comissão R$ por tamanho = preço × % (colunas legadas curto/medio/m_l/longo).
      curto: this.calcularComissaoReaisDePreco(this.precoCurto),
      medio: this.calcularComissaoReaisDePreco(this.precoMedio),
      m_l: this.calcularComissaoReaisDePreco(this.precoMl),
      longo: this.calcularComissaoReaisDePreco(this.precoLongo),
      duracao_curto: this.duracaoCurto,
      duracao_medio: this.duracaoMedio,
      duracao_m_l: this.duracaoMl,
      duracao_longo: this.duracaoLongo,
    };
  }

  /** `preço × comissão%` → texto BRL para API (null se sem dados). */
  private calcularComissaoReaisDePreco(precoFmt: string): string | null {
    const preco = valorMonetarioParaNumero(precoFmt);
    const pctStr = percentualParaPayload(this.comissaoValor);
    if (preco == null || preco <= 0 || !pctStr) return null;
    const pct = parseInt(pctStr.replace(/\D/g, ''), 10);
    if (!Number.isFinite(pct) || pct <= 0) return null;
    return formataMoedaBrl((preco * pct) / 100);
  }

  /** Infere % a partir de comissão R$ / preço (serviços legados sem `comissao_pct`). */
  private derivarPctDeFaixa(precoFmt: string, comissaoFmt: string): string {
    const preco = valorMonetarioParaNumero(precoFmt);
    const comissao = valorMonetarioParaNumero(comissaoFmt);
    if (
      preco == null ||
      comissao == null ||
      preco <= 0 ||
      comissao <= 0
    ) {
      return '';
    }
    return percentualAPartirDosDigitos(
      String(Math.round((comissao / preco) * 100)),
    );
  }

  private lerDuracaoOuNull(v: unknown): number | null {
    if (v == null || v === '') return null;
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) return null;
    return Math.round(n);
  }
}
