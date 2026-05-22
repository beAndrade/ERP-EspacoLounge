import { NgClass } from '@angular/common';
import {
  Component,
  ElementRef,
  HostListener,
  inject,
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
export class ClienteDrawerPeriodoFiltroComponent {
  private readonly hostEl = inject(ElementRef<HTMLElement>);
  private fecharPainelTimer: ReturnType<typeof setTimeout> | null = null;

  inicioYmd = model('');
  fimYmd = model('');

  periodoAlterado = output<void>();

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

  get campoAtivoIndex(): number {
    return this.campoAtivo === 'fim' ? 1 : 0;
  }

  get exibicaoInicio(): string {
    const y = this.inicioYmd().trim().slice(0, 10);
    return ymdValido(y) ? ymdExibicaoDdMmAaaa(y) : '';
  }

  get exibicaoFim(): string {
    const y = this.fimYmd().trim().slice(0, 10);
    return ymdValido(y) ? ymdExibicaoDdMmAaaa(y) : '';
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
    this.abrirPainelAnimado();
  }

  togglePainel(ev: Event): void {
    ev.stopPropagation();
    if (this.panelNoDom && this.panelAberto) {
      this.fecharPainel();
      return;
    }
    this.abrirPainelAnimado();
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
    }, PERIODO_FILTRO_ANIM_MS);
  }

  aplicarPreset(id: PeriodoPresetId): void {
    const p = periodoPreset(id);
    this.inicioYmd.set(p.inicioYmd);
    this.fimYmd.set(p.fimYmd);
    this.campoAtivo = 'fim';
    this.presetHoverId = null;
    this.hoverYmd = null;
    this.ancorarMesesNoIntervalo();
    this.periodoAlterado.emit();
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
    this.periodoAlterado.emit();
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

  private abrirPainelAnimado(): void {
    if (this.fecharPainelTimer != null) {
      clearTimeout(this.fecharPainelTimer);
      this.fecharPainelTimer = null;
    }
    this.ancorarMesesNoIntervalo();
    this.panelNoDom = true;
    this.panelAberto = false;
    queueMicrotask(() => {
      requestAnimationFrame(() => {
        this.panelAberto = true;
      });
    });
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
}
