import { Component, inject, LOCALE_ID, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  AtendimentoListaItem,
  ProfissionalListaItem,
} from '../../core/models/api.models';
import { SheetsApiService } from '../../core/services/sheets-api.service';
import { minutosMeiaNoiteEmBrasilia } from '../../core/utils/brasilia-time';
import { diffMinutesEntreHorarios } from '../../core/utils/sql-local-datetime';
import {
  ordenarLinhasAtendimentoInPlace,
  toYmd,
} from '../../core/utils/atendimento-display';
import { AtendimentosComponent } from '../atendimentos/atendimentos.component';
import { AgendaNovoComponent } from '../agenda-novo/agenda-novo.component';

type CelulaCalendario = { dia: number | null; ymd: string | null };

/** Hora inicial e final da grelha (dia), em minutos desde 00:00. */
const GRID_START_MIN = 8 * 60;
const GRID_END_MIN = 20 * 60;
const GRID_RANGE = GRID_END_MIN - GRID_START_MIN;

@Component({
  selector: 'app-agenda-hub',
  standalone: true,
  imports: [FormsModule, AtendimentosComponent, AgendaNovoComponent],
  providers: [{ provide: LOCALE_ID, useValue: 'pt-BR' }],
  templateUrl: './agenda-hub.component.html',
  styleUrl: './agenda-hub.component.scss',
})
export class AgendaHubComponent implements OnInit {
  private readonly api = inject(SheetsApiService);

  @ViewChild('rececao') private rececao?: AtendimentosComponent;

  mesRef = this.inicioDoMes(new Date());
  diaYmd = toYmd(new Date());
  carregandoMes = false;
  carregandoDia = false;
  erro = '';
  porDia = new Map<string, number>();
  itensMes: AtendimentoListaItem[] = [];
  linhasDia: AtendimentoListaItem[] = [];
  profissionais: ProfissionalListaItem[] = [];
  /** Profissionais ocultos na grelha (vazio = todos visíveis). */
  profOcultos = new Set<number>();

  slotsHoras: string[] = [];
  modalAberto = false;
  modalContexto: {
    data: string;
    profissional_id: number;
    hora: string;
  } | null = null;

  /** Incrementado após salvar no modal para forçar reload do painel receção. */
  tickRececao = 0;

  ngOnInit(): void {
    this.slotsHoras = this.gerarSlots();
    this.api.listProfissionais().subscribe({
      next: (items) => {
        this.profissionais = items ?? [];
      },
      error: () => {
        this.profissionais = [];
      },
    });
    this.carregarMes();
    this.carregarDia();
  }

  profissionaisVisiveis(): ProfissionalListaItem[] {
    return this.profissionais.filter((p) => !this.profOcultos.has(p.id));
  }

  toggleProfissionalOculto(id: number): void {
    if (this.profOcultos.has(id)) {
      this.profOcultos.delete(id);
    } else {
      this.profOcultos.add(id);
    }
  }

  celulas(): CelulaCalendario[] {
    const y = this.mesRef.getFullYear();
    const m = this.mesRef.getMonth();
    const primeiroDow = new Date(y, m, 1).getDay();
    const diasNoMes = new Date(y, m + 1, 0).getDate();
    const out: CelulaCalendario[] = [];
    for (let i = 0; i < primeiroDow; i++) {
      out.push({ dia: null, ymd: null });
    }
    for (let d = 1; d <= diasNoMes; d++) {
      const ymd = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      out.push({ dia: d, ymd });
    }
    while (out.length % 7 !== 0) {
      out.push({ dia: null, ymd: null });
    }
    return out;
  }

  contagem(ymd: string | null): number {
    if (!ymd) return 0;
    return this.porDia.get(ymd) ?? 0;
  }

  tituloMes(): string {
    return this.mesRef.toLocaleDateString('pt-BR', {
      month: 'long',
      year: 'numeric',
    });
  }

  selecionarDia(ymd: string | null): void {
    if (!ymd) return;
    this.diaYmd = ymd;
    this.carregarDia();
  }

  mesAnterior(): void {
    const y = this.mesRef.getFullYear();
    const m = this.mesRef.getMonth();
    this.mesRef = this.inicioDoMes(new Date(y, m - 1, 1));
    this.carregarMes();
  }

  mesSeguinte(): void {
    const y = this.mesRef.getFullYear();
    const m = this.mesRef.getMonth();
    this.mesRef = this.inicioDoMes(new Date(y, m + 1, 1));
    this.carregarMes();
  }

  irMesAtual(): void {
    this.mesRef = this.inicioDoMes(new Date());
    this.carregarMes();
  }

  /** Mini-calendário: mês atual e dia selecionado = hoje (grelha + receção). */
  irParaHoje(): void {
    const hoje = new Date();
    this.mesRef = this.inicioDoMes(hoje);
    this.diaYmd = toYmd(hoje);
    this.carregarMes();
    this.carregarDia();
  }

  get colsCount(): number {
    return Math.max(1, this.profissionaisVisiveis().length);
  }

  hojeYmd(): string {
    return toYmd(new Date());
  }

  abrirNovo(profissionalId: number, hora: string): void {
    this.modalContexto = {
      data: this.diaYmd,
      profissional_id: profissionalId,
      hora,
    };
    this.modalAberto = true;
  }

  /** Abre o mesmo modal de novo atendimento, sem slot na grelha (hora no formulário). */
  abrirNovoAtendimentoModal(): void {
    const vis = this.profissionaisVisiveis();
    const pid = vis[0]?.id ?? this.profissionais[0]?.id ?? 0;
    this.modalContexto = {
      data: this.diaYmd,
      profissional_id: pid,
      hora: '',
    };
    this.modalAberto = true;
  }

