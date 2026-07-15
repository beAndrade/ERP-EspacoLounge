import { NgClass } from '@angular/common';
import {
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  Renderer2,
  inject,
  input,
  model,
  output,
} from '@angular/core';
import { toYmd } from '../../core/utils/atendimento-display';
import {
  PERIODO_DIAS_SEMANA,
  PERIODO_PRESETS,
  type CelulaCalendarioPeriodo,
  type PeriodoFiltroCampoAtivo,
  type PeriodoPresetId,
  celulasMesCalendario,
  compararYmd,
  inicioDoMes,
  normalizarIntervaloYmd,
  periodoSegmentoLinha,
  periodoPreset,
  tituloMesCalendario,
  ymdExibicaoBelasis,
  ymdExibicaoDdMmAaaa,
  ymdValido,
} from './cliente-periodo-filtro.util';

/** Alinhado ao indicador lateral da ficha (`cliente-nav__indicator`). */
export const PERIODO_FILTRO_ANIM_MS = 340;

@Component({
  selector: 'app-cliente-drawer-periodo-filtro',
  standalone: true,
  imports: [NgClass],
  templateUrl: './cliente-drawer-periodo-filtro.component.html',
  styleUrl: './cliente-drawer-periodo-filtro.component.scss',
})
export class ClienteDrawerPeriodoFiltroComponent implements OnDestroy {
  private readonly hostEl = inject(ElementRef<HTMLElement>);
  private readonly renderer = inject(Renderer2);
  private fecharPainelTimer: ReturnType<typeof setTimeout> | null = null;
  private painelPortalizado = false;
  private portalBackdrop: HTMLElement | null = null;
  private portalPanel: HTMLElement | null = null;

  inicioYmd = model('');
  fimYmd = model('');

  /**
   * `true`: painel em `position: fixed` abaixo da barra (evita corte por `overflow: hidden`
   * em sidebars estreitas). `false`: posicionamento absoluto ao anchor (drawer cliente).
   */
  painelFlutuante = input(false);

  /** Sem escurecer o fundo ao abrir o calendário (ex.: sidebar estreita). */
  semBackdropEscuro = input(false);

  /** Barra compacta da sidebar de comissões (seta, cursor texto, sublinhado). */
  layoutComissoesSidebar = input(false);

  /** Botão com ícone de calendário à direita da barra (inputs já abrem o painel se `false`). */
  mostrarBotaoCalendario = input(true);

  /** Ícone decorativo na barra (sem botão; ex.: filtro centro de comissões). */
  mostrarIconeCalendario = input(false);

  /** Um único sublinhado que desliza entre data inicial e final (ex.: filtro centro). */
  sublinhadoDeslizante = input(false);

  /** `belasis`: `27 mai, 2026` + barra só com borda inferior. */
  exibicaoFormato = input<'padrao' | 'belasis'>('padrao');

  /** Emite o intervalo confirmado (YMD) para o pai não depender só do two-way binding. */
  periodoAlterado = output<{ inicioYmd: string; fimYmd: string }>();

  /** Posição viewport do painel flutuante (`top`/`left` em px). */
  panelPos: { top: number; left: number } | null = null;

  readonly presets = PERIODO_PRESETS;
  readonly diasSemana = PERIODO_DIAS_SEMANA;
  readonly hojeYmd = toYmd(new Date());

  /** Mantém o painel no DOM durante a animação de saída. */
  panelNoDom = false;
  /** Estado visual aberto (opacity/transform). */
  panelAberto = false;
  campoAtivo: PeriodoFiltroCampoAtivo = 'inicio';
  /** Dia sob o cursor — pré-visualização manual no calendário. */
  hoverYmd: string | null = null;
  /** Preset sob o cursor — pré-visualização no calendário (prioridade sobre hoverYmd). */
  presetHoverId: PeriodoPresetId | null = null;
  mesEsquerda = inicioDoMes(new Date());

  /** `left`/`width` em px do sublinhado deslizante (relativo a `.periodo-filtro__inputs`). */
  sublinhadoLeft = 0;
  sublinhadoWidth = 0;

