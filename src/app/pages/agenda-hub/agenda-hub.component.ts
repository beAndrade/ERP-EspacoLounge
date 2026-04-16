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
  linhaResumoAtendimentoLista,
  ordenarLinhasAtendimentoInPlace,
  toYmd,
} from '../../core/utils/atendimento-display';
import { AtendimentosComponent } from '../atendimentos/atendimentos.component';
import { AgendaNovoComponent } from '../agenda-novo/agenda-novo.component';

type CelulaCalendario = { dia: number | null; ymd: string | null };

/**
 * Grelha do dia em minutos desde 00:00.
 * `GRID_END_MIN` = fim **exclusivo** da timeline (último rótulo 23:00, faixa até 23:30).
 * Faixas de 30 min: `(GRID_END_MIN - GRID_START_MIN) / 30` (= 31), igual a `$agenda-slot-rows` no SCSS.
 *
 * Ex.: 90 min (10:00→11:30) = **3 faixas** de 30 min; na grelha há **4 traços** horizontais
 * nesse intervalo. A altura do cartão usa **(3 + 1) / 31** da coluna — ou seja,
 * `(duração em slots de 30 min + 1) / AGENDA_SLOT_COUNT`, para coincidir com esse desenho.
 */
const GRID_START_MIN = 8 * 60;
/** Fim exclusivo da timeline (8:00 → 23:30). */
const GRID_END_MIN = 23 * 60 + 30;
const GRID_RANGE = GRID_END_MIN - GRID_START_MIN;
/** Duração de cada faixa na grelha (deve coincidir com o SCSS). */
const AGENDA_SLOT_MIN = 30;
/** Nº de faixas de 30 min na coluna (31). */
const AGENDA_SLOT_COUNT = GRID_RANGE / AGENDA_SLOT_MIN;
/** Último slot de 30 min a começar na grelha (23:00). */
const GRID_LAST_SLOT_START_MIN = GRID_END_MIN - 30;

