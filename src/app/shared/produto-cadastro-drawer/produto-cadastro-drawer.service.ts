import { Injectable, inject, signal } from '@angular/core';
import { Subject } from 'rxjs';
import type { ProdutoCatalogoItem } from '../../core/models/api.models';
import { SheetsApiService } from '../../core/services/sheets-api.service';
import { extractApiErrorMessage } from '../../core/utils/api-error-message';
import {
  moedaAPartirDosDigitos,
  moedaParaPayload,
  normalizarMoedaExibicao,
  normalizarPercentualExibicao,
  percentualAPartirDosDigitos,
  percentualParaPayload,
} from '../../core/utils/brl-digit-input';
import { AppToastService } from '../app-toast/app-toast.service';
import { DRAWER_ANIM_MS } from '../cliente-cadastro-drawer/cliente-cadastro-drawer.service';
import { CategoriaCadastroDrawerService } from '../categoria-cadastro-drawer/categoria-cadastro-drawer.service';
import type { SaasSelectOption } from '../../features/agenda/pages/novo/saas-select.component';

export const PRODUTO_ABAS = [
  'Cadastro',
  'Configurações',
  'Cashback',
  'Retorno',
  'Serviços vinculados',
  'Configurar nota fiscal',
] as const;

export type ProdutoCadastroAba = (typeof PRODUTO_ABAS)[number];

const ABAS_DESABILITADAS: ReadonlySet<ProdutoCadastroAba> = new Set([
  'Retorno',
  'Serviços vinculados',
  'Configurar nota fiscal',
]);

export type ProdutoMoedaCampo =
  | 'precoVenda'
  | 'custoCompra'
  | 'precoProfissional'
  | 'custoAdicional';

export type ProdutoDrawerCallbacks = {
  onSalvo?: (item: ProdutoCatalogoItem) => void;
};

@Injectable({ providedIn: 'root' })
export class ProdutoCadastroDrawerService {
  private readonly api = inject(SheetsApiService);
  private readonly toast = inject(AppToastService);
  private readonly categoriaDrawer = inject(CategoriaCadastroDrawerService);

  readonly salvo$ = new Subject<ProdutoCatalogoItem>();
  readonly aberto = signal(false);
  readonly panelOpen = signal(false);

  modo: 'novo' | 'editar' = 'novo';
  editandoId: number | null = null;
  abaAtiva: ProdutoCadastroAba = 'Cadastro';
  salvando = false;
  erro = '';

  nome = '';
  categoria = '';
  marca = '';
  precoVenda = '';
  custoCompra = '';
  registroSaida: 'em unidade' | 'em ml' | 'em gramas' = 'em unidade';
  unidadeEquivalente = '1';
  estoqueMinimo = '0';
  estoqueInicial = '0';
  precoProfissional = '';
  custoAdicional = '';
  comissaoPadrao = '';
  codigoItem = '';
  codigoBarras = '';
  observacoes = '';
  fotoUrl = '';

  categoriasOpcoes: string[] = [];
  marcasOpcoes: string[] = [];

  readonly opcoesRegistroSaidaSelect: SaasSelectOption[] = [
    { value: 'em unidade', label: 'em unidade' },
    { value: 'em ml', label: 'em ml' },
    { value: 'em gramas', label: 'em gramas' },
  ];

  private callbacks: ProdutoDrawerCallbacks | null = null;
  private closeTimer: ReturnType<typeof setTimeout> | null = null;
  private pageScrollLockAtivo = false;
  private bodyScrollPreDrawer = 0;

  private static readonly FOTO_URL_MAX_CHARS = 520_000;

  get titulo(): string {
    return this.modo === 'editar' ? 'Editando produto' : 'Novo produto';
  }

  abaAtivaIndex(): number {
    const i = PRODUTO_ABAS.indexOf(this.abaAtiva);
    return i >= 0 ? i : 0;
  }

  abaDesabilitada(aba: ProdutoCadastroAba): boolean {
    return ABAS_DESABILITADAS.has(aba);
  }

