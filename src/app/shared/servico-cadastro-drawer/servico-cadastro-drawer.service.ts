import { Injectable, inject, signal } from '@angular/core';
import { Subject } from 'rxjs';
import { SheetsApiService } from '../../core/services/sheets-api.service';
import type { Servico, ServicoWritePayload } from '../../core/models/api.models';
import { AppToastService } from '../app-toast/app-toast.service';
import { DRAWER_ANIM_MS } from '../cliente-cadastro-drawer/cliente-cadastro-drawer.service';
import { extractApiErrorMessage } from '../../core/utils/api-error-message';

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
    }, DRAWER_ANIM_MS);
  }

  setAba(aba: ServicoCadastroAba): void {
    this.abaAtiva = aba;
  }

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
      ].some((p) => p.trim().length > 0);
      if (!temPreco) {
        this.erro =
          'Informe pelo menos um preço (Curto, Médio, M/L ou Longo).';
        this.abaAtiva = 'Cadastro';
        return;
      }
    }

    const payload = this.montarPayload(nome, categoria);
    this.salvando = true;
    this.erro = '';
    const req =
      this.modo === 'editar' && this.idEdicao
        ? this.api.updateServico(this.idEdicao, payload)
        : this.api.createServico(payload);

    req.subscribe({
      next: (item) => {
        this.salvando = false;
        this.toast.show(
          this.modo === 'editar'
            ? 'Serviço atualizado com sucesso!'
            : 'Serviço criado com sucesso!',
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
    this.nome = String(item['Serviço'] ?? '').trim();
    this.categoria = String(item['Categoria'] ?? '').trim();
    const tipoRaw = String(item['Tipo'] ?? '')
      .trim()
      .toLowerCase();
    this.tipo = tipoRaw === 'tamanho' ? 'Tamanho' : 'Fixo';
    this.valorBase = this.textoMoeda(item['Valor Base']);
    this.precoCurto = this.textoMoeda(item['Preço Curto']);
    this.precoMedio = this.textoMoeda(item['Preço Médio']);
    this.precoMl = this.textoMoeda(item['Preço Médio/Longo']);
    this.precoLongo = this.textoMoeda(item['Preço Longo']);
    this.custoAdicional = this.textoMoeda(item['Custo Fixo']);
    const pct = String(item['Comissão %'] ?? '').trim();
    const fixa = String(item['Comissão Fixa'] ?? '').trim();
    if (pct) {
      this.comissaoUnidade = 'pct';
      this.comissaoValor = pct.replace('%', '').trim();
    } else if (fixa) {
      this.comissaoUnidade = 'fixa';
      this.comissaoValor = this.textoMoeda(fixa);
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
    this.descricao = String(item['Descrição'] ?? '').trim();
    this.mostraNoSite = item['mostra_no_site'] !== false;
    this.fotoUrl = String(item['foto_url'] ?? '').trim();
  }

  private montarPayload(nome: string, categoria: string): ServicoWritePayload {
    const comissaoPct =
      this.comissaoUnidade === 'pct' && this.comissaoValor.trim()
        ? this.comissaoValor.trim()
        : null;
    const comissaoFixa =
      this.comissaoUnidade === 'fixa' && this.comissaoValor.trim()
        ? this.comissaoValor.trim()
        : null;

    const base: ServicoWritePayload = {
      nome,
      tipo: this.tipo,
      categoria,
      mostra_no_site: this.mostraNoSite,
      descricao: this.descricao.trim() || null,
      foto_url: this.fotoUrl.trim() || null,
      custo_fixo: this.custoAdicional.trim() || null,
      comissao_pct: comissaoPct,
      comissao_fixa: comissaoFixa,
      duracao_minutos: this.duracaoMinutos,
    };

    if (this.tipo === 'Fixo') {
      return {
        ...base,
        valor_base: this.valorBase.trim() || null,
        // Backend também zera faixas; envio explícito evita lixo residual no PATCH.
        preco_curto: null,
        preco_medio: null,
        preco_medio_longo: null,
        preco_longo: null,
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
      preco_curto: this.precoCurto.trim() || null,
      preco_medio: this.precoMedio.trim() || null,
      preco_medio_longo: this.precoMl.trim() || null,
      preco_longo: this.precoLongo.trim() || null,
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

  private textoMoeda(v: unknown): string {
    if (v == null) return '';
    return String(v).trim();
  }
}
