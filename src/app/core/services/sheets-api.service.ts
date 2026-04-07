import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
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

@Injectable({ providedIn: 'root' })
export class SheetsApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.appsScriptUrl;

  private readonly plainJsonHeaders = new HttpHeaders({
    'Content-Type': 'text/plain;charset=UTF-8',
  });

  getHealth(): Observable<ApiResponse<{ status: string; time?: string }>> {
    const params = new HttpParams().set('action', 'health');
    return this.http
      .get(this.baseUrl, { params, responseType: 'text' })
      .pipe(map((body) => this.parseApiJson(body)));
  }

  listClientes(): Observable<Cliente[]> {
    const params = new HttpParams().set('action', 'listClientes');
    return this.http
      .get(this.baseUrl, { params, responseType: 'text' })
      .pipe(
        map((body) => this.parseApiJson<{ items: Cliente[] }>(body)),
        map((r) => this.unwrap(r).items),
      );
  }

  getCliente(clienteId: string): Observable<Cliente> {
    const params = new HttpParams()
      .set('action', 'getCliente')
      .set('cliente_id', clienteId);
    return this.http
      .get(this.baseUrl, { params, responseType: 'text' })
      .pipe(
        map((body) => this.parseApiJson<{ item: Cliente }>(body)),
        map((r) => this.unwrap(r).item),
      );
  }

  listServicos(): Observable<Servico[]> {
    const params = new HttpParams().set('action', 'listServicos');
    return this.http
      .get(this.baseUrl, { params, responseType: 'text' })
      .pipe(
        map((body) => this.parseApiJson<{ items: Servico[] }>(body)),
        map((r) => this.unwrap(r).items),
      );
  }

  listRegrasMega(): Observable<RegraMegaItem[]> {
    const params = new HttpParams().set('action', 'listRegrasMega');
    return this.http
      .get(this.baseUrl, { params, responseType: 'text' })
      .pipe(
        map((body) => this.parseApiJson<{ items: RegraMegaItem[] }>(body)),
        map((r) => this.unwrap(r).items),
      );
  }

  listPacotes(): Observable<PacoteCatalogoItem[]> {
    const params = new HttpParams().set('action', 'listPacotes');
    return this.http
      .get(this.baseUrl, { params, responseType: 'text' })
      .pipe(
        map((body) => this.parseApiJson<{ items: PacoteCatalogoItem[] }>(body)),
        map((r) => this.unwrap(r).items),
      );
  }

  listProdutos(): Observable<ProdutoCatalogoItem[]> {
    const params = new HttpParams().set('action', 'listProdutos');
    return this.http
      .get(this.baseUrl, { params, responseType: 'text' })
      .pipe(
        map((body) => this.parseApiJson<{ items: ProdutoCatalogoItem[] }>(body)),
        map((r) => this.unwrap(r).items),
      );
  }

  listCabelos(): Observable<CabeloCatalogoItem[]> {
    const params = new HttpParams().set('action', 'listCabelos');
    return this.http
      .get(this.baseUrl, { params, responseType: 'text' })
      .pipe(
        map((body) => this.parseApiJson<{ items: CabeloCatalogoItem[] }>(body)),
        map((r) => this.unwrap(r).items),
      );
  }

  /** Nomes únicos da coluna Profissional na aba Folha. */
  listProfissionais(): Observable<string[]> {
    const params = new HttpParams().set('action', 'listProfissionais');
    return this.http
      .get(this.baseUrl, { params, responseType: 'text' })
      .pipe(
        map((body) => this.parseApiJson<{ items: string[] }>(body)),
        map((r) => this.unwrap(r).items),
      );
  }

  listAgendamentos(
    dataInicio?: string,
    dataFim?: string,
  ): Observable<AtendimentoListaItem[]> {
    let params = new HttpParams().set('action', 'listAgendamentos');
    if (dataInicio) params = params.set('dataInicio', dataInicio);
    if (dataFim) params = params.set('dataFim', dataFim);
    return this.http
      .get(this.baseUrl, { params, responseType: 'text' })
      .pipe(
        map((body) => this.parseApiJson<{ items: Record<string, unknown>[] }>(body)),
        map((r) =>
          this.unwrap(r).items.map((row) => this.normalizeAtendimento(row)),
        ),
      );
  }

  createCliente(payload: {
    nome: string;
    telefone?: string;
    notas?: string;
  }): Observable<Cliente> {
    const body = JSON.stringify({ action: 'createCliente', payload });
    return this.http
      .post(this.baseUrl, body, {
        headers: this.plainJsonHeaders,
        responseType: 'text',
      })
      .pipe(
        map((raw) => this.parseApiJson<Cliente>(raw)),
        map((r) => this.unwrap(r)),
      );
  }

  updateCliente(payload: {
    cliente_id: string;
    nome: string;
    telefone?: string;
    notas?: string;
  }): Observable<Cliente> {
    const body = JSON.stringify({ action: 'updateCliente', payload });
    return this.http
      .post(this.baseUrl, body, {
        headers: this.plainJsonHeaders,
        responseType: 'text',
      })
      .pipe(
        map((raw) => this.parseApiJson<Cliente>(raw)),
        map((r) => this.unwrap(r)),
      );
  }

  createAgendamento(
    payload: CreateAtendimentoPayload,
  ): Observable<AtendimentoCriadoResumo> {
    const body = JSON.stringify({ action: 'createAgendamento', payload });
    return this.http
      .post(this.baseUrl, body, {
        headers: this.plainJsonHeaders,
        responseType: 'text',
      })
      .pipe(
        map((raw) => this.parseApiJson<AtendimentoCriadoResumo>(raw)),
        map((r) => this.unwrap(r)),
      );
  }

  private normalizeAtendimento(raw: Record<string, unknown>): AtendimentoListaItem {
    return {
      id: String(raw['id'] ?? raw['ID Atendimento'] ?? ''),
      data: this.formatDataCell(raw['Data']),
      nomeCliente: String(raw['Nome Cliente'] ?? ''),
      servicos: String(raw['Serviços'] ?? ''),
      tamanho: String(raw['Tamanho'] ?? ''),
      profissional: String(raw['Profissional'] ?? ''),
      valor: raw['Valor'],
    };
  }

  private formatDataCell(v: unknown): string {
    if (v == null || v === '') return '';
    if (typeof v === 'string') {
      const s = v.trim();
      if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
      if (s.includes('T') && /^\d{4}-\d{2}-\d{2}T/.test(s)) return s.slice(0, 10);
      return s;
    }
    return String(v);
  }

  private parseApiJson<T>(body: string): ApiResponse<T> {
    const t = body.trim();
    if (!t) {
      throw new Error('Resposta vazia do servidor.');
    }
    if (
      /Função de script não encontrada|Script function not found/i.test(t) &&
      /doGet|doPost/i.test(t)
    ) {
      throw new Error(this.missingDoGetMessage());
    }
    if (
      t.startsWith('<') ||
      /accounts\.google\.com|ServiceLogin|DOCTYPE\s+html/i.test(t)
    ) {
      throw new Error(this.googleLoginMessage());
    }
    try {
      return JSON.parse(t) as ApiResponse<T>;
    } catch {
      if (/doGet|Função de script não encontrada/i.test(t)) {
        throw new Error(this.missingDoGetMessage());
      }
      throw new Error(
        'Resposta não é JSON válido. Confira o ID do script em proxy.conf.json e se o Web App está publicado.',
      );
    }
  }

  private missingDoGetMessage(): string {
    return (
      'O Apps Script respondeu que não encontrou doGet: o projeto publicado na URL do proxy não contém o código deste repositório. ' +
      'Abra a MESMA planilha → Extensões → Apps Script, cole todo o conteúdo de apps-script/Code.gs (com function doGet e doPost), salve, ' +
      'depois Implantar → Nova versão do aplicativo da web. Confira se o ID em proxy.conf.json é o dessa implantação.'
    );
  }

  private googleLoginMessage(): string {
    return (
      'O Google devolveu a tela de login em vez da planilha. No Apps Script: Implantar → Gerenciar implantações → ' +
      'Editar o aplicativo da web → "Quem tem acesso": escolha Qualquer pessoa ou Qualquer pessoa, mesmo anônima → ' +
      'Versão: Nova versão → Implantar. Teste a URL …/exec?action=health em uma aba anônima (tem que aparecer JSON).'
    );
  }

  private unwrap<T>(r: ApiResponse<T>): T {
    if (!r.ok || r.data === null || r.data === undefined) {
      const msg = r.error?.message ?? 'Resposta inválida do servidor';
      throw new Error(msg);
    }
    return r.data;
  }
}