  opcoesCategoriaSelect(): SaasSelectOption[] {
    const nomes = [...this.categoriasOpcoes];
    const atual = String(this.categoria ?? '').trim();
    if (atual && !nomes.includes(atual)) {
      nomes.unshift(atual);
    }
    return nomes.map((nome) => ({ value: nome, label: nome }));
  }

  opcoesMarcaSelect(): SaasSelectOption[] {
    const nomes = [...this.marcasOpcoes];
    const atual = String(this.marca ?? '').trim();
    if (atual && !nomes.includes(atual)) {
      nomes.unshift(atual);
    }
    return nomes.map((nome) => ({ value: nome, label: nome }));
  }

  carregarCategorias(): void {
    this.api.listCategoriasCatalogo(false).subscribe({
      next: (cats) => {
        this.categoriasOpcoes = (cats ?? [])
          .map((c) => String(c.nome ?? '').trim())
          .filter(Boolean)
          .sort((a, b) => a.localeCompare(b, 'pt-BR'));
      },
      error: () => {
        /* Mantém lista já passada pelo caller. */
      },
    });
  }

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

  abrirNovo(
    opts?: ProdutoDrawerCallbacks & {
      categorias?: string[];
      marcas?: string[];
    },
  ): void {
    this.resetForm();
    this.modo = 'novo';
    this.editandoId = null;
    this.callbacks = opts ?? null;
    this.categoriasOpcoes = opts?.categorias ?? [];
    this.marcasOpcoes = opts?.marcas ?? [];
    this.carregarCategorias();
    this.abrirPainel({ focarNome: true });
  }

