import {
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';

export type PainelMetricFormat = 'currency' | 'integer' | 'plain';

@Component({
  selector: 'app-painel-metric-value',
  standalone: true,
  templateUrl: './painel-metric-value.component.html',
  styleUrl: './painel-metric-value.component.scss',
})
export class PainelMetricValueComponent {
  private readonly destroyRef = inject(DestroyRef);

  readonly value = input<number | null>(null);
  readonly format = input<PainelMetricFormat>('plain');
  readonly prefix = input<string>('');
  readonly suffix = input<string>('');
  readonly emptyLabel = input<string>('—');
  /** Variação vs período anterior — flash verde/vermelho. */
  readonly delta = input<number | null>(null);

  readonly displayText = signal('—');
  readonly isUpdating = signal(false);
  readonly flashTone = signal<'neutral' | 'up' | 'down'>('neutral');

  private animFrame: number | null = null;
  private displayedNumeric = 0;
  private flashTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => {
      const next = this.value();
      if (next == null || Number.isNaN(next)) {
        this.cancelAnim();
        this.displayedNumeric = 0;
        this.displayText.set(this.emptyLabel());
        this.isUpdating.set(false);
        this.flashTone.set('neutral');
        return;
      }
      this.animateTo(next);
    });

    this.destroyRef.onDestroy(() => {
      this.cancelAnim();
      if (this.flashTimer != null) clearTimeout(this.flashTimer);
    });
  }

  private animateTo(target: number): void {
    const reduceMotion =
      typeof matchMedia === 'function' &&
      matchMedia('(prefers-reduced-motion: reduce)').matches;

    this.cancelAnim();
    const d = this.delta();
    let tone: 'neutral' | 'up' | 'down' = 'neutral';
    if (d != null && d > 0) tone = 'up';
    else if (d != null && d < 0) tone = 'down';
    this.flashTone.set(tone);
    this.isUpdating.set(true);
    if (this.flashTimer != null) clearTimeout(this.flashTimer);
    this.flashTimer = setTimeout(() => {
      this.isUpdating.set(false);
      this.flashTone.set('neutral');
    }, 520);

    if (reduceMotion) {
      this.displayedNumeric = target;
      this.displayText.set(this.formatValue(target));
      return;
    }

    const from = this.displayedNumeric;
    const started = performance.now();
    const duration = 450;

    const tick = (now: number): void => {
      const t = Math.min(1, (now - started) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const current = from + (target - from) * eased;
      this.displayedNumeric = current;
      this.displayText.set(this.formatValue(current));
      if (t < 1) {
        this.animFrame = requestAnimationFrame(tick);
      } else {
        this.displayedNumeric = target;
        this.displayText.set(this.formatValue(target));
        this.animFrame = null;
      }
    };

    this.animFrame = requestAnimationFrame(tick);
  }

  private cancelAnim(): void {
    if (this.animFrame != null) {
      cancelAnimationFrame(this.animFrame);
      this.animFrame = null;
    }
  }

  private formatValue(n: number): string {
    const fmt = this.format();
    const prefix = this.prefix();
    const suffix = this.suffix();
    let core: string;
    if (fmt === 'currency') {
      core = new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
      }).format(n);
    } else if (fmt === 'integer') {
      core = new Intl.NumberFormat('pt-BR', {
        maximumFractionDigits: 0,
      }).format(Math.round(n));
    } else {
      core = new Intl.NumberFormat('pt-BR', {
        maximumFractionDigits: 2,
      }).format(n);
    }
    return `${prefix}${core}${suffix}`;
  }
}
