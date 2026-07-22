import { Injectable, inject, signal } from '@angular/core';
import { Subject } from 'rxjs';
import { SheetsApiService } from '../../core/services/sheets-api.service';
import type { Servico, ServicoWritePayload } from '../../core/models/api.models';
import { AppToastService } from '../app-toast/app-toast.service';
import { DRAWER_ANIM_MS } from '../cliente-cadastro-drawer/cliente-cadastro-drawer.service';
import { extractApiErrorMessage } from '../../core/utils/api-error-message';
import {
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

export type ServicoMoedaCampo =
  | 'valorBase'
  | 'precoCurto'
  | 'precoMedio'
  | 'precoMl'
  | 'precoLongo'
  | 'comissaoCurto'
  | 'comissaoMedio'
  | 'comissaoMl'
  | 'comissaoLongo'
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
  /** Comissão R$ por faixa (`servicos.curto` / `medio` / `m_l` / `longo`). */
  comissaoCurto = '';
  comissaoMedio = '';
  comissaoMl = '';
  comissaoLongo = '';
  custoAdicional = '';
  comissaoUnidade: 'pct' | 'fixa' = 'pct';
  comissaoValor = '';
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

  abrirNovo(opts?: ServicoDrawerCallbacks & { categorias?: string[] }): void {
    this.resetForm();
    this.modo = 'novo';
    this.idEdicao = null;
    this.callbacks = opts ?? null;
    this.categoriasOpcoes = opts?.categorias ?? [];
    this.abrirPainel();
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
  }

  onComissaoValorInput(ev: Event): void {
    const el = ev.target as HTMLInputElement | null;
    if (!el) return;
    const fmt =
      this.comissaoUnidade === 'pct'
        ? percentualAPartirDosDigitos(el.value)
        : moedaAPartirDosDigitos(el.value);
    this.comissaoValor = fmt;
    el.value = fmt;
  }

  onComissaoUnidadeChange(): void {
    const raw = this.comissaoValor;
    if (!raw.trim()) {
      this.comissaoValor = '';
      return;
    }
    this.comissaoValor =
      this.comissaoUnidade === 'pct'
        ? percentualAPartirDosDigitos(raw)
        : moedaAPartirDosDigitos(raw);
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

  private abrirPainel(): void {
    this.abaAtiva = 'Cadastro';
    this.erro = '';
    this.panelOpen.set(false);
    this.aberto.set(true);
    this.bloquearScrollPagina();
    queueMicrotask(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          this.panelOpen.set(true);
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
    this.comissaoUnidade = 'pct';
    this.comissaoValor = '';
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
    const fixaNum = valorMonetarioParaNumero(fixaRaw);
    const pctFmt = normalizarPercentualExibicao(pct);
    if (pctFmt) {
      this.comissaoUnidade = 'pct';
      this.comissaoValor = pctFmt;
    } else if (fixaNum != null && fixaNum > 0) {
      this.comissaoUnidade = 'fixa';
      this.comissaoValor = normalizarMoedaExibicao(fixaRaw);
    } else {
      this.comissaoUnidade = 'pct';
      this.comissaoValor = '';
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
  }

  private montarPayload(nome: string, categoria: string): ServicoWritePayload {
    const comissaoPct =
      this.comissaoUnidade === 'pct'
        ? percentualParaPayload(this.comissaoValor)
        : null;
    const comissaoFixa =
      this.comissaoUnidade === 'fixa'
        ? moedaParaPayload(this.comissaoValor)
        : null;

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
      // Comissão R$ por tamanho (colunas legadas curto/medio/m_l/longo).
      curto: moedaParaPayload(this.comissaoCurto),
      medio: moedaParaPayload(this.comissaoMedio),
      m_l: moedaParaPayload(this.comissaoMl),
      longo: moedaParaPayload(this.comissaoLongo),
      duracao_curto: this.duracaoCurto,
      duracao_medio: this.duracaoMedio,
      duracao_m_l: this.duracaoMl,
      duracao_longo: this.duracaoLongo,
    };
  }

  private lerDuracaoOuNull(v: unknown): number | null {
    if (v == null || v === '') return null;
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) return null;
    return Math.round(n);
  }
}
