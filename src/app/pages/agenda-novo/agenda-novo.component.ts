import { Component, inject, OnDestroy, OnInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  FormArray,
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { catchError, forkJoin, of, Subscription } from 'rxjs';
import { SheetsApiService } from '../../core/services/sheets-api.service';
import {
  CabeloCatalogoItem,
  Cliente,
  CreateAtendimentoPayload,
  PacoteCatalogoItem,
  ProdutoCatalogoItem,
  RegraMegaItem,
  Servico,
  TipoAtendimento,
} from '../../core/models/api.models';

@Component({
  selector: 'app-agenda-novo',
  standalone: true,
  imports: [RouterLink, ReactiveFormsModule],
  templateUrl: './agenda-novo.component.html',
  styleUrl: './agenda-novo.component.scss',
})
export class AgendaNovoComponent implements OnInit, OnDestroy {
  private readonly api = inject(SheetsApiService);
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);

  readonly tiposAtendimento: TipoAtendimento[] = [
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
  /** Nomes da coluna Profissional (aba Folha). */
  profissionais: string[] = [];

  carregandoListas = true;
  salvando = false;
  erro = '';

  private tipoSub?: Subscription;

  readonly form = this.fb.group({
    tipo: this.fb.nonNullable.control<TipoAtendimento>('Serviço', [
      Validators.required,
    ]),
    cliente_id: ['', Validators.required],
    data: ['', Validators.required],
    profissional: [''],
    observacao: [''],
    servico_id: [''],
    tamanho: ['Curto'],
    pacote: [''],
    produto: [''],
    quantidade: [1, [Validators.min(0.01)]],
    valor_cabelo: [''],
    detalhes_cabelo: [''],
    etapas: this.fb.array<FormGroup>([]),
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
        catchError(() => of([] as string[])),
      ),
    }).subscribe({
      next: (r) => {
        this.clientes = r.clientes.filter(
          (cl) => Boolean(cl.id?.trim() && cl.nome?.trim()),
        );
        this.servicos = r.servicos;
        this.servicosTipoServico = r.servicos.filter((s) =>
          this.isTipoServicoLinha(s),
        );
        this.regrasMega = r.regrasMega;
        this.pacotes = r.pacotes;
        this.produtos = r.produtos;
        this.cabelos = r.cabelos;
        this.profissionais = r.profissionais ?? [];
        this.carregandoListas = false;
        this.garantirEtapasMinimas();
      },
      error: () => {
        this.erro =
          'Não foi possível carregar dados. Confira a planilha, o proxy e o Apps Script.';
        this.carregandoListas = false;
      },
    });

    this.tipoSub = this.form.controls.tipo.valueChanges.subscribe(() => {
      this.erro = '';
      this.form.patchValue({
        pacote: '',
        servico_id: '',
        produto: '',
        valor_cabelo: '',
        detalhes_cabelo: '',
      });
      this.garantirEtapasMinimas();
    });
  }

  ngOnDestroy(): void {
    this.tipoSub?.unsubscribe();
  }

  get etapasArray(): FormArray<FormGroup> {
    return this.form.controls.etapas;
  }

  get tipoAtual(): TipoAtendimento {
    return this.form.controls.tipo.getRawValue();
  }

  /** Pacote escolhido (Mega ou Pacote comercial) para filtrar etapas em Regras Mega. */
  get pacoteSelecionado(): string {
    return String(this.form.controls.pacote.value ?? '').trim();
  }

  get servicoLinhaSelecionada(): Servico | undefined {
    const id = String(this.form.controls.servico_id.value ?? '').trim();
    if (!id) return undefined;
    return this.servicosTipoServico.find((s) => String(s.id) === id);
  }

  /** Fixo não usa tamanho no formulário; Tamanho (e legado Serviço) usam. */
  get servicoPrecisaTamanho(): boolean {
    const s = this.servicoLinhaSelecionada;
    if (!s) return false;
    const t = String(s['Tipo'] ?? '').trim().toLowerCase();
    return t === 'tamanho' || t === 'serviço' || t === 'servico';
  }

  /** Sem nomes na Folha não dá para cumprir profissional obrigatório só com dropdown. */
  get profissionaisObrigatoriosSemLista(): boolean {
    if (this.profissionais.length > 0) return false;
    const t = this.tipoAtual;
    return (
      t === 'Serviço' ||
      t === 'Mega' ||
      t === 'Pacote' ||
      t === 'Produto' ||
      t === 'Cabelo'
    );
  }

  get pacotesMegaUnicos(): string[] {
    const set = new Set(
      this.regrasMega.map((r) => r.pacote.trim()).filter(Boolean),
    );
    return [...set].sort((a, b) => a.localeCompare(b, 'pt-BR'));
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
    return [...set].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }

  /** Etapas para o select; em Pacote, se o nome não bater com Regras Mega, lista todas as etapas (lookup no servidor ainda exige par Pacote+Etapa). */
  etapasSelectOptions(): string[] {
    const direct = this.etapasParaPacoteSelecionado(this.pacoteSelecionado);
    if (direct.length > 0) return direct;
    if (this.tipoAtual === 'Pacote' && this.pacoteSelecionado) {
      const all = new Set(
        this.regrasMega.map((r) => r.etapa.trim()).filter(Boolean),
      );
      return [...all].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    }
    return [];
  }

  resumoLinhas(): string {
    const t = this.tipoAtual;
    if (t === 'Mega') {
      const n = this.etapasArray.length;
      return `${n} linha(s) em Atendimentos (mesmo ID)`;
    }
    if (t === 'Pacote') {
      const n = 1 + this.etapasArray.length;
      return `${n} linha(s): 1 cobrança + ${this.etapasArray.length} etapa(s)`;
    }
    return '1 linha em Atendimentos';
  }

  adicionarEtapa(): void {
    this.etapasArray.push(this.novoGrupoEtapa());
  }

  removerEtapa(i: number): void {
    if (this.etapasArray.length <= 1) return;
    this.etapasArray.removeAt(i);
  }

  salvar(): void {
    this.erro = '';
    const raw = this.form.getRawValue();
    const tipo = raw.tipo;

    if (!this.validarPorTipo(tipo, raw)) {
      this.form.markAllAsTouched();
      return;
    }

    const payload = this.montarPayload(tipo, raw);
    if (!payload) {
      this.form.markAllAsTouched();
      return;
    }

    this.salvando = true;
    this.api.createAgendamento(payload).subscribe({
      next: () => {
        this.salvando = false;
        void this.router.navigate(['/agenda']);
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
    const preco = p.preco != null && p.preco !== '' ? ` — ${String(p.preco)}` : '';
    return `${p.pacote}${preco}`;
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
      profissional: ['', Validators.required],
    });
  }

  private garantirEtapasMinimas(): void {
    const t = this.tipoAtual;
    if (t === 'Mega' || t === 'Pacote') {
      while (this.etapasArray.length < 1) {
        this.etapasArray.push(this.novoGrupoEtapa());
      }
    } else {
      while (this.etapasArray.length > 0) {
        this.etapasArray.removeAt(0);
      }
    }
  }

  private validarPorTipo(
    tipo: TipoAtendimento,
    raw: Record<string, unknown>,
  ): boolean {
    if (!String(raw['cliente_id'] ?? '').trim()) return false;
    if (!String(raw['data'] ?? '').trim()) return false;

    if (tipo === 'Serviço') {
      if (!String(raw['profissional'] ?? '').trim()) return false;
      if (!String(raw['servico_id'] ?? '').trim()) return false;
      return true;
    }
    if (tipo === 'Mega') {
      if (!String(raw['pacote'] ?? '').trim()) return false;
      return this.etapasValidas();
    }
    if (tipo === 'Pacote') {
      if (!String(raw['profissional'] ?? '').trim()) return false;
      if (!String(raw['pacote'] ?? '').trim()) return false;
      return this.etapasValidas();
    }
    if (tipo === 'Produto') {
      if (!String(raw['profissional'] ?? '').trim()) return false;
      if (!String(raw['produto'] ?? '').trim()) return false;
      const q = Number(raw['quantidade']);
      return !Number.isNaN(q) && q > 0;
    }
    if (tipo === 'Cabelo') {
      if (!String(raw['profissional'] ?? '').trim()) return false;
      const v = this.parseValorPt(String(raw['valor_cabelo'] ?? ''));
      return v != null && v > 0;
    }
    return false;
  }

  private etapasValidas(): boolean {
    for (let i = 0; i < this.etapasArray.length; i++) {
      const g = this.etapasArray.at(i);
      const e = String(g.get('etapa')?.value ?? '').trim();
      const p = String(g.get('profissional')?.value ?? '').trim();
      if (!e || !p) return false;
    }
    return this.etapasArray.length >= 1;
  }

  private montarPayload(
    tipo: TipoAtendimento,
    raw: Record<string, unknown>,
  ): CreateAtendimentoPayload | null {
    const cliente_id = String(raw['cliente_id'] ?? '').trim();
    const data = String(raw['data'] ?? '').trim();
    const observacao = String(raw['observacao'] ?? '').trim() || undefined;

    if (tipo === 'Serviço') {
      const base = {
        tipo: 'Serviço' as const,
        cliente_id,
        data,
        profissional: String(raw['profissional'] ?? '').trim(),
        servico_id: String(raw['servico_id'] ?? '').trim(),
        observacao,
      };
      const st = String(
        this.servicoLinhaSelecionada?.['Tipo'] ?? '',
      ).toLowerCase();
      if (st === 'fixo') {
        return base;
      }
      return {
        ...base,
        tamanho: String(raw['tamanho'] ?? 'Curto').trim(),
      };
    }
    if (tipo === 'Mega') {
      const pacote = String(raw['pacote'] ?? '').trim();
      const etapas = this.etapasArray.getRawValue() as {
        etapa: string;
        profissional: string;
      }[];
      return {
        tipo: 'Mega',
        cliente_id,
        data,
        pacote,
        etapas: etapas.map((x) => ({
          etapa: x.etapa.trim(),
          profissional: x.profissional.trim(),
        })),
        observacao,
      };
    }
    if (tipo === 'Pacote') {
      const pacote = String(raw['pacote'] ?? '').trim();
      const etapas = this.etapasArray.getRawValue() as {
        etapa: string;
        profissional: string;
      }[];
      return {
        tipo: 'Pacote',
        cliente_id,
        data,
        profissional: String(raw['profissional'] ?? '').trim(),
        pacote,
        etapas: etapas.map((x) => ({
          etapa: x.etapa.trim(),
          profissional: x.profissional.trim(),
        })),
        observacao,
      };
    }
    if (tipo === 'Produto') {
      return {
        tipo: 'Produto',
        cliente_id,
        data,
        profissional: String(raw['profissional'] ?? '').trim(),
        produto: String(raw['produto'] ?? '').trim(),
        quantidade: Number(raw['quantidade']),
        observacao,
      };
    }
    if (tipo === 'Cabelo') {
      const v = this.parseValorPt(String(raw['valor_cabelo'] ?? ''));
      if (v == null) return null;
      const det = String(raw['detalhes_cabelo'] ?? '').trim();
      return {
        tipo: 'Cabelo',
        cliente_id,
        data,
        profissional: String(raw['profissional'] ?? '').trim(),
        valor: v,
        observacao,
        detalhes_cabelo: det || undefined,
      };
    }
    return null;
  }

  private parseValorPt(s: string): number | null {
    const t = s.trim().replace(/\s/g, '').replace(',', '.');
    if (!t) return null;
    const n = parseFloat(t);
    return Number.isNaN(n) ? null : n;
  }
}
