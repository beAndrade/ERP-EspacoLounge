import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  ApiResponse,
  AtendimentoCriadoResumo,
  AtendimentoListaItem,
  CabeloCatalogoItem,
  Cliente,
  CreateAtendimentoPayload,
  PacoteCatalogoItem,
  ProdutoCatalogoItem,
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

  listProfissionais(): Observable<string[]> {
    return this.http
      .get<ApiResponse<{ items: string[] }>>(this.url('/api/profissionais'))
      .pipe(
        map((r) => this.unwrap(r)),
        map((d) => d.items),
      );
  }

  listAgendamentos(
    dataInicio?: string,
    dataFim?: string,
  ): Observable<AtendimentoListaItem[]> {
    let params = new HttpParams();
    if (dataInicio) params = params.set('dataInicio', dataInicio);
    if (dataFim) params = params.set('dataFim', dataFim);
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
  finalizarCobranca(idAtendimento: string): Observable<{ atualizadas: number }> {
    const params = new HttpParams().set('acao', 'finalizar');
    return this.http
      .post<ApiResponse<{ atualizadas: number }>>(
        this.url('/api/atendimentos'),
        { id_atendimento: idAtendimento },
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

    return {
      id: String(raw['id'] ?? raw['ID Atendimento'] ?? ''),
      data: this.formatDataCell(raw['Data']),
      nomeCliente: String(raw['Nome Cliente'] ?? '').trim(),
      descricao,
      valor: raw['Valor'],
      cobrancaStatus,
    };
  }

  private formatDataCell(v: unknown): string {
    if (v == null || v === '') return '';
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