/** Um cartão na grelha = mesmo `id` + mesmo profissional (várias linhas = um bloco). */
type AgendaHubBloco = {
  trackKey: string;
  linhas: AtendimentoListaItem[];
};

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

  /**
   * Linhas agrupadas por atendimento (`id`) no mesmo profissional — um bloco visual
   * do início mais cedo ao fim mais tarde (ex.: 3 linhas de 30 min = 1h30 num só cartão).
   */
  blocosNaColuna(profId: number): AgendaHubBloco[] {
    const rows = this.eventosNaColuna(profId);
    const map = new Map<string, AtendimentoListaItem[]>();
    let legacySeq = 0;
    for (const r of rows) {
      const id = String(r.id || '').trim();
      const key = id
        ? `id:${id}`
        : `linha:${profId}-${r.linha_id ?? legacySeq++}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    const out: AgendaHubBloco[] = [];
    for (const [trackKey, linhas] of map) {
      ordenarLinhasAtendimentoInPlace(linhas);
      out.push({ trackKey, linhas });
    }
    out.sort((a, b) => {
      const ea = this.extentMinutosBloco(a);
      const eb = this.extentMinutosBloco(b);
      const sa = ea?.start ?? Infinity;
      const sb = eb?.start ?? Infinity;
      return sa - sb;
    });
    return out;
  }

  corGrupo(idAt: string): string {
    let h = 0;
    for (let i = 0; i < idAt.length; i++) {
      h = (h * 31 + idAt.charCodeAt(i)) >>> 0;
    }
    const hue = h % 360;
    return `hsl(${hue} 55% 42%)`;
  }

  /**
   * Duração de uma linha: primeiro `diffMinutesEntreHorarios` (funciona com ISO legado);
   * depois `fim − inicio` no dia da grelha; fallback 30 min.
   */
  private duracaoMinutosAgendamento(ev: AtendimentoListaItem): number {
    const iniS = ev.inicio ? String(ev.inicio).trim() : '';
    const fS = ev.fim ? String(ev.fim).trim() : '';
    if (iniS && fS) {
      const d = diffMinutesEntreHorarios(iniS, fS);
      if (d != null && Number.isFinite(d) && d > 0) {
        return d;
      }
    }
    const dia = this.diaYmd;
    const mi = minutosMeiaNoiteEmBrasilia(ev.inicio, dia);
    const mf = minutosMeiaNoiteEmBrasilia(ev.fim, dia);
    if (mi != null && mf != null && mf > mi) {
      return mf - mi;
    }
    return 30;
  }

  /**
   * Primeiro horário (minutos) do pedido Mega/Pacote no dia — igual em todas as
   * colunas para alinhar cartões quando há profissionais diferentes nas etapas.
   */
  private inicioGlobalMinutosMegaPacote(idAt: string): number | null {
    const id = String(idAt || '').trim();
    if (!id) return null;
    const dia = this.diaYmd;
    let best: number | null = null;
    for (const r of this.linhasDia) {
      if (String(r.id || '').trim() !== id) continue;
      const t = (r.tipo || '').trim().toLowerCase();
      if (t !== 'mega' && t !== 'pacote') continue;
      if (!(r.etapa || '').trim()) continue;
      const ini = r.inicio ? String(r.inicio).trim() : '';
      if (!ini) continue;
      const mi = minutosMeiaNoiteEmBrasilia(ini, dia);
      if (mi == null || !Number.isFinite(mi)) continue;
      if (best == null || mi < best) best = mi;
    }
    return best;
  }

  private blocoEMegaOuPacoteComEtapas(b: AgendaHubBloco): boolean {
    return b.linhas.some((l) => {
      const t = (l.tipo || '').trim().toLowerCase();
      return (
        (t === 'mega' || t === 'pacote') && (l.etapa || '').trim().length > 0
      );
    });
  }

  /**
   * Soma as durações só das **etapas** (ignora cabeça Pacote/Mega sem etapa).
   * A cabeça tem `inicio`/`fim` nulos e `duracaoMinutosAgendamento` devolvia 30 min
   * por defeito — inflacionava mal (ex.: 30+60=90 em vez de 60+60=120).
   */
  private duracaoSomaEtapasMegaPacoteNoBloco(b: AgendaHubBloco): number {
    let sum = 0;
    for (const l of b.linhas) {
      const t = (l.tipo || '').trim().toLowerCase();
      if (t !== 'mega' && t !== 'pacote') continue;
      if (!(l.etapa || '').trim()) continue;
      const ini = l.inicio ? String(l.inicio).trim() : '';
      if (!ini) continue;
      sum += this.duracaoMinutosAgendamento(l);
    }
    return sum;
  }

  /**
   * Início / fim em minutos desde 00:00 (dia da grelha) para o bloco inteiro.
   *
   * Mega/Pacote com vários profissionais: **topo** = horário inicial global do
   * pedido; **altura** = soma das durações das etapas **deste** profissional
   * (ex.: 120 min → até 12:00; outra com 60 min → até 11:00), não o último
   * `fim` absoluto na coluna (que pode ser 12:00 só por encadeamento na API).
   */
  private extentMinutosBloco(
    b: AgendaHubBloco,
  ): { start: number; end: number } | null {
    const dia = this.diaYmd;
    const idAt = String(b.linhas[0]?.id || '').trim();
    const globalStart =
      idAt && this.blocoEMegaOuPacoteComEtapas(b)
        ? this.inicioGlobalMinutosMegaPacote(idAt)
        : null;

    if (globalStart != null && Number.isFinite(globalStart)) {
      const sumDur = this.duracaoSomaEtapasMegaPacoteNoBloco(b);
      const durEfetiva = Math.max(
        AGENDA_SLOT_MIN,
        sumDur > 0 ? sumDur : AGENDA_SLOT_MIN,
      );
      const end = Math.min(GRID_END_MIN, globalStart + durEfetiva);
      if (end <= globalStart) return null;
      return { start: globalStart, end };
    }

    let startMin = Infinity;
    let endMax = -Infinity;
    for (const l of b.linhas) {
      const mi = minutosMeiaNoiteEmBrasilia(l.inicio, dia);
      if (mi == null) continue;
      const iniS = l.inicio ? String(l.inicio).trim() : '';
      const fS = l.fim ? String(l.fim).trim() : '';
      /**
       * Preferir duração = fim − inicio (strings completas). Assim o cartão
       * ocupa o intervalo real (ex.: 90 min) mesmo quando `fim` não passa no
       * mesmo critério de “mesmo dia” que `minutosMeiaNoiteEmBrasilia(fim)`.
       */
      const diffM =
        iniS && fS ? diffMinutesEntreHorarios(iniS, fS) : null;
      let endLine: number;
      if (diffM != null && Number.isFinite(diffM) && diffM > 0) {
        endLine = mi + diffM;
      } else {
        const mf = minutosMeiaNoiteEmBrasilia(l.fim, dia);
        const d = this.duracaoMinutosAgendamento(l);
        endLine = mf != null && mf > mi ? mf : mi + d;
      }
      endLine = Math.min(endLine, GRID_END_MIN);
      startMin = Math.min(startMin, mi);
      endMax = Math.max(endMax, endLine);
    }
    if (
      !Number.isFinite(startMin) ||
      !Number.isFinite(endMax) ||
      endMax <= startMin
    ) {
      return null;
    }
    return { start: startMin, end: endMax };
  }

  topPctBloco(b: AgendaHubBloco): number {
    const ex = this.extentMinutosBloco(b);
    if (!ex) return 0;
    const t = Math.max(
      GRID_START_MIN,
      Math.min(GRID_LAST_SLOT_START_MIN, ex.start),
    );
    return ((t - GRID_START_MIN) / GRID_RANGE) * 100;
  }

  /**
   * Altura em %: uma unidade a mais que os slots cobertos pelo horário (ex.: 90 min → 4/31),
   * para alinhar o cartão aos traços da grelha (início, meios e fim do intervalo).
   */
  alturaPctBloco(b: AgendaHubBloco): number {
    const ex = this.extentMinutosBloco(b);
    if (!ex) {
      /* Mesma regra `slots + 1` com duração mínima de 1 slot (30 min). */
      return (2 / AGENDA_SLOT_COUNT) * 100;
    }
    const startVis = Math.max(
      GRID_START_MIN,
      Math.min(GRID_LAST_SLOT_START_MIN, ex.start),
    );
    const endVis = Math.min(GRID_END_MIN, Math.max(ex.end, startVis + 30));
    let dur = Math.max(AGENDA_SLOT_MIN, endVis - startVis);
    dur = Math.min(dur, GRID_RANGE);
    const top = this.topPctBloco(b);
    const slots = dur / AGENDA_SLOT_MIN;
    const faixasVis = Math.min(AGENDA_SLOT_COUNT, slots + 1);
    const hPct = (faixasVis / AGENDA_SLOT_COUNT) * 100;
    return Math.min(hPct, Math.max(0, 100 - top));
  }

  horaBloco(b: AgendaHubBloco): string {
    const ex = this.extentMinutosBloco(b);
    if (!ex) return '';
    const mf = Math.floor(ex.start);
    const hh = Math.floor(mf / 60) % 24;
    const mm = mf % 60;
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }

  nomeClienteBloco(b: AgendaHubBloco): string {
    return (b.linhas[0]?.nomeCliente || '').trim() || '—';
  }

  /**
   * Uma entrada por linha de atendimento (sem duplicar texto igual).
   * Mega/Pacote com etapas: primeiro o título (`Mega •` / `Pacote •`), depois só os nomes das etapas.
   */
  itensResumoBloco(b: AgendaHubBloco): string[] {
    const linhas = b.linhas;
    const soMegaOuPacote = linhas.every((l) => {
      const t = (l.tipo || '').trim().toLowerCase();
      return t === 'mega' || t === 'pacote';
    });
    const comEtapaMegaPac = linhas.filter((l) => {
      const t = (l.tipo || '').trim().toLowerCase();
      return (
        (t === 'pacote' || t === 'mega') && (l.etapa || '').trim().length > 0
      );
    });
    if (soMegaOuPacote && comEtapaMegaPac.length > 0) {
      const t0 = (comEtapaMegaPac[0].tipo || '').trim().toLowerCase();
      let pacNome = (comEtapaMegaPac[0].pacote || '').trim();
      if (!pacNome) {
        pacNome = (
          linhas.find((x) => (x.pacote || '').trim())?.pacote || ''
        ).trim();
      }
      const out: string[] = [];
      const seen = new Set<string>();
      if (pacNome) {
        const titulo =
          t0 === 'mega' ? `Mega • ${pacNome}` : `Pacote • ${pacNome}`;
        out.push(titulo);
        seen.add(titulo);
      }
      for (const l of comEtapaMegaPac) {
        const et = (l.etapa || '').trim();
        if (!et || seen.has(et)) continue;
        seen.add(et);
        out.push(et);
      }
      if (out.length) return out;
    }
    const out: string[] = [];
    const seen = new Set<string>();
    for (const l of linhas) {
      const txt = linhaResumoAtendimentoLista(l).trim();
      if (!txt || seen.has(txt)) continue;
      seen.add(txt);
      out.push(txt);
    }
    return out;
  }

  /** Texto plano para aria-label / leitores. */
  rotuloBloco(b: AgendaHubBloco): string {
    const hora = this.horaBloco(b);
    const nome = this.nomeClienteBloco(b);
    const itens = this.itensResumoBloco(b);
    const partes: string[] = [];
    if (hora) partes.push(hora);
    partes.push(nome);
    if (itens.length) partes.push(itens.join('; '));
    return partes.join(' · ');
  }

  idAtendimentoBloco(b: AgendaHubBloco): string {
    return String(b.linhas[0]?.id || '').trim();
  }

  abrirDetalhesNaRececaoBloco(b: AgendaHubBloco, e: Event): void {
    e.stopPropagation();
    const id = this.idAtendimentoBloco(b);
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
