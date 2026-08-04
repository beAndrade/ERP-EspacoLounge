import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map, catchError, throwError } from 'rxjs';
import type { HttpResponse } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import type { AuthUser, ProfissionalUsuarioPayload } from '../models/auth.models';
import {
  ApiResponse,
  AtendimentoCriadoResumo,
  AtendimentoItemCatalogo,
  AtendimentoListaItem,
  CabeloCatalogoItem,
  CaixaDiaResumo,
  CategoriaCatalogoItem,
  CategoriaFinanceiraItem,
  ComandaPagamentoItem,
  ComandaResumoPagamentos,
  CriarComandaPagamentoPayload,
  FaturarComandaPayload,
  FolhaListaItem,
  RecalcularFolhaComissoesResposta,
  Cliente,
  ClienteCadastroPayload,
  ClienteCreditoMovimento,
  CriarClienteCreditoMovimentoPayload,
  CriarClienteCreditoMovimentoResponse,
  CreateAtendimentoPayload,
  FinComissaoDetalheItem,
  FinComissaoPagaItem,
  FinComissaoResumidaItem,
  FinCategoriaCadastroItem,
  FinFormaPagamentoCadastroItem,
  FinFormaPagamentoOpcaoItem,
  FinTransacaoItem,
  MarcaCatalogoItem,
  MovimentacaoListaItem,
  PacoteCatalogoItem,
  ProdutoCatalogoItem,
  ProdutoWritePayload,
  EstoqueMovimentoItem,
  ProfissionalCadastroPayload,
  ProfissionalComissaoServicoItem,
  ProfissionalListaItem,
  RegraMegaItem,
  Servico,
  ServicoProdutoConsumidoItem,
  ServicoWritePayload,
} from '../models/api.models';
import { enriquecerRotuloPacote } from '../utils/pacote-descricao';
import { extractApiErrorMessage } from '../utils/api-error-message';

