import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  ApiResponse,
  AtendimentoCriadoResumo,
  AtendimentoItemCatalogo,
  AtendimentoListaItem,
  CabeloCatalogoItem,
  CaixaDiaResumo,
  CategoriaFinanceiraItem,
  FolhaListaItem,
  RecalcularFolhaComissoesResposta,
  Cliente,
  CreateAtendimentoPayload,
  MovimentacaoListaItem,
  PacoteCatalogoItem,
  ProdutoCatalogoItem,
  ProfissionalListaItem,
  RegraMegaItem,
  Servico,
} from '../models/api.models';
import { enriquecerRotuloPacote } from '../utils/pacote-descricao';

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

  listServicos(): Observable<Servico[]> {
    return this.http
      .get<ApiResponse<{ items: Servico[] }>>(this.url('/api/servicos'))
      .pipe(
        map((r) => this.unwrap(r)),
        map((d) => d.items),
      );
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
  listProfissionais(incluirInativos = false): Observable<ProfissionalListaItem[]> {
    let params = new HttpParams();
    if (incluirInativos) {
      params = params.set('incluir_inativos', '1');
    }
    return this.http
      .get<ApiResponse<{ items: ProfissionalListaItem[] }>>(
        this.url('/api/profissionais'),
        incluirInativos ? { params } : {},
      )
      .pipe(
        map((r) => this.unwrap(r)),
        map((d) => d.items),
      );
  }

  createProfissional(payload: {
    nome: string;
    ativo?: boolean;
  }): Observable<ProfissionalListaItem> {
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

  updateProfissional(payload: {
    id: number;
    nome?: string;
    ativo?: boolean;
  }): Observable<ProfissionalListaItem> {
    const body: { nome?: string; ativo?: boolean } = {};
    if (payload.nome !== undefined) body.nome = payload.nome;
    if (payload.ativo !== undefined) body.ativo = payload.ativo;
    return this.http
      .patch<ApiResponse<{ item: ProfissionalListaItem }>>(
        this.url(`/api/profissionais/${encodeURIComponent(String(payload.id))}`),
        body,
      )
      .pipe(
        map((r) => this.unwrap(r)),
        map((d) => d.item),
      );
  }

  listAgendamentos(
    dataInicio?: string,
    dataFim?: string,
    idAtendimento?: string,
  ): Observable<AtendimentoListaItem[]> {
    let params = new HttpParams();
    if (dataInicio) params = params.set('dataInicio', dataInicio);
    if (dataFim) params = params.set('dataFim', dataFim);
    if (idAtendimento?.trim()) {
      params = params.set('idAtendimento', idAtendimento.trim());
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

  createCliente(payload: {
    nome: string;
    telefone?: string;
    notas?: string;
  }): Observable<Cliente> {
    return this.http
      .post<ApiResponse<Cliente>>(this.url('/api/clientes'), payload)
      .pipe(map((raw) => this.unwrap(raw)));
  }

  updateCliente(payload: {
    cliente_id: string;
    nome: string;
    telefone?: string;
    notas?: string;
  }): Observable<Cliente> {
    return this.http
      .patch<ApiResponse<Cliente>>(
        this.url(`/api/clientes/${encodeURIComponent(payload.cliente_id)}`),
        {
          nome: payload.nome,
          telefone: payload.telefone,
          notas: payload.notas,
        },
      )
      .pipe(map((raw) => this.unwrap(raw)));
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

  excluirAtendimento(idAtendimento: string): Observable<{ removidas: number }> {
    const params = new HttpParams().set('acao', 'excluir');
    return this.http
      .post<ApiResponse<{ removidas: number }>>(
        this.url('/api/atendimentos'),
        { id_atendimento: idAtendimento, acao: 'excluir' },
        { params },
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
          return {
            ...base,
            pacote,
            etapa,
            detalhes,
            regra_mega_id,
            pacote_id,
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

    return {
      id: String(raw['id'] ?? raw['ID Atendimento'] ?? ''),
      linha_id:
        linha_id != null && Number.isFinite(linha_id) ? linha_id : undefined,
      data: this.formatDataCell(raw['Data'] ?? raw['data']),
      inicio,
      fim,
      nomeCliente: String(raw['Nome Cliente'] ?? '').trim(),
      idCliente: String(raw['ID Cliente'] ?? '').trim() || null,
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
      valor: raw['Valor'],
      desconto: String(raw['Desconto'] ?? '').trim() || null,
      cobrancaStatus,
      pagamentoStatus,
      pagamentoMetodo,
    };
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

  private unwrap<T>(r: ApiResponse<T>): T {
    if (!r.ok || r.data === null || r.data === undefined) {
      const msg = r.error?.message ?? 'Resposta inválida do servidor';
      throw new Error(msg);
    }
    return r.data;
  }
}