  fecharModal(): void {
    this.modalAberto = false;
    this.modalContexto = null;
  }

  onSalvoModal(): void {
    this.fecharModal();
    this.tickRececao += 1;
    this.carregarMes();
    this.carregarDia();
  }

  /** Receção alterou dados (ex.: exclusão) — atualiza grelha e mini-calendário. */
  onAgendaDadosAlteradosRececao(): void {
    this.carregarMes();
    this.carregarDia();
  }

  eventosNaColuna(profId: number): AtendimentoListaItem[] {
    const rows = this.linhasDia.filter(
      (a) => Number(a.profissional_id) === profId,
    );
    ordenarLinhasAtendimentoInPlace(rows);
    return rows;
  }

  corGrupo(idAt: string): string {
    let h = 0;
    for (let i = 0; i < idAt.length; i++) {
      h = (h * 31 + idAt.charCodeAt(i)) >>> 0;
    }
    const hue = h % 360;
    return `hsl(${hue} 55% 42%)`;
  }

  topPct(ev: AtendimentoListaItem): number {
    const m = minutosMeiaNoiteEmBrasilia(ev.inicio, this.diaYmd);
    if (m === null) return 0;
    const t = Math.max(GRID_START_MIN, Math.min(GRID_END_MIN, m));
    return ((t - GRID_START_MIN) / GRID_RANGE) * 100;
  }

  /** Altura do cartão = duração real entre `inicio` e `fim`, em % da grelha. */
  alturaPct(ev: AtendimentoListaItem): number {
    const iniS = ev.inicio ? String(ev.inicio).trim() : '';
    const fS = ev.fim ? String(ev.fim).trim() : '';
    if (!iniS) return (30 / GRID_RANGE) * 100;
    const diff =
      fS && iniS ? diffMinutesEntreHorarios(iniS, fS) : null;
    let durMin =
      diff != null && Number.isFinite(diff) && diff > 0 ? diff : 30;
    durMin = Math.max(5, Math.min(GRID_RANGE, durMin));
    return (durMin / GRID_RANGE) * 100;
  }

  /** Horário de início em Brasília no dia da grelha, para o texto do cartão. */
  horaInicioCard(ev: AtendimentoListaItem): string {
    const m = minutosMeiaNoiteEmBrasilia(ev.inicio, this.diaYmd);
    if (m == null) return '';
    const mf = Math.floor(m);
    const hh = Math.floor(mf / 60) % 24;
    const mm = mf % 60;
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }

  rotuloSlot(ev: AtendimentoListaItem): string {
    const hora = this.horaInicioCard(ev);
    const prefix = hora ? `${hora} · ` : '';
    const nome = (ev.nomeCliente || '').trim() || '—';
    const desc = (ev.descricao || '').trim();
    return desc ? `${prefix}${nome} — ${desc}` : `${prefix}${nome}`;
  }

  idAtendimento(ev: AtendimentoListaItem): string {
    return String(ev.id || '').trim();
  }

  abrirDetalhesNaRececao(ev: AtendimentoListaItem, e: Event): void {
    e.stopPropagation();
    const id = this.idAtendimento(ev);
    if (!id) return;
    this.rececao?.expandirGrupoPorIdAtendimento(id);
  }

  private gerarSlots(): string[] {
    const out: string[] = [];
    for (let m = GRID_START_MIN; m < GRID_END_MIN; m += 30) {
      const h = Math.floor(m / 60);
      const mm = m % 60;
      out.push(
        `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`,
      );
    }
    return out;
  }

  slotTopPct(hora: string): number {
    const [hs, ms] = hora.split(':');
    const m = parseInt(hs, 10) * 60 + parseInt(ms, 10);
    return ((m - GRID_START_MIN) / GRID_RANGE) * 100;
  }

  slotAlturaPct(): number {
    return 100 / Math.max(1, this.slotsHoras.length);
  }

  private inicioDoMes(d: Date): Date {
    return new Date(d.getFullYear(), d.getMonth(), 1);
  }

  private carregarMes(): void {
    this.carregandoMes = true;
    this.erro = '';
    const y = this.mesRef.getFullYear();
    const m = this.mesRef.getMonth();
    const inicio = new Date(y, m, 1);
    const fim = new Date(y, m + 1, 0);
    const di = toYmd(inicio);
    const df = toYmd(fim);
    this.api.listAgendamentos(di, df).subscribe({
      next: (items) => {
        this.itensMes = items;
        const map = new Map<string, Set<string>>();
        for (const a of items) {
          const key = (a.data || '').slice(0, 10);
          if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) continue;
          const idAt = String(a.id || '').trim();
          const grupKey = idAt
            ? `id:${idAt}`
            : `nome:${(a.nomeCliente || '').trim().toLowerCase()}`;
          if (!map.has(key)) map.set(key, new Set());
          map.get(key)!.add(grupKey);
        }
        const out = new Map<string, number>();
        for (const [k, set] of map) {
          out.set(k, set.size);
        }
        this.porDia = out;
        this.carregandoMes = false;
      },
      error: (e: Error) => {
        this.erro =
          e.message ||
          'Não foi possível carregar o mês na mini-agenda.';
        this.carregandoMes = false;
      },
    });
  }

  private carregarDia(): void {
    this.carregandoDia = true;
    const d = this.diaYmd;
    this.api.listAgendamentos(d, d).subscribe({
      next: (items) => {
        this.linhasDia = items;
        this.carregandoDia = false;
      },
      error: (e: Error) => {
        this.erro =
          e.message ||
          'Não foi possível carregar os atendimentos do dia.';
        this.linhasDia = [];
        this.carregandoDia = false;
      },
    });
  }
}