@Injectable({ providedIn: 'root' })
export class SheetsApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiBaseUrl.replace(/\/$/, '');

  private url(path: string): string {
    return `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
  }

  getHealth(): Observable<ApiResponse<{ status: string; time?: string }>> {
    return this.http.get<ApiResponse<{ status: string; time?: string }>>(
      this.url('/health'),
    );
  }

  listClientes(): Observable<Cliente[]> {
    return this.http
      .get<ApiResponse<{ items: Cliente[] }>>(this.url('/api/clientes'))
      .pipe(
        map((r) => this.unwrap(r)),
        map((d) => d.items),
      );
  }

  getCliente(clienteId: string): Observable<Cliente> {
    return this.http
      .get<ApiResponse<{ item: Cliente }>>(
        this.url(`/api/clientes/${encodeURIComponent(clienteId)}`),
      )
      .pipe(
        map((r) => this.unwrap(r)),
        map((d) => d.item),
      );
  }

  listClienteCreditoMovimentos(
    clienteId: string,
  ): Observable<ClienteCreditoMovimento[]> {
    return this.http
      .get<ApiResponse<{ items: ClienteCreditoMovimento[] }>>(
        this.url(
          `/api/clientes/${encodeURIComponent(clienteId)}/credito-movimentos`,
        ),
      )
      .pipe(
        map((r) => this.unwrap(r)),
        map((d) => d.items ?? []),
      );
  }

  criarClienteCreditoMovimento(
    clienteId: string,
    body: CriarClienteCreditoMovimentoPayload,
  ): Observable<CriarClienteCreditoMovimentoResponse> {
    return this.http
      .post<ApiResponse<CriarClienteCreditoMovimentoResponse>>(
        this.url(
          `/api/clientes/${encodeURIComponent(clienteId)}/credito-movimentos`,
        ),
        body,
      )
      .pipe(map((r) => this.unwrap(r)));
  }

  listServicos(): Observable<Servico[]> {
    const params = new HttpParams().set('_cb', String(Date.now()));
    return this.http
      .get<ApiResponse<{ items: Servico[] }>>(this.url('/api/servicos'), {
        params,
      })
      .pipe(
        map((r) => this.unwrap(r)),
        map((d) => d.items),
      );
  }

  createServico(body: ServicoWritePayload): Observable<Servico> {
    return this.http
      .post<ApiResponse<{ item: Servico }>>(this.url('/api/servicos'), body)
      .pipe(
        map((r) => this.unwrap(r)),
        map((d) => this.requireServicoItem(d?.item, 'criar')),
      );
  }

  updateServico(id: string, body: ServicoWritePayload): Observable<Servico> {
    return this.http
      .patch<ApiResponse<{ item: Servico }>>(
        this.url(`/api/servicos/${encodeURIComponent(id)}`),
        body,
      )
      .pipe(
        map((r) => this.unwrap(r)),
        map((d) => this.requireServicoItem(d?.item, 'atualizar')),
      );
  }

  deleteServico(id: string): Observable<{ id: string }> {
    return this.http
      .delete<ApiResponse<{ id: string }>>(
        this.url(`/api/servicos/${encodeURIComponent(id)}`),
      )
      .pipe(map((r) => this.unwrap(r)));
  }

  listRegrasMega(): Observable<RegraMegaItem[]> {
    return this.http
      .get<ApiResponse<{ items: RegraMegaItem[] }>>(
        this.url('/api/regras-mega'),
      )
      .pipe(
        map((r) => this.unwrap(r)),
        map((d) => d.items),
      );
  }

  listPacotes(): Observable<PacoteCatalogoItem[]> {
    return this.http
      .get<ApiResponse<{ items: PacoteCatalogoItem[] }>>(
        this.url('/api/pacotes'),
      )
      .pipe(
        map((r) => this.unwrap(r)),
        map((d) => d.items),
      );
  }

  listRegrasMegaQueratina(): Observable<RegraMegaItem[]> {
    return this.http
      .get<ApiResponse<{ items: RegraMegaItem[] }>>(
        this.url('/api/regras-mega-queratina'),
      )
      .pipe(
        map((r) => this.unwrap(r)),
        map((d) => d.items),
      );
  }

  listPacotesQueratina(): Observable<PacoteCatalogoItem[]> {
    return this.http
      .get<ApiResponse<{ items: PacoteCatalogoItem[] }>>(
        this.url('/api/pacotes-queratina'),
      )
      .pipe(
        map((r) => this.unwrap(r)),
        map((d) => d.items),
      );
  }

  listProdutos(): Observable<ProdutoCatalogoItem[]> {
    return this.http
      .get<ApiResponse<{ items: ProdutoCatalogoItem[] }>>(
        this.url('/api/produtos'),
      )
      .pipe(
        map((r) => this.unwrap(r)),
        map((d) => d.items),
      );
  }

  createProduto(payload: ProdutoWritePayload): Observable<ProdutoCatalogoItem> {
    return this.http
      .post<ApiResponse<{ item: ProdutoCatalogoItem }>>(
        this.url('/api/produtos'),
        payload,
      )
      .pipe(
        map((r) => this.unwrap(r)),
        map((d) => d.item),
      );
  }

  updateProduto(
    id: number,
    payload: ProdutoWritePayload,
  ): Observable<ProdutoCatalogoItem> {
    return this.http
      .patch<ApiResponse<{ item: ProdutoCatalogoItem }>>(
        this.url(`/api/produtos/${encodeURIComponent(String(id))}`),
        payload,
      )
      .pipe(
        map((r) => this.unwrap(r)),
        map((d) => d.item),
      );
  }

  deleteProduto(id: number): Observable<{ id: number }> {
    return this.http
      .delete<ApiResponse<{ id: number }>>(
        this.url(`/api/produtos/${encodeURIComponent(String(id))}`),
      )
      .pipe(map((r) => this.unwrap(r)));
  }

  /** Entrada manual no `produtos.estoque` (PATCH). */
  incrementarEstoqueProduto(
    id: number,
    opts: { adicionar?: number; adicionar_unidades?: number },
  ): Observable<{ id: number; produto: string; estoque: string }> {
    return this.http
      .patch<
        ApiResponse<{
          item: { id: number; produto: string; estoque: string };
        }>
      >(
        this.url(
          `/api/produtos/${encodeURIComponent(String(id))}/estoque`,
        ),
        opts,
      )
      .pipe(
        map((r) => this.unwrap(r)),
        map((d) => d.item),
      );
  }

  listEstoqueMovimentos(
    produtoId: number,
  ): Observable<EstoqueMovimentoItem[]> {
    return this.http
      .get<ApiResponse<{ items: EstoqueMovimentoItem[] }>>(
        this.url(
          `/api/produtos/${encodeURIComponent(String(produtoId))}/estoque/movimentos`,
        ),
      )
      .pipe(
        map((r) => this.unwrap(r)),
        map((d) => d.items ?? []),
      );
  }

  listServicoProdutosConsumidos(
    servicoId: number | string,
  ): Observable<ServicoProdutoConsumidoItem[]> {
    return this.http
      .get<ApiResponse<{ items: ServicoProdutoConsumidoItem[] }>>(
        this.url(
          `/api/servicos/${encodeURIComponent(String(servicoId))}/produtos-consumidos`,
        ),
      )
      .pipe(
        map((r) => this.unwrap(r)),
        map((d) => d.items ?? []),
      );
  }

  replaceServicoProdutosConsumidos(
    servicoId: number | string,
    items: { produto_id: number; quantidade: number | string }[],
  ): Observable<ServicoProdutoConsumidoItem[]> {
    return this.http
      .put<ApiResponse<{ items: ServicoProdutoConsumidoItem[] }>>(
        this.url(
          `/api/servicos/${encodeURIComponent(String(servicoId))}/produtos-consumidos`,
        ),
        { items },
      )
      .pipe(
        map((r) => this.unwrap(r)),
        map((d) => d.items ?? []),
      );
  }

  listCabelos(): Observable<CabeloCatalogoItem[]> {
    return this.http
      .get<ApiResponse<{ items: CabeloCatalogoItem[] }>>(
        this.url('/api/cabelos'),
      )
      .pipe(
        map((r) => this.unwrap(r)),
        map((d) => d.items),
      );
  }

  /**
   * Lista profissionais. Por defeito só **ativos** (agenda e novos atendimentos).
   * `incluirInativos` usa `GET /api/profissionais?incluir_inativos=1` (gestão).
   */
  listProfissionais(
    incluirInativos = false,
    contexto?: 'agenda',
  ): Observable<ProfissionalListaItem[]> {
    let params = new HttpParams();
    if (incluirInativos) {
      params = params.set('incluir_inativos', '1');
    }
    if (contexto === 'agenda') {
      params = params.set('contexto', 'agenda');
    }
    const opts = params.keys().length > 0 ? { params } : {};
    return this.http
      .get<ApiResponse<{ items: ProfissionalListaItem[] }>>(
        this.url('/api/profissionais'),
        opts,
      )
      .pipe(
        map((r) => this.unwrap(r)),
        map((d) => d.items),
      );
  }

  reordenarProfissionais(ids: number[]): Observable<void> {
    return this.http
      .patch<ApiResponse<{ ok: boolean }>>(this.url('/api/profissionais/ordem'), {
        ids,
      })
      .pipe(
        map((r) => this.unwrap(r)),
        map(() => undefined),
      );
  }

  getProfissional(id: number): Observable<ProfissionalListaItem> {
    return this.http
      .get<ApiResponse<{ item: ProfissionalListaItem }>>(
        this.url(`/api/profissionais/${encodeURIComponent(String(id))}`),
      )
      .pipe(
        map((r) => this.unwrap(r)),
        map((d) => d.item),
      );
  }

  getProfissionalUsuario(id: number): Observable<AuthUser | null> {
    return this.http
      .get<ApiResponse<{ item: AuthUser | null }>>(
        this.url(
          `/api/profissionais/${encodeURIComponent(String(id))}/usuario`,
        ),
      )
      .pipe(
        map((r) => this.unwrap(r)),
        map((d) => d.item ?? null),
      );
  }

  saveProfissionalUsuario(
    id: number,
    payload: ProfissionalUsuarioPayload,
  ): Observable<AuthUser> {
    return this.http
      .put<ApiResponse<{ item: AuthUser }>>(
        this.url(
          `/api/profissionais/${encodeURIComponent(String(id))}/usuario`,
        ),
        payload,
      )
      .pipe(
        map((r) => this.unwrap(r)),
        map((d) => d.item),
      );
  }

  createProfissional(
    payload: ProfissionalCadastroPayload,
  ): Observable<ProfissionalListaItem> {
    return this.http
      .post<ApiResponse<{ item: ProfissionalListaItem }>>(
        this.url('/api/profissionais'),
        payload,
      )
      .pipe(
        map((r) => this.unwrap(r)),
        map((d) => d.item),
      );
  }

  updateProfissional(
    payload: { id: number } & Partial<ProfissionalCadastroPayload>,
  ): Observable<ProfissionalListaItem> {
    const { id, ...rest } = payload;
    const body = { ...rest };
    return this.http
      .patch<ApiResponse<{ item: ProfissionalListaItem }>>(
        this.url(`/api/profissionais/${encodeURIComponent(String(id))}`),
        body,
      )
      .pipe(
        map((r) => this.unwrap(r)),
        map((d) => d.item),
      );
  }

  listProfissionalComissaoServicos(
    profissionalId: number,
  ): Observable<ProfissionalComissaoServicoItem[]> {
    return this.http
      .get<ApiResponse<{ items: ProfissionalComissaoServicoItem[] }>>(
        this.url(
          `/api/profissionais/${encodeURIComponent(String(profissionalId))}/comissoes-servicos`,
        ),
      )
      .pipe(
        map((r) => this.unwrap(r)),
        map((d) => d.items),
      );
  }

  replaceProfissionalComissaoServicos(
    profissionalId: number,
    items: Pick<
      ProfissionalComissaoServicoItem,
      'servico_id' | 'tipo' | 'valor' | 'como_auxiliar' | 'sobre'
    >[],
  ): Observable<ProfissionalComissaoServicoItem[]> {
    return this.http
      .put<ApiResponse<{ items: ProfissionalComissaoServicoItem[] }>>(
        this.url(
          `/api/profissionais/${encodeURIComponent(String(profissionalId))}/comissoes-servicos`,
        ),
        { items },
      )
      .pipe(
        map((r) => this.unwrap(r)),
        map((d) => d.items),
      );
  }

  importarProfissionalComissaoServicosCatalogo(
    profissionalId: number,
  ): Observable<{ importados: number; items: ProfissionalComissaoServicoItem[] }> {
    return this.http
      .post<
        ApiResponse<{ importados: number; items: ProfissionalComissaoServicoItem[] }>
      >(
        this.url(
          `/api/profissionais/${encodeURIComponent(String(profissionalId))}/comissoes-servicos/importar-catalogo`,
        ),
        {},
      )
      .pipe(map((r) => this.unwrap(r)));
  }

  listAgendamentos(
    dataInicio?: string,
    dataFim?: string,
    idAtendimento?: string,
    /** Quando true, só pedidos com `atendimentos.inicio` (agenda com horário). */
    somenteComHorario?: boolean,
    /** `producao` (default) | `orcamento` | `todos`. */
    modo?: 'producao' | 'orcamento' | 'todos',
  ): Observable<AtendimentoListaItem[]> {
    let params = new HttpParams().set('_cb', String(Date.now()));
    if (dataInicio) params = params.set('dataInicio', dataInicio);
    if (dataFim) params = params.set('dataFim', dataFim);
    if (idAtendimento?.trim()) {
      params = params.set('idAtendimento', idAtendimento.trim());
    }
    if (somenteComHorario) {
      params = params.set('somenteComHorario', '1');
    }
    if (modo && modo !== 'producao') {
      params = params.set('modo', modo);
    }
    return this.http
      .get<ApiResponse<{ items: Record<string, unknown>[] }>>(
        this.url('/api/atendimentos'),
        { params },
      )
      .pipe(
        map((r) => this.unwrap(r)),
        map((d) =>
          d.items.map((row) => this.normalizeAtendimento(row)),
        ),
      );
  }

  /**
   * Lista só o pedido por `id_atendimento`, com parâmetro extra para evitar
   * resposta em cache do browser após excluir/recriar o mesmo ID na edição.
   */
  listAgendamentosPorIdParaEdicao(idAtendimento: string): Observable<AtendimentoListaItem[]> {
    const id = idAtendimento.trim();
    const params = new HttpParams()
      .set('idAtendimento', id)
      .set('_cb', String(Date.now()));
    return this.http
      .get<ApiResponse<{ items: Record<string, unknown>[] }>>(
        this.url('/api/atendimentos'),
        { params },
      )
      .pipe(
        map((r) => this.unwrap(r)),
        map((d) => d.items.map((row) => this.normalizeAtendimento(row))),
      );
  }

  listCategoriasFinanceiras(): Observable<CategoriaFinanceiraItem[]> {
    return this.http
      .get<ApiResponse<{ items: CategoriaFinanceiraItem[] }>>(
        this.url('/api/categorias-financeiras'),
      )
      .pipe(
        map((r) => this.unwrap(r)),
        map((d) => d.items),
      );
  }

  listCategoriasCatalogo(incluirInativas = false): Observable<CategoriaCatalogoItem[]> {
    let params = new HttpParams();
    if (incluirInativas) params = params.set('incluir_inativas', '1');
    return this.http
      .get<ApiResponse<{ items: CategoriaCatalogoItem[] }>>(
        this.url('/api/categorias'),
        { params },
      )
      .pipe(
        map((r) => this.unwrap(r)),
        map((d) => d.items),
      );
  }

  criarCategoriaCatalogo(body: {
    nome: string;
    ativo?: boolean;
  }): Observable<{ id: number }> {
    return this.http
      .post<ApiResponse<{ id: number }>>(this.url('/api/categorias'), body)
      .pipe(map((r) => this.unwrap(r)));
  }

  atualizarCategoriaCatalogo(
    id: number,
    body: { nome?: string; ativo?: boolean },
  ): Observable<{ ok: boolean }> {
    return this.http
      .patch<ApiResponse<{ ok: boolean }>>(
        this.url(`/api/categorias/${id}`),
        body,
      )
      .pipe(map((r) => this.unwrap(r)));
  }

  excluirCategoriaCatalogo(
    id: number,
  ): Observable<{ ok: boolean; result?: string }> {
    return this.http
      .delete<ApiResponse<{ ok: boolean; result?: string }>>(
        this.url(`/api/categorias/${id}`),
      )
      .pipe(map((r) => this.unwrap(r)));
  }

  listMarcasCatalogo(incluirInativas = false): Observable<MarcaCatalogoItem[]> {
    let params = new HttpParams();
    if (incluirInativas) params = params.set('incluir_inativas', '1');
    return this.http
      .get<ApiResponse<{ items: MarcaCatalogoItem[] }>>(
        this.url('/api/marcas'),
        { params },
      )
      .pipe(
        map((r) => this.unwrap(r)),
        map((d) => d.items),
      );
  }

  criarMarcaCatalogo(body: {
    nome: string;
    ativo?: boolean;
  }): Observable<{ id: number }> {
    return this.http
      .post<ApiResponse<{ id: number }>>(this.url('/api/marcas'), body)
      .pipe(map((r) => this.unwrap(r)));
  }

  atualizarMarcaCatalogo(
    id: number,
    body: { nome?: string; ativo?: boolean },
  ): Observable<{ ok: boolean }> {
    return this.http
      .patch<ApiResponse<{ ok: boolean }>>(
        this.url(`/api/marcas/${id}`),
        body,
      )
      .pipe(map((r) => this.unwrap(r)));
  }

  excluirMarcaCatalogo(
    id: number,
  ): Observable<{ ok: boolean; result?: string }> {
    return this.http
      .delete<ApiResponse<{ ok: boolean; result?: string }>>(
        this.url(`/api/marcas/${id}`),
      )
      .pipe(map((r) => this.unwrap(r)));
  }

  listFinCategoriasCadastro(incluirInativas = false): Observable<FinCategoriaCadastroItem[]> {
    let params = new HttpParams();
    if (incluirInativas) params = params.set('incluir_inativas', '1');
    return this.http
      .get<ApiResponse<{ items: FinCategoriaCadastroItem[] }>>(
        this.url('/api/financeiro/categorias'),
        { params },
      )
      .pipe(
        map((r) => this.unwrap(r)),
        map((d) => d.items),
      );
  }

  criarFinCategoria(body: {
    nome: string;
    natureza: 'receita' | 'despesa';
  }): Observable<{ id: number }> {
    return this.http
      .post<ApiResponse<{ id: number }>>(
        this.url('/api/financeiro/categorias'),
        body,
      )
      .pipe(map((r) => this.unwrap(r)));
  }

  atualizarFinCategoria(
    id: number,
    body: { nome?: string; natureza?: 'receita' | 'despesa' },
  ): Observable<{ ok: boolean }> {
    return this.http
      .patch<ApiResponse<{ ok: boolean }>>(
        this.url(`/api/financeiro/categorias/${id}`),
        body,
      )
      .pipe(map((r) => this.unwrap(r)));
  }

  excluirFinCategoria(id: number): Observable<{ ok: boolean; result?: string }> {
    return this.http
      .delete<ApiResponse<{ ok: boolean; result?: string }>>(
        this.url(`/api/financeiro/categorias/${id}`),
      )
      .pipe(map((r) => this.unwrap(r)));
  }

  listFinFormasPagamento(incluirInativas = false): Observable<FinFormaPagamentoCadastroItem[]> {
    let params = new HttpParams();
    if (incluirInativas) params = params.set('incluir_inativas', '1');
    return this.http
      .get<ApiResponse<{ items: FinFormaPagamentoCadastroItem[] }>>(
        this.url('/api/financeiro/formas-pagamento'),
        { params },
      )
      .pipe(
        map((r) => this.unwrap(r)),
        map((d) => d.items),
      );
  }

  listFinFormasPagamentoOpcoes(): Observable<FinFormaPagamentoOpcaoItem[]> {
    return this.http
      .get<ApiResponse<{ items: FinFormaPagamentoOpcaoItem[] }>>(
        this.url('/api/financeiro/formas-pagamento/opcoes'),
      )
      .pipe(
        map((r) => this.unwrap(r)),
        map((d) => d.items),
      );
  }

  criarFinFormaPagamento(body: {
    nome: string;
    baixa_automatica?: boolean;
    taxa_percentual?: number;
    taxa_fixa?: number;
    prazo_recebimento?: number;
    ativo?: boolean;
  }): Observable<{ id: number }> {
    return this.http
      .post<ApiResponse<{ id: number }>>(
        this.url('/api/financeiro/formas-pagamento'),
        body,
      )
      .pipe(map((r) => this.unwrap(r)));
  }

  atualizarFinFormaPagamento(
    id: number,
    body: {
      nome?: string;
      baixa_automatica?: boolean;
      taxa_percentual?: number;
      taxa_fixa?: number;
      prazo_recebimento?: number;
      ativo?: boolean;
      prazos_faixas?: {
        parcelas_de: number;
        parcelas_ate: number;
        dias_ate_primeira: number;
        intervalo_dias: number;
        taxa_percentual?: number | null;
        juros_cliente?: boolean;
      }[];
    },
  ): Observable<{ ok: boolean }> {
    return this.http
      .patch<ApiResponse<{ ok: boolean }>>(
        this.url(`/api/financeiro/formas-pagamento/${id}`),
        body,
      )
      .pipe(map((r) => this.unwrap(r)));
  }

  excluirFinFormaPagamento(id: number): Observable<{ ok: boolean; result?: string }> {
    return this.http
      .delete<ApiResponse<{ ok: boolean; result?: string }>>(
        this.url(`/api/financeiro/formas-pagamento/${id}`),
      )
      .pipe(map((r) => this.unwrap(r)));
  }

  listComissoesResumidas(params: {
    dataInicio: string;
    dataFim: string;
    profissionalId?: number | null;
  }): Observable<FinComissaoResumidaItem[]> {
    let hp = new HttpParams()
      .set('dataInicio', params.dataInicio)
      .set('dataFim', params.dataFim);
    const profId = params.profissionalId;
    if (profId != null && profId > 0) {
      hp = hp.set('profissionalId', String(profId));
    }
    return this.http
      .get<ApiResponse<{ items: FinComissaoResumidaItem[] }>>(
        this.url('/api/financeiro/comissoes/resumidas'),
        { params: hp },
      )
      .pipe(
        map((r) => this.unwrap(r)),
        map((d) => d.items),
      );
  }

  listComissoesPagas(params: {
    dataInicio: string;
    dataFim: string;
    profissionalId?: number | null;
  }): Observable<FinComissaoPagaItem[]> {
    let hp = new HttpParams()
      .set('dataInicio', params.dataInicio)
      .set('dataFim', params.dataFim);
    const profId = params.profissionalId;
    if (profId != null && profId > 0) {
      hp = hp.set('profissionalId', String(profId));
    }
    return this.http
      .get<ApiResponse<{ items: FinComissaoPagaItem[] }>>(
        this.url('/api/financeiro/comissoes/pagas'),
        { params: hp },
      )
      .pipe(
        map((r) => this.unwrap(r)),
        map((d) => d.items),
      );
  }

  listComissoesDetalhadas(params: {
    dataInicio: string;
    dataFim: string;
    profissionalId: number;
    mostrarAnteriores?: boolean;
  }): Observable<FinComissaoDetalheItem[]> {
    let hp = new HttpParams()
      .set('dataInicio', params.dataInicio)
      .set('dataFim', params.dataFim)
      .set('profissionalId', String(params.profissionalId));
    if (params.mostrarAnteriores) {
      hp = hp.set('mostrarAnteriores', '1');
    }
    return this.http
      .get<ApiResponse<{ items: FinComissaoDetalheItem[] }>>(
        this.url('/api/financeiro/comissoes/detalhadas'),
        { params: hp },
      )
      .pipe(
        map((r) => this.unwrap(r)),
        map((d) => d.items),
      );
  }

  pagarComissoes(body: {
    profissional_id: number;
    data_pagamento: string;
    atendimento_ids: number[];
    pagamentos: { metodo: string; valor: number }[];
  }): Observable<{ movimentacao_ids: number[]; total_comissao: number }> {
    const fallbackTotal = Math.round(
      body.pagamentos.reduce((s, p) => s + Number(p.valor), 0) * 100,
    ) / 100;
    return this.postEnvelope<{ movimentacao_ids: number[]; total_comissao: number }>(
      '/api/financeiro/comissoes/pagar',
      body,
      () => ({ movimentacao_ids: [], total_comissao: fallbackTotal }),
    );
  }

  estornarComissaoMovimentacao(movimentacaoId: number): Observable<{ ok: boolean }> {
    return this.postEnvelope<{ ok: boolean }>(
      '/api/financeiro/comissoes/estornar',
      { movimentacao_id: movimentacaoId },
      () => ({ ok: true }),
    );
  }

  excluirComissaoMovimentacao(movimentacaoId: number): Observable<{ ok: boolean }> {
    return this.postEnvelope<{ ok: boolean }>(
      '/api/financeiro/comissoes/excluir',
      { movimentacao_id: movimentacaoId },
      () => ({ ok: true }),
    );
  }

  pagarMovimentacaoTransacao(
    movimentacaoId: number,
    dataPagamento: string,
  ): Observable<{ ok: boolean }> {
    return this.postEnvelope<{ ok: boolean }>(
      `/api/financeiro/transacoes/movimentacoes/${encodeURIComponent(String(movimentacaoId))}/pagar`,
      { data_pagamento: dataPagamento },
      () => ({ ok: true }),
    );
  }

  estornarMovimentacaoTransacao(movimentacaoId: number): Observable<{ ok: boolean }> {
    return this.postEnvelope<{ ok: boolean }>(
      `/api/financeiro/transacoes/movimentacoes/${encodeURIComponent(String(movimentacaoId))}/estornar`,
      {},
      () => ({ ok: true }),
    );
  }

  pagarPendenciaTransacao(
    comandaPagamentoId: number,
    dataPagamento: string,
  ): Observable<{ ok: boolean }> {
    return this.postEnvelope<{ ok: boolean }>(
      `/api/financeiro/transacoes/pendencias/${encodeURIComponent(String(comandaPagamentoId))}/pagar`,
      { data_pagamento: dataPagamento },
      () => ({ ok: true }),
    );
  }

  listTransacoesFinanceiras(params: {
    dataInicio: string;
    dataFim: string;
    tipoData?: 'vencimento' | 'competencia' | 'pagamento';
  }): Observable<FinTransacaoItem[]> {
    let hp = new HttpParams()
      .set('dataInicio', params.dataInicio)
      .set('dataFim', params.dataFim);
    if (params.tipoData && params.tipoData !== 'vencimento') {
      hp = hp.set('tipoData', params.tipoData);
    }
    return this.http
      .get<ApiResponse<{ items: FinTransacaoItem[] }>>(
        this.url('/api/financeiro/transacoes'),
        { params: hp },
      )
      .pipe(
        map((r) => this.unwrap(r)),
        map((d) => d.items),
      );
  }

  createMovimentacao(payload: {
    data_mov: string;
    natureza: 'receita' | 'despesa';
    valor: number;
    categoria_id: number;
    descricao?: string;
    metodo_pagamento?: string;
    id_atendimento?: string;
  }): Observable<{ id: number }> {
    return this.http
      .post<ApiResponse<{ id: number }>>(this.url('/api/movimentacoes'), payload)
      .pipe(map((r) => this.unwrap(r)));
  }

  listMovimentacoes(params: {
    dataInicio: string;
    dataFim: string;
    natureza?: 'receita' | 'despesa';
  }): Observable<MovimentacaoListaItem[]> {
    let hp = new HttpParams()
      .set('dataInicio', params.dataInicio)
      .set('dataFim', params.dataFim);
    if (params.natureza) hp = hp.set('natureza', params.natureza);
    return this.http
      .get<ApiResponse<{ items: MovimentacaoListaItem[] }>>(
        this.url('/api/movimentacoes'),
        { params: hp },
      )
      .pipe(
        map((r) => this.unwrap(r)),
        map((d) => d.items),
      );
  }

  patchMovimentacao(
    id: number,
    body: {
      valor?: number;
      descricao?: string | null;
      categoria_id?: number;
      metodo_pagamento?: string | null;
      data_mov?: string;
      pago_em?: string | null;
    },
  ): Observable<{ ok: boolean }> {
    return this.http
      .patch<ApiResponse<{ ok: boolean }>>(
        this.url(`/api/movimentacoes/${encodeURIComponent(String(id))}`),
        body,
      )
      .pipe(map((r) => this.unwrap(r)));
  }

  deleteMovimentacao(id: number): Observable<{ ok: boolean }> {
    return this.http
      .delete<ApiResponse<{ ok: boolean }>>(
        this.url(`/api/movimentacoes/${encodeURIComponent(String(id))}`),
      )
      .pipe(map((r) => this.unwrap(r)));
  }

  getCaixaDia(data: string): Observable<CaixaDiaResumo> {
    const params = new HttpParams().set('data', data.trim().slice(0, 10));
    return this.http
      .get<ApiResponse<CaixaDiaResumo>>(this.url('/api/caixa/dia'), {
        params,
      })
      .pipe(map((r) => this.unwrap(r)));
  }

  /** Valida admin + PIN sem carregar dados financeiros. */
  verificarFinanceiroPin(): Observable<{ ok: true }> {
    return this.http
      .post<ApiResponse<{ ok: true }>>(
        this.url('/api/financeiro/verificar-pin'),
        {},
      )
      .pipe(
        map((r) => this.unwrap(r)),
        catchError((err) =>
          throwError(
            () =>
              new Error(
                extractApiErrorMessage(err, 'PIN inválido. Tente novamente.'),
              ),
          ),
        ),
      );
  }

  /** Folha por competência; requer `ADMIN_PIN` no servidor e PIN em `AdminPinService`. */
  listFolha(periodoYm: string): Observable<FolhaListaItem[]> {
    const params = new HttpParams().set(
      'periodo',
      periodoYm.trim().slice(0, 7),
    );
    return this.http
      .get<ApiResponse<{ items: FolhaListaItem[] }>>(this.url('/api/folha'), {
        params,
      })
      .pipe(
        map((r) => this.unwrap(r)),
        map((d) => d.items),
      );
  }

  recalcularFolhaComissoes(
    periodoYm: string,
    profissionalId?: number,
  ): Observable<RecalcularFolhaComissoesResposta> {
    const body: { periodo: string; profissional_id?: number } = {
      periodo: periodoYm.trim().slice(0, 7),
    };
    if (
      profissionalId != null &&
      Number.isFinite(profissionalId) &&
      profissionalId > 0
    ) {
      body.profissional_id = profissionalId;
    }
    return this.http
      .post<ApiResponse<RecalcularFolhaComissoesResposta>>(
        this.url('/api/folha/recalcular-comissoes'),
        body,
      )
      .pipe(map((r) => this.unwrap(r)));
  }

  /** Regista despesa: grava `movimentacoes` + detalhe em `despesas` (valor único na movimentação). */
  createDespesa(payload: {
    data_mov: string;
    valor: number;
    categoria_id: number;
    descricao?: string;
    metodo_pagamento?: string;
    tipo?: string;
    categoria_livre?: string;
  }): Observable<{ movimentacao_id: number; despesa_id: number }> {
    return this.http
      .post<
        ApiResponse<{ movimentacao_id: number; despesa_id: number }>
      >(this.url('/api/despesas'), payload)
      .pipe(map((r) => this.unwrap(r)));
  }

  createCliente(
    payload: ClienteCadastroPayload,
  ): Observable<Cliente> {
    return this.http
      .post<ApiResponse<Cliente | { item: Cliente }>>(
        this.url('/api/clientes'),
        payload,
      )
      .pipe(
        map((raw) => this.unwrap(raw)),
        map((d) => this.normalizarClienteResposta(d)),
      );
  }

  updateCliente(
    payload: ClienteCadastroPayload & { cliente_id: string },
  ): Observable<Cliente> {
    const { cliente_id, ...body } = payload;
    return this.http
      .patch<ApiResponse<Cliente | { item: Cliente }>>(
        this.url(`/api/clientes/${encodeURIComponent(cliente_id)}`),
        body,
      )
      .pipe(
        map((raw) => this.unwrap(raw)),
        map((d) => this.normalizarClienteResposta(d)),
      );
  }

  /** POST/PATCH devolvem cliente plano; GET usa `{ item }`. */
  private normalizarClienteResposta(d: Cliente | { item: Cliente }): Cliente {
    if (d && typeof d === 'object' && 'item' in d) {
      const wrapped = (d as { item: Cliente }).item;
      if (wrapped?.id?.trim()) return wrapped;
    }
    const flat = d as Cliente;
    if (flat?.id?.trim()) return flat;
    throw new Error('Resposta do servidor sem dados do cliente.');
  }

  deleteCliente(clienteId: string): Observable<void> {
    return this.http
      .delete<ApiResponse<{ ok: boolean }>>(
        this.url(`/api/clientes/${encodeURIComponent(clienteId)}`),
      )
      .pipe(map((raw) => this.unwrap(raw)), map(() => undefined));
  }

  createAgendamento(
    payload: CreateAtendimentoPayload,
  ): Observable<AtendimentoCriadoResumo> {
    return this.http
      .post<ApiResponse<AtendimentoCriadoResumo>>(
        this.url('/api/atendimentos'),
        payload,
      )
      .pipe(map((raw) => this.unwrap(raw)));
  }

  atualizarStatusOrcamento(
    idAtendimento: string,
    status: 'rascunho' | 'enviado' | 'arquivado',
  ): Observable<{ id_atendimento: string; orcamento_status: string }> {
    const id = encodeURIComponent(idAtendimento.trim());
    return this.http
      .post<
        ApiResponse<{ id_atendimento: string; orcamento_status: string }>
      >(this.url(`/api/orcamentos/${id}/status`), { status })
      .pipe(map((raw) => this.unwrap(raw)));
  }

  converterOrcamento(
    idAtendimento: string,
    payload: {
      data: string;
      inicio?: string;
      agenda_status?: string;
      cliente_id?: string;
    },
  ): Observable<{
    id_atendimento: string;
    modo: string;
    data: string;
    inicio: string;
    fim: string;
  }> {
    const id = encodeURIComponent(idAtendimento.trim());
    return this.http
      .post<
        ApiResponse<{
          id_atendimento: string;
          modo: string;
          data: string;
          inicio: string;
          fim: string;
        }>
      >(this.url(`/api/orcamentos/${id}/converter`), payload)
      .pipe(map((raw) => this.unwrap(raw)));
  }

  /** Marca o atendimento (todas as linhas com o mesmo id) como pronto para cobrança. */
  finalizarCobranca(
    idAtendimento: string,
    descontoReais?: string,
  ): Observable<{ atualizadas: number }> {
    const params = new HttpParams().set('acao', 'finalizar');
    const body: { id_atendimento: string; desconto?: string } = {
      id_atendimento: idAtendimento,
    };
    const d = String(descontoReais ?? '').trim();
    if (d) body.desconto = d;
    return this.http
      .post<ApiResponse<{ atualizadas: number }>>(
        this.url('/api/atendimentos'),
        body,
        { params },
      )
      .pipe(map((raw) => this.unwrap(raw)));
  }

  confirmarPagamento(
    idAtendimento: string,
    metodoPagamento: string,
  ): Observable<{ atualizadas: number; movimentacao_id?: number | null }> {
    const params = new HttpParams().set('acao', 'confirmar-pagamento');
    const met = String(metodoPagamento || '').trim();
    return this.http
      .post<
        ApiResponse<{
          atualizadas: number;
          movimentacao_id?: number | null;
        }>
      >(this.url('/api/atendimentos'), { id_atendimento: idAtendimento, metodo: met }, { params })
      .pipe(map((raw) => this.unwrap(raw)));
  }

  remarcarAgendamento(payload: {
    id_atendimento: string;
    profissional_origem_id: number;
    profissional_destino_id: number;
    data: string;
    hora_inicio: string;
  }): Observable<{ linhas_atualizadas: number }> {
    const params = new HttpParams().set('acao', 'remarcar');
    return this.http
      .post<ApiResponse<{ linhas_atualizadas: number }>>(
        this.url('/api/atendimentos'),
        { ...payload, acao: 'remarcar' },
        { params },
      )
      .pipe(map((raw) => this.unwrap(raw)));
  }

  /** Atualiza `agenda_status` de todas as linhas do atendimento. */
  atualizarAgendaStatus(
    idAtendimento: string,
    agendaStatus: string,
  ): Observable<{ linhas_atualizadas: number }> {
    const params = new HttpParams().set('acao', 'agenda-status');
    return this.http
      .post<ApiResponse<{ linhas_atualizadas: number }>>(
        this.url('/api/atendimentos'),
        {
          acao: 'agenda-status',
          id_atendimento: idAtendimento,
          agenda_status: agendaStatus,
        },
        { params },
      )
      .pipe(map((raw) => this.unwrap(raw)));
  }

  /** Atualiza `agenda_cor` (hex ou null para remover). */
  atualizarAgendaCor(
    idAtendimento: string,
    agendaCor: string | null,
  ): Observable<{ linhas_atualizadas: number }> {
    const params = new HttpParams().set('acao', 'agenda-cor');
    return this.http
      .post<ApiResponse<{ linhas_atualizadas: number }>>(
        this.url('/api/atendimentos'),
        {
          acao: 'agenda-cor',
          id_atendimento: idAtendimento,
          agenda_cor: agendaCor,
        },
        { params },
      )
      .pipe(map((raw) => this.unwrap(raw)));
  }

  excluirAtendimento(
    idAtendimento: string,
    opts?: {
      manterCabecalhoPedido?: boolean;
      modoExclusao?: 'somente_comanda' | 'completo';
    },
  ): Observable<{ removidas: number }> {
    const params = new HttpParams().set('acao', 'excluir');
    const body: Record<string, unknown> = {
      id_atendimento: idAtendimento,
      acao: 'excluir',
    };
    if (opts?.modoExclusao) {
      body['modo_exclusao'] = opts.modoExclusao;
    } else if (opts?.manterCabecalhoPedido) {
      body['manter_cabecalho_pedido'] = true;
    }
    return this.http
      .post<ApiResponse<{ removidas: number }>>(
        this.url('/api/atendimentos'),
        body,
        { params },
      )
      .pipe(map((raw) => this.unwrap(raw)));
  }

  /** Lista os pagamentos da comanda + resumo financeiro derivado. */
  listComandaPagamentos(
    idAtendimento: string,
  ): Observable<{
    items: ComandaPagamentoItem[];
    resumo: ComandaResumoPagamentos;
  }> {
    const params = new HttpParams().set('_cb', String(Date.now()));
    return this.http
      .get<
        ApiResponse<{
          items: ComandaPagamentoItem[];
          resumo: ComandaResumoPagamentos;
        }>
      >(
        this.url(
          `/api/comandas/${encodeURIComponent(idAtendimento)}/pagamentos`,
        ),
        { params },
      )
      .pipe(map((raw) => this.unwrap(raw)));
  }

  /**
   * Cria 1 pagamento (parcial ou total) na comanda. A API gera a movimentação
   * financeira correspondente e devolve o resumo atualizado.
   */
  criarComandaPagamento(
    idAtendimento: string,
    payload: CriarComandaPagamentoPayload,
  ): Observable<{
    pagamento: ComandaPagamentoItem;
    resumo: ComandaResumoPagamentos;
  }> {
    return this.http
      .post<
        ApiResponse<{
          pagamento: ComandaPagamentoItem;
          resumo: ComandaResumoPagamentos;
        }>
      >(
        this.url(
          `/api/comandas/${encodeURIComponent(idAtendimento)}/pagamentos`,
        ),
        payload,
      )
      .pipe(map((raw) => this.unwrap(raw)));
  }

  /**
   * Grava o desconto da comanda (`desconto_comanda`) sem finalizar a cobrança.
   * Usado no Salvar da comanda e ao abrir Faturar.
   */
  aplicarDescontoComanda(
    idAtendimento: string,
    descontoReais: string,
  ): Observable<{ atualizadas: number; resumo: ComandaResumoPagamentos }> {
    return this.http
      .patch<
        ApiResponse<{ atualizadas: number; resumo: ComandaResumoPagamentos }>
      >(
        this.url(
          `/api/comandas/${encodeURIComponent(idAtendimento)}/desconto`,
        ),
        { desconto: descontoReais },
      )
      .pipe(map((raw) => this.unwrap(raw)));
  }

  /**
   * Grava vários pagamentos da comanda, finaliza cobrança se necessário
   * e devolve lista + resumo atualizados.
   */
  faturarComanda(
    idAtendimento: string,
    payload: FaturarComandaPayload,
  ): Observable<{
    items: ComandaPagamentoItem[];
    resumo: ComandaResumoPagamentos;
  }> {
    return this.http
      .post<
        ApiResponse<{
          items: ComandaPagamentoItem[];
          resumo: ComandaResumoPagamentos;
        }>
      >(
        this.url(
          `/api/comandas/${encodeURIComponent(idAtendimento)}/faturar`,
        ),
        payload,
      )
      .pipe(map((raw) => this.unwrap(raw)));
  }

  /** Remove 1 pagamento + sua movimentação. Devolve o resumo atualizado. */
  excluirComandaPagamento(
    idAtendimento: string,
    pagamentoId: number,
  ): Observable<{ resumo: ComandaResumoPagamentos }> {
    return this.http
      .delete<ApiResponse<{ resumo: ComandaResumoPagamentos }>>(
        this.url(
          `/api/comandas/${encodeURIComponent(idAtendimento)}/pagamentos/${pagamentoId}`,
        ),
      )
      .pipe(map((raw) => this.unwrap(raw)));
  }

  /** Actualiza a data de 1 pagamento (+ movimentação ligada, se houver). */
  atualizarDataComandaPagamento(
    idAtendimento: string,
    pagamentoId: number,
    dataPagamento: string,
  ): Observable<{
    pagamento: ComandaPagamentoItem;
    resumo: ComandaResumoPagamentos;
  }> {
    return this.http
      .patch<
        ApiResponse<{
          pagamento: ComandaPagamentoItem;
          resumo: ComandaResumoPagamentos;
        }>
      >(
        this.url(
          `/api/comandas/${encodeURIComponent(idAtendimento)}/pagamentos/${pagamentoId}`,
        ),
        { data_pagamento: dataPagamento },
      )
      .pipe(map((raw) => this.unwrap(raw)));
  }

  /** Actualiza `atendimentos.data` (e opcionalmente datas dos pagamentos). */
  atualizarDataComanda(
    idAtendimento: string,
    dataYmd: string,
    atualizarPagamentos = false,
  ): Observable<{
    data: string;
    pagamentosAtualizados: number;
    resumo: ComandaResumoPagamentos;
  }> {
    return this.http
      .patch<
        ApiResponse<{
          data: string;
          pagamentosAtualizados: number;
          resumo: ComandaResumoPagamentos;
        }>
      >(
        this.url(
          `/api/comandas/${encodeURIComponent(idAtendimento)}/data-comanda`,
        ),
        {
          data: dataYmd,
          atualizar_pagamentos: atualizarPagamentos,
        },
      )
      .pipe(map((raw) => this.unwrap(raw)));
  }

  private normalizeAtendimento(raw: Record<string, unknown>): AtendimentoListaItem {
    const descricaoApi = String(raw['Descrição'] ?? raw['Descricao'] ?? '').trim();
    const descManual = String(
      raw['Descrição Manual'] ?? raw['Descricao Manual'] ?? '',
    ).trim();
    const servicos = String(raw['Serviços'] ?? raw['Servicos'] ?? '').trim();
    const tipo = String(raw['Tipo'] ?? '').trim();
    const pacote = String(raw['Pacote'] ?? '').trim();
    const etapa = String(raw['Etapa'] ?? '').trim();
    const produto = String(raw['Produto'] ?? '').trim();

    let descricao = descricaoApi;
    if (!descricao) {
      descricao = descManual || servicos;
      const tipoN = tipo.toLowerCase();
      if (!descricao && (tipoN === 'pacote' || tipoN === 'mega')) {
        const parts = [pacote, etapa].filter(Boolean);
        if (parts.length) descricao = parts.join(' · ');
      }
      if (!descricao && produto) descricao = produto;
    }

    descricao = enriquecerRotuloPacote({
      texto: descricao,
      tipo,
      pacote,
      etapa,
    });

    const cs = raw['cobranca_status'];
    const cobrancaStatus =
      cs === undefined || cs === null
        ? null
        : String(cs).trim() || null;

    const ps = raw['pagamento_status'];
    const pagamentoStatus =
      ps === undefined || ps === null
        ? null
        : String(ps).trim() || null;

    const pagamentoMetodo = this.pickPagamentoMetodoFromRow(raw);

    const agSt = raw['agenda_status'];
    const agenda_status =
      agSt === undefined || agSt === null
        ? null
        : String(agSt).trim() || null;
    const agCr = raw['agenda_cor'];
    const agenda_cor =
      agCr === undefined || agCr === null
        ? null
        : String(agCr).trim() || null;

    const profissional_id = this.parseProfissionalIdCell(
      raw['profissional_id'] ?? raw['Profissional ID'],
    );

    const itensRaw = raw['itens_catalogo'] ?? raw['itens'];
    let itens_catalogo: AtendimentoItemCatalogo[] | undefined;
    if (Array.isArray(itensRaw)) {
      itens_catalogo = itensRaw
        .map((x) => {
          if (!x || typeof x !== 'object') return null;
          const o = x as Record<string, unknown>;
          const tipo = o['tipo'];
          const tiposOk = new Set([
            'servico',
            'produto',
            'mega',
            'pacote',
            'cabelo',
          ]);
          if (!tiposOk.has(String(tipo))) return null;
          const base = {
            tipo: tipo as AtendimentoItemCatalogo['tipo'],
            servico_id:
              o['servico_id'] != null ? Number(o['servico_id']) : null,
            produto_id:
              o['produto_id'] != null ? Number(o['produto_id']) : null,
            quantidade: Math.max(1, Number(o['quantidade']) || 1),
            profissional_id:
              o['profissional_id'] != null
                ? Number(o['profissional_id'])
                : null,
            tamanho:
              o['tamanho'] != null && String(o['tamanho']).trim()
                ? String(o['tamanho']).trim()
                : null,
          };
          const pacote =
            o['pacote'] != null && String(o['pacote']).trim()
              ? String(o['pacote']).trim()
              : null;
          const etapa =
            o['etapa'] != null && String(o['etapa']).trim()
              ? String(o['etapa']).trim()
              : null;
          const detalhes =
            o['detalhes'] != null && String(o['detalhes']).trim()
              ? String(o['detalhes']).trim()
              : null;
          const regra_mega_id =
            o['regra_mega_id'] != null && Number.isFinite(Number(o['regra_mega_id']))
              ? Number(o['regra_mega_id'])
              : null;
          const pacote_id =
            o['pacote_id'] != null && Number.isFinite(Number(o['pacote_id']))
              ? Number(o['pacote_id'])
              : null;
          const valor_unitario =
            o['valor_unitario'] != null && String(o['valor_unitario']).trim()
              ? String(o['valor_unitario']).trim()
              : null;
          const descontoItem =
            o['desconto'] != null && String(o['desconto']).trim()
              ? String(o['desconto']).trim()
              : null;
          const totalLinhaRaw = o['total_linha'];
          const total_linha =
            totalLinhaRaw != null &&
            Number.isFinite(Number(totalLinhaRaw))
              ? Number(totalLinhaRaw)
              : null;
          return {
            ...base,
            pacote,
            etapa,
            detalhes,
            regra_mega_id,
            pacote_id,
            valor_unitario,
            desconto: descontoItem,
            total_linha,
          } as AtendimentoItemCatalogo;
        })
        .filter(Boolean) as AtendimentoItemCatalogo[];
      if (itens_catalogo.length === 0) itens_catalogo = undefined;
    }

    const linhaRaw = raw['linha_id'];
    const linha_id =
      linhaRaw != null && linhaRaw !== ''
        ? Number(linhaRaw)
        : undefined;
    const inicioRaw = raw['inicio'] ?? raw['Inicio'];
    const fimRaw = raw['fim'] ?? raw['Fim'];
    const inicio =
      inicioRaw != null && String(inicioRaw).trim()
        ? String(inicioRaw).trim()
        : null;
    const fim =
      fimRaw != null && String(fimRaw).trim()
        ? String(fimRaw).trim()
        : null;

    /** Campos derivados pela API (resumo de pagamentos parciais). */
    const totalBruto = this.parseNumberOrUndef(raw['total_bruto']);
    const total = this.parseNumberOrUndef(raw['total']);
    const descontoNum = this.parseNumberOrUndef(raw['desconto_num']);
    const totalPago = this.parseNumberOrUndef(raw['total_pago']);
    const totalAReceberCartao = this.parseNumberOrUndef(
      raw['total_a_receber_cartao'],
    );
    const saldo = this.parseNumberOrUndef(raw['saldo']);
    const statusCobrancaRaw = String(raw['status_cobranca'] ?? '')
      .trim()
      .toLowerCase();
    const statusCobranca: AtendimentoListaItem['status_cobranca'] | undefined =
      statusCobrancaRaw === 'aberto' ||
      statusCobrancaRaw === 'pendente' ||
      statusCobrancaRaw === 'parcial' ||
      statusCobrancaRaw === 'pago'
        ? statusCobrancaRaw
        : undefined;
    const numeroComandaRaw =
      raw['numero_comanda'] ?? raw['numeroComanda'] ?? raw['Numero Comanda'];
    const numeroOrcamentoRaw =
      raw['numero_orcamento'] ?? raw['numeroOrcamento'] ?? raw['Numero Orcamento'];
    const parseTicketNum = (v: unknown): number | null => {
      if (typeof v === 'number' && Number.isFinite(v) && v > 0) {
        return Math.trunc(v);
      }
      if (v == null || v === '') return null;
      const n = Number(v);
      return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
    };
    const numeroComanda = parseTicketNum(numeroComandaRaw);
    const numeroOrcamento = parseTicketNum(numeroOrcamentoRaw);

    return {
      id: String(raw['id'] ?? raw['ID Atendimento'] ?? ''),
      numeroComanda,
      numeroOrcamento,
      linha_id:
        linha_id != null && Number.isFinite(linha_id) ? linha_id : undefined,
      data: this.formatDataCell(raw['Data'] ?? raw['data']),
      inicio,
      fim,
      nomeCliente: String(raw['Nome Cliente'] ?? '').trim(),
      idCliente:
        String(
          raw['ID Cliente'] ?? raw['id_cliente'] ?? raw['idCliente'] ?? '',
        ).trim() || null,
      tipo: tipo ? tipo : null,
      produtoNome: produto ? produto : null,
      servicosRef: servicos || null,
      tamanho: String(raw['Tamanho'] ?? '').trim() || null,
      profissional: String(raw['Profissional'] ?? '').trim() || null,
      profissional_id,
      itens_catalogo,
      pacote: pacote || null,
      etapa: etapa || null,
      descricao,
      descricaoManual:
        descManual !== '' ? descManual : null,
      valor: raw['Valor'],
      desconto: String(raw['Desconto'] ?? '').trim() || null,
      cobrancaStatus,
      pagamentoStatus,
      pagamentoMetodo,
      agenda_status,
      agenda_cor,
      total_bruto: totalBruto,
      total,
      desconto_num: descontoNum,
      total_pago: totalPago,
      total_a_receber_cartao: totalAReceberCartao,
      saldo,
      status_cobranca: statusCobranca,
      modo: (() => {
        const m = String(raw['modo'] ?? '').trim().toLowerCase();
        return m === 'orcamento' ? 'orcamento' : m === 'producao' ? 'producao' : m || 'producao';
      })(),
      orcamento_status: (() => {
        const s = String(raw['orcamento_status'] ?? raw['orcamentoStatus'] ?? '')
          .trim()
          .toLowerCase();
        return s || null;
      })(),
      orcamento_enviado_em:
        raw['orcamento_enviado_em'] != null
          ? String(raw['orcamento_enviado_em'])
          : null,
      orcamento_convertido_em:
        raw['orcamento_convertido_em'] != null
          ? String(raw['orcamento_convertido_em'])
          : null,
      pagamento_prestacao_pendente_atrasada:
        raw['pagamento_prestacao_pendente_atrasada'] === true ||
        String(raw['pagamento_prestacao_pendente_atrasada'] ?? '').toLowerCase() ===
          'true',
      pagamento_prestacao_menor_data: (() => {
        const v = raw['pagamento_prestacao_menor_data'];
        const s = v != null ? String(v).trim().slice(0, 10) : '';
        return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
      })(),
    };
  }

  private parseNumberOrUndef(v: unknown): number | undefined {
    if (v == null || v === '') return undefined;
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : undefined;
  }

  /** Lê método de pagamento gravado na linha (várias chaves possíveis na API / planilha). */
  private pickPagamentoMetodoFromRow(
    raw: Record<string, unknown>,
  ): string | null {
    const tryKeys = [
      'pagamento_metodo',
      'pagamentoMetodo',
      'Método Pagamento',
      'Metodo Pagamento',
      'Metodo pagamento',
      'Pagamento Metodo',
    ] as const;
    for (const k of tryKeys) {
      const v = raw[k];
      if (v !== undefined && v !== null && String(v).trim()) {
        return String(v).trim();
      }
    }
    for (const k of Object.keys(raw)) {
      const nk = k.replace(/\s+/g, '').toLowerCase();
      if (
        nk === 'pagamentometodo' ||
        nk === 'metodopagamento' ||
        nk === 'metodopagamentoconfirmado'
      ) {
        const v = raw[k];
        if (v !== undefined && v !== null && String(v).trim()) {
          return String(v).trim();
        }
      }
    }
    return null;
  }

  private parseProfissionalIdCell(v: unknown): number | null {
    if (v === undefined || v === null || v === '') return null;
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) {
      return Math.trunc(v);
    }
    const n = parseInt(String(v).trim(), 10);
    return !Number.isNaN(n) && n > 0 ? n : null;
  }

  private formatDataCell(v: unknown): string {
    if (v == null || v === '') return '';
    if (v instanceof Date && !Number.isNaN(v.getTime())) {
      const y = v.getFullYear();
      const m = String(v.getMonth() + 1).padStart(2, '0');
      const d = String(v.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    if (typeof v === 'string') {
      const s = v.trim();
      if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
      if (s.includes('T') && /^\d{4}-\d{2}-\d{2}T/.test(s)) return s.slice(0, 10);
      const dm = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/.exec(s);
      if (dm) {
        const dd = dm[1].padStart(2, '0');
        const mm = dm[2].padStart(2, '0');
        return `${dm[3]}-${mm}-${dd}`;
      }
      return s;
    }
    return String(v);
  }

  /**
   * POST com envelope da API. Aceita HTTP 204 (corpo vazio) — o HttpClient do Angular
   * falha ao fazer parse JSON nesse caso, embora o pedido tenha sido bem-sucedido.
   */
  private postEnvelope<T>(
    path: string,
    body: unknown,
    fallbackOn204: () => T,
  ): Observable<T> {
    return this.http
      .post<ApiResponse<T>>(this.url(path), body, { observe: 'response' })
      .pipe(
        map((resp: HttpResponse<ApiResponse<T>>) => {
          if (resp.status === 204 || resp.body == null) {
            return fallbackOn204();
          }
          return this.unwrap(resp.body);
        }),
      );
  }

  private requireServicoItem(
    item: Servico | null | undefined,
    acao: 'criar' | 'atualizar',
  ): Servico {
    const id = item?.id != null ? String(item.id).trim() : '';
    const nome = String(item?.['Serviço'] ?? '').trim();
    if (!id || !nome) {
      throw new Error(
        `Resposta inválida ao ${acao} serviço (sem id/nome). O registo pode não ter sido gravado.`,
      );
    }
    return item!;
  }

  private unwrap<T>(r: ApiResponse<T>): T {
    if (!r.ok || r.data === null || r.data === undefined) {
      const msg =
        r.error?.message?.trim() ||
        extractApiErrorMessage(r, 'Resposta inválida do servidor');
      throw new Error(msg);
    }
    return r.data;
  }
}