  abrirEdicao(
    item: ProdutoCatalogoItem,
    opts?: ProdutoDrawerCallbacks & {
      categorias?: string[];
      marcas?: string[];
    },
  ): void {
    this.resetForm();
    this.modo = 'editar';
    this.editandoId = item.id;
    this.callbacks = opts ?? null;
    this.categoriasOpcoes = opts?.categorias ?? [];
    this.marcasOpcoes = opts?.marcas ?? [];
    this.preencherForm(item);
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
      this.editandoId = null;
      this.resetForm();
    }, DRAWER_ANIM_MS);
  }

  setAba(aba: ProdutoCadastroAba): void {
    if (this.abaDesabilitada(aba)) return;
    this.abaAtiva = aba;
  }

  onMoedaInput(campo: ProdutoMoedaCampo, ev: Event): void {
    const el = ev.target as HTMLInputElement | null;
    if (!el) return;
    const fmt = moedaAPartirDosDigitos(el.value);
    this[campo] = fmt;
    el.value = fmt;
  }

  onComissaoInput(ev: Event): void {
    const el = ev.target as HTMLInputElement | null;
    if (!el) return;
    const fmt = percentualAPartirDosDigitos(el.value);
    this.comissaoPadrao = fmt;
    el.value = fmt;
  }

  onInteiroInput(
    campo: 'estoqueMinimo' | 'estoqueInicial' | 'unidadeEquivalente',
    ev: Event,
  ): void {
    const el = ev.target as HTMLInputElement | null;
    if (!el) return;
    const digits = String(el.value ?? '').replace(/\D/g, '');
    const v = digits.replace(/^0+(?=\d)/, '') || '0';
    this[campo] = v;
    el.value = v;
  }

  salvar(): void {
    if (this.salvando) return;
    const nome = this.nome.trim();
    if (!nome) {
      this.erro = 'Informe o nome do produto.';
      this.abaAtiva = 'Cadastro';
      return;
    }
    const categoria = this.categoria.trim();
    if (!categoria) {
      this.erro = 'Informe a categoria.';
      this.abaAtiva = 'Cadastro';
      return;
    }
    const foto = this.fotoUrl.trim();
    if (foto && foto.length > ProdutoCadastroDrawerService.FOTO_URL_MAX_CHARS) {
      this.erro =
        'A foto é grande demais para gravar. Escolha outra imagem ou grave sem foto.';
      this.abaAtiva = 'Cadastro';
      return;
    }

    const unidade =
      this.registroSaida === 'em ml'
        ? 'ml'
        : this.registroSaida === 'em gramas'
          ? 'g'
          : 'unidade';

    this.salvando = true;
    this.erro = '';
    const payload = {
      produto: nome,
      categoria,
      marca: this.marca.trim() || null,
      preco: moedaParaPayload(this.precoVenda),
      custo: moedaParaPayload(this.custoCompra),
      estoque_inicial: this.estoqueInicial.trim() || '0',
      estoque_minimo: this.estoqueMinimo.trim() || '0',
      unidade,
      preco_profissional: moedaParaPayload(this.precoProfissional),
      custo_adicional: moedaParaPayload(this.custoAdicional),
      comissao_padrao: percentualParaPayload(this.comissaoPadrao),
      codigo_item: this.codigoItem.trim() || null,
      codigo_barras: this.codigoBarras.trim() || null,
      observacoes: this.observacoes.trim() || null,
      foto_url: foto || null,
    };
    const req$ =
      this.modo === 'editar' && this.editandoId != null
        ? this.api.updateProduto(this.editandoId, payload)
        : this.api.createProduto(payload);
    req$.subscribe({
      next: (item) => {
        this.salvando = false;
        this.toast.show(
          this.modo === 'editar'
            ? 'Produto atualizado com sucesso!'
            : 'Produto criado com sucesso!',
        );
        this.callbacks?.onSalvo?.(item);
        this.salvo$.next(item);
        this.fechar();
      },
      error: (e: unknown) => {
        this.salvando = false;
        this.erro =
          extractApiErrorMessage(e) ||
          'Não foi possível salvar o produto.';
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
              document.getElementById('produto-cadastro-nome')?.focus();
            });
          }
        });
      });
    });
  }

  private preencherForm(item: ProdutoCatalogoItem): void {
    this.nome = String(item.produto ?? '').trim();
    this.categoria = String(item.categoria ?? '').trim();
    this.marca = String(item.marca ?? '').trim();
    this.precoVenda = normalizarMoedaExibicao(item.preco);
    this.custoCompra = normalizarMoedaExibicao(item.custo);
    const u = String(item.unidade ?? '').trim().toLowerCase();
    this.registroSaida =
      u === 'ml' ? 'em ml' : u === 'g' || u === 'gramas' ? 'em gramas' : 'em unidade';
    this.unidadeEquivalente = '1';
    this.estoqueMinimo = String(item.estoque_minimo ?? '0').trim() || '0';
    this.estoqueInicial = String(item.estoque_inicial ?? item.estoque ?? '0').trim() || '0';
    this.precoProfissional = normalizarMoedaExibicao(item.preco_profissional);
    this.custoAdicional = normalizarMoedaExibicao(item.custo_adicional);
    this.comissaoPadrao = normalizarPercentualExibicao(item.comissao_padrao);
    this.codigoItem = String(item.codigo_item ?? '').trim();
    this.codigoBarras = String(item.codigo_barras ?? '').trim();
    this.observacoes = String(item.observacoes ?? '').trim();
    this.fotoUrl = String(item.foto_url ?? '').trim();
  }

  private resetForm(): void {
    this.nome = '';
    this.categoria = '';
    this.marca = '';
    this.precoVenda = '';
    this.custoCompra = '';
    this.registroSaida = 'em unidade';
    this.unidadeEquivalente = '1';
    this.estoqueMinimo = '0';
    this.estoqueInicial = '0';
    this.precoProfissional = '';
    this.custoAdicional = '';
    this.comissaoPadrao = '';
    this.codigoItem = '';
    this.codigoBarras = '';
    this.observacoes = '';
    this.fotoUrl = '';
    this.erro = '';
  }

  private bloquearScrollPagina(): void {
    if (this.pageScrollLockAtivo || typeof document === 'undefined') return;
    this.pageScrollLockAtivo = true;
    this.bodyScrollPreDrawer = window.scrollY || 0;
    document.documentElement.classList.add('drawer-page-scroll-lock');
    document.body.classList.add('drawer-page-scroll-lock');
  }

  private desbloquearScrollPagina(): void {
    if (!this.pageScrollLockAtivo || typeof document === 'undefined') return;
    this.pageScrollLockAtivo = false;
    document.documentElement.classList.remove('drawer-page-scroll-lock');
    document.body.classList.remove('drawer-page-scroll-lock');
    window.scrollTo(0, this.bodyScrollPreDrawer);
  }
}