  get campoAtivoIndex(): number {
    return this.campoAtivo === 'fim' ? 1 : 0;
  }

  get exibicaoInicio(): string {
    const y = this.inicioYmd().trim().slice(0, 10);
    if (!ymdValido(y)) return '';
    return this.exibicaoFormato() === 'belasis'
      ? ymdExibicaoBelasis(y)
      : ymdExibicaoDdMmAaaa(y);
  }

  get exibicaoFim(): string {
    const y = this.fimYmd().trim().slice(0, 10);
    if (!ymdValido(y)) return '';
    return this.exibicaoFormato() === 'belasis'
      ? ymdExibicaoBelasis(y)
      : ymdExibicaoDdMmAaaa(y);
  }

  get mesDireita(): Date {
    const m = this.mesEsquerda;
    return inicioDoMes(new Date(m.getFullYear(), m.getMonth() + 1, 1));
  }

  celulasEsquerda(): CelulaCalendarioPeriodo[] {
    return celulasMesCalendario(this.mesEsquerda);
  }

  celulasDireita(): CelulaCalendarioPeriodo[] {
    return celulasMesCalendario(this.mesDireita);
  }

  tituloEsquerda(): string {
    return tituloMesCalendario(this.mesEsquerda);
  }

  tituloDireita(): string {
    return tituloMesCalendario(this.mesDireita);
  }

  abrirCampo(campo: PeriodoFiltroCampoAtivo, ev?: Event): void {
    ev?.stopPropagation();
    this.campoAtivo = campo;
    this.agendarSublinhadoDeslizante();
    if (this.calendarioInterativo()) {
      this.limparHoverPainel();
      if (this.painelFlutuante()) {
        queueMicrotask(() => this.atualizarPosicaoPainelFlutuante());
      }
      return;
    }
    this.abrirPainelAnimado();
  }

  /** Painel aberto ou em animação de abertura (evita reabrir/fechar ao trocar de campo). */
  private calendarioInterativo(): boolean {
    if (this.panelAberto) return true;
    return this.panelNoDom && this.fecharPainelTimer == null;
  }

  togglePainel(ev: Event): void {
    ev.stopPropagation();
    if (this.panelNoDom && this.panelAberto) {
      this.fecharPainel();
      return;
    }
    this.abrirPainelAnimado();
  }

  @HostListener('document:mousedown', ['$event'])
  fecharSeCliqueFora(ev: MouseEvent): void {
    if (!this.panelAberto || !this.panelNoDom) return;
    const alvo = ev.target;
    if (!(alvo instanceof Node)) return;
    if (this.hostEl.nativeElement.contains(alvo)) return;
    const painel =
      this.portalPanel ??
      (this.hostEl.nativeElement.querySelector(
        '.periodo-filtro__panel',
      ) as HTMLElement | null);
    if (painel?.contains(alvo)) return;
    this.fecharPainel();
  }

  fecharPainel(): void {
    if (!this.panelNoDom) return;
    this.limparHoverPainel();
    this.panelAberto = false;
    if (this.fecharPainelTimer != null) {
      clearTimeout(this.fecharPainelTimer);
    }
    this.fecharPainelTimer = setTimeout(() => {
      this.fecharPainelTimer = null;
      this.panelNoDom = false;
      this.panelPos = null;
      this.restaurarPainelNoHost();
    }, PERIODO_FILTRO_ANIM_MS);
  }

  ngOnDestroy(): void {
    if (this.fecharPainelTimer != null) {
      clearTimeout(this.fecharPainelTimer);
      this.fecharPainelTimer = null;
    }
    this.restaurarPainelNoHost();
  }

  aplicarPreset(id: PeriodoPresetId): void {
    const p = periodoPreset(id);
    this.inicioYmd.set(p.inicioYmd);
    this.fimYmd.set(p.fimYmd);
    this.campoAtivo = 'fim';
    this.presetHoverId = null;
    this.hoverYmd = null;
    this.ancorarMesesNoIntervalo();
    this.emitPeriodoAlterado();
    this.fecharPainel();
  }

