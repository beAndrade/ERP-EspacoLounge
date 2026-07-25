import { Injectable, inject, signal } from '@angular/core';
import { Subject } from 'rxjs';
import type { ProdutoCatalogoItem } from '../../core/models/api.models';
import { SheetsApiService } from '../../core/services/sheets-api.service';
import { extractApiErrorMessage } from '../../core/utils/api-error-message';
import {
  moedaAPartirDosDigitos,
  moedaParaPayload,
  percentualAPartirDosDigitos,
  percentualParaPayload,
} from '../../core/utils/brl-digit-input';
import { AppToastService } from '../app-toast/app-toast.service';
import { DRAWER_ANIM_MS } from '../cliente-cadastro-drawer/cliente-cadastro-drawer.service';

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

  readonly salvo$ = new Subject<ProdutoCatalogoItem>();
  readonly aberto = signal(false);
  readonly panelOpen = signal(false);

  modo: 'novo' | 'editar' = 'novo';
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

  abrirNovo(
    opts?: ProdutoDrawerCallbacks & {
      categorias?: string[];
      marcas?: string[];
    },
  ): void {
    this.resetForm();
    this.modo = 'novo';
    this.callbacks = opts ?? null;
    this.categoriasOpcoes = opts?.categorias ?? [];
    this.marcasOpcoes = opts?.marcas ?? [];
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
    this.api
      .createProduto({
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
      })
      .subscribe({
        next: (item) => {
          this.salvando = false;
          this.toast.show('Produto criado com sucesso!');
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