  hoverPreset(id: PeriodoPresetId): void {
    this.presetHoverId = id;
    this.hoverYmd = null;
    const p = periodoPreset(id);
    if (ymdValido(p.inicioYmd)) {
      const [y, mo] = p.inicioYmd.split('-').map((x) => parseInt(x, 10));
      this.mesEsquerda = inicioDoMes(new Date(y, mo - 1, 1));
    }
  }

  hoverDia(ymd: string | null): void {
    if (!ymd || !ymdValido(ymd)) return;
    this.presetHoverId = null;
    this.hoverYmd = ymd;
  }

  limparHoverPainel(): void {
    this.hoverYmd = null;
    this.presetHoverId = null;
  }

  painelComPreviewHover(): boolean {
    if (!this.panelAberto) return false;
    if (this.presetHoverId != null) return true;
    const hover = this.hoverYmd?.trim().slice(0, 10) ?? '';
    return ymdValido(hover);
  }

  selecionarDia(ymd: string | null): void {
    if (!ymd || !ymdValido(ymd)) return;

    if (this.campoAtivo === 'inicio') {
      const fimAtual = this.fimYmd().trim().slice(0, 10);
      if (ymdValido(fimAtual)) {
        const norm = normalizarIntervaloYmd(ymd, fimAtual);
        this.inicioYmd.set(norm.inicioYmd);
        this.fimYmd.set(norm.fimYmd);
      } else {
        this.inicioYmd.set(ymd);
        this.fimYmd.set(ymd);
      }
      this.campoAtivo = 'fim';
      this.agendarSublinhadoDeslizante();
      return;
    }

    let ini = this.inicioYmd().trim().slice(0, 10);
    let fim = ymd;
    if (!ymdValido(ini)) {
      ini = ymd;
      this.inicioYmd.set(ini);
    }
    const norm = normalizarIntervaloYmd(ini, fim);
    this.inicioYmd.set(norm.inicioYmd);
    this.fimYmd.set(norm.fimYmd);
    this.emitPeriodoAlterado();
    this.fecharPainel();
  }

  classeDia(ymd: string | null, foraMes: boolean): Record<string, boolean> {
    if (!ymd || !ymdValido(ymd)) {
      return { 'periodo-filtro__day-btn': true, 'periodo-filtro__day-btn--empty': true };
    }

    const vis = this.intervaloVisual();
    const ini = vis.inicioYmd;
    const fim = vis.fimYmd;
    const temIni = ymdValido(ini);
    const temFim = ymdValido(fim);
    const noIntervalo =
      temIni && temFim && compararYmd(ymd, ini) >= 0 && compararYmd(ymd, fim) <= 0;
    const unico = temIni && temFim && ini === fim && ymd === ini;
    const seg =
      noIntervalo && !unico ? periodoSegmentoLinha(ymd, ini, fim) : { segInicio: false, segFim: false };

    return {
      'periodo-filtro__day-btn': true,
      'periodo-filtro__day-btn--fora-mes': foraMes,
      'periodo-filtro__day-btn--in-range':
        noIntervalo && !unico && ymd !== ini && ymd !== fim,
      'periodo-filtro__day-btn--range-start':
        (noIntervalo && ymd === ini) || (temIni && !temFim && ymd === ini) || unico,
      'periodo-filtro__day-btn--range-end':
        (noIntervalo && temFim && ymd === fim) || unico,
      'periodo-filtro__day-btn--seg-inicio': seg.segInicio && ymd !== ini,
      'periodo-filtro__day-btn--seg-fim': seg.segFim && ymd !== fim,
      'periodo-filtro__day-btn--hoje': ymd === this.hojeYmd,
    };
  }

  /** Intervalo desenhado no calendário (confirmado ou pré-visualização no hover). */
  private intervaloVisual(): { inicioYmd: string; fimYmd: string } {
    const ini = this.inicioYmd().trim().slice(0, 10);
    const fim = this.fimYmd().trim().slice(0, 10);

    if (this.panelAberto && this.presetHoverId != null) {
      return periodoPreset(this.presetHoverId);
    }

    const hover = this.hoverYmd?.trim().slice(0, 10) ?? '';
    const temIni = ymdValido(ini);
    const temFim = ymdValido(fim);

    if (!this.panelAberto || !ymdValido(hover)) {
      return { inicioYmd: ini, fimYmd: fim };
    }

    if (this.campoAtivo === 'inicio' && !temIni) {
      return { inicioYmd: hover, fimYmd: hover };
    }

    if (this.campoAtivo === 'inicio' && temIni && temFim) {
      return normalizarIntervaloYmd(hover, fim);
    }

    if (this.campoAtivo === 'inicio' && temIni) {
      return normalizarIntervaloYmd(ini, hover);
    }

    if (this.campoAtivo === 'fim' && temIni) {
      return normalizarIntervaloYmd(ini, hover);
    }

    return { inicioYmd: ini, fimYmd: fim };
  }

  anoAnterior(): void {
    const m = this.mesEsquerda;
    this.mesEsquerda = inicioDoMes(new Date(m.getFullYear() - 1, m.getMonth(), 1));
  }

  mesAnterior(): void {
    const m = this.mesEsquerda;
    this.mesEsquerda = inicioDoMes(new Date(m.getFullYear(), m.getMonth() - 1, 1));
  }

  mesSeguinte(): void {
    const m = this.mesEsquerda;
    this.mesEsquerda = inicioDoMes(new Date(m.getFullYear(), m.getMonth() + 1, 1));
  }

  anoSeguinte(): void {
    const m = this.mesEsquerda;
    this.mesEsquerda = inicioDoMes(new Date(m.getFullYear() + 1, m.getMonth(), 1));
  }

  @HostListener('document:keydown.escape', ['$event'])
  fecharSeEscape(ev: KeyboardEvent): void {
    if (!this.panelNoDom || !this.panelAberto) return;
    ev.preventDefault();
    ev.stopImmediatePropagation();
    this.fecharPainel();
  }

  @HostListener('window:scroll')
  @HostListener('window:resize')
  reposicionarPainelSeFlutuante(): void {
    if (!this.painelFlutuante() || !this.panelAberto) return;
    this.atualizarPosicaoPainelFlutuante();
    this.agendarSublinhadoDeslizante();
  }

  private abrirPainelAnimado(): void {
    if (this.calendarioInterativo()) {
      this.agendarSublinhadoDeslizante();
      return;
    }
    if (this.fecharPainelTimer != null) {
      clearTimeout(this.fecharPainelTimer);
      this.fecharPainelTimer = null;
    }
    this.ancorarMesesNoIntervalo();
    if (this.painelFlutuante()) {
      this.atualizarPosicaoPainelFlutuante();
    } else {
      this.panelPos = null;
    }
    this.panelNoDom = true;
    this.panelAberto = false;
    this.agendarSublinhadoDeslizante();
    queueMicrotask(() => {
      requestAnimationFrame(() => {
        if (this.painelFlutuante()) {
          this.portalizarPainelFlutuante();
          this.atualizarPosicaoPainelFlutuante();
        }
        this.panelAberto = true;
        this.agendarSublinhadoDeslizante();
      });
    });
  }

  private agendarSublinhadoDeslizante(): void {
    if (!this.sublinhadoDeslizante()) return;
    queueMicrotask(() => {
      requestAnimationFrame(() => {
        this.atualizarSublinhadoDeslizante();
        requestAnimationFrame(() => this.atualizarSublinhadoDeslizante());
      });
    });
  }

  private atualizarSublinhadoDeslizante(): void {
    if (!this.sublinhadoDeslizante()) return;
    const wrap = this.hostEl.nativeElement.querySelector(
      '.periodo-filtro__inputs',
    ) as HTMLElement | null;
    const field = this.hostEl.nativeElement.querySelector(
      this.campoAtivo === 'fim'
        ? '.periodo-filtro__field--fim'
        : '.periodo-filtro__field--inicio',
    ) as HTMLElement | null;
    if (!wrap || !field) return;
    const wr = wrap.getBoundingClientRect();
    const fr = field.getBoundingClientRect();
    this.sublinhadoLeft = Math.round(fr.left - wr.left);
    this.sublinhadoWidth = Math.round(fr.width);
  }

  /** Evita corte por `overflow`/`transform` em sidebars (fixed relativo ao ancestral). */
  private portalizarPainelFlutuante(): void {
    if (!this.painelFlutuante() || !this.panelNoDom || this.painelPortalizado) return;

    const wrap = this.hostEl.nativeElement.querySelector(
      '.periodo-filtro',
    ) as HTMLElement | null;
    const bar = wrap?.querySelector('.periodo-filtro__bar') as HTMLElement | null;
    const backdrop = wrap?.querySelector(
      '.periodo-filtro__backdrop',
    ) as HTMLElement | null;
    const panel = wrap?.querySelector('.periodo-filtro__panel') as HTMLElement | null;
    if (!wrap || !bar || !backdrop || !panel) return;

    this.portalBackdrop = backdrop;
    this.portalPanel = panel;
    this.renderer.appendChild(document.body, backdrop);
    this.renderer.appendChild(document.body, panel);
    this.renderer.addClass(backdrop, 'periodo-filtro__backdrop--portal');
    this.renderer.addClass(panel, 'periodo-filtro__panel--portal');
    this.painelPortalizado = true;
  }

  private restaurarPainelNoHost(): void {
    if (!this.painelPortalizado) return;

    const wrap = this.hostEl.nativeElement.querySelector(
      '.periodo-filtro',
    ) as HTMLElement | null;
    const bar = wrap?.querySelector('.periodo-filtro__bar') as HTMLElement | null;
    const backdrop = this.portalBackdrop;
    const panel = this.portalPanel;

    if (wrap && bar && backdrop && panel) {
      wrap.insertBefore(backdrop, bar);
      bar.insertAdjacentElement('afterend', panel);
      this.renderer.removeClass(backdrop, 'periodo-filtro__backdrop--portal');
      this.renderer.removeClass(panel, 'periodo-filtro__panel--portal');
    }

    this.portalBackdrop = null;
    this.portalPanel = null;
    this.painelPortalizado = false;
  }

  private atualizarPosicaoPainelFlutuante(): void {
    const anchor =
      (this.layoutComissoesSidebar()
        ? this.hostEl.nativeElement.querySelector('.periodo-filtro__bar')
        : null) ??
      (this.hostEl.nativeElement.querySelector(
        '.periodo-filtro__field--fim .periodo-filtro__field-row',
      ) as HTMLElement | null) ??
      (this.hostEl.nativeElement.querySelector(
        '.periodo-filtro__field--inicio .periodo-filtro__field-row',
      ) as HTMLElement | null) ??
      (this.hostEl.nativeElement.querySelector(
        '.periodo-filtro__bar',
      ) as HTMLElement | null);
    if (!anchor) return;
    const r = anchor.getBoundingClientRect();
    const gap = 6;
    const margem = 16;
    const larguraPainel = Math.min(640, window.innerWidth - margem * 2);
    let left = r.left;
    if (left + larguraPainel > window.innerWidth - margem) {
      left = Math.max(margem, window.innerWidth - margem - larguraPainel);
    }
    this.panelPos = {
      top: Math.round(r.bottom + gap),
      left: Math.round(left),
    };
  }

  private ancorarMesesNoIntervalo(): void {
    const ini = this.inicioYmd().trim().slice(0, 10);
    if (ymdValido(ini)) {
      const [y, mo] = ini.split('-').map((x) => parseInt(x, 10));
      this.mesEsquerda = inicioDoMes(new Date(y, mo - 1, 1));
      return;
    }
    this.mesEsquerda = inicioDoMes(new Date());
  }

  private emitPeriodoAlterado(): void {
    const norm = normalizarIntervaloYmd(this.inicioYmd(), this.fimYmd());
    this.periodoAlterado.emit({
      inicioYmd: norm.inicioYmd,
      fimYmd: norm.fimYmd,
    });
  }
}
