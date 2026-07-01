import { DatePipe } from '@angular/common';
import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { WhatsappService } from '../../../../core/services/whatsapp/whatsapp.service';
import type { WhatsappLogItem } from '../../../../core/models/whatsapp.model';

@Component({
  selector: 'app-whatsapp-logs-tab',
  standalone: true,
  imports: [DatePipe],
  templateUrl: './whatsapp-logs-tab.component.html',
  styleUrl: './whatsapp-logs-tab.component.scss',
})
export class WhatsappLogsTabComponent implements OnInit {
  private readonly wa = inject(WhatsappService);
  private readonly destroyRef = inject(DestroyRef);

  readonly carregando = signal(true);
  readonly erro = signal<string | null>(null);
  readonly items = signal<WhatsappLogItem[]>([]);
  readonly total = signal(0);
  readonly page = signal(1);
  readonly pageSize = 25;

  ngOnInit(): void {
    this.carregar();
  }

  carregar(): void {
    this.carregando.set(true);
    this.wa
      .listLogs({ page: this.page(), pageSize: this.pageSize })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => {
          this.items.set(data.items);
          this.total.set(data.total);
          this.carregando.set(false);
        },
        error: (e: Error) => {
          this.erro.set(WhatsappService.errorMessage(e));
          this.carregando.set(false);
        },
      });
  }

  paginaAnterior(): void {
    if (this.page() <= 1) return;
    this.page.update((p) => p - 1);
    this.carregar();
  }

  proximaPagina(): void {
    if (this.page() * this.pageSize >= this.total()) return;
    this.page.update((p) => p + 1);
    this.carregar();
  }

  classeStatus(status: string): string {
    return `wa-badge wa-badge--${status}`;
  }
}
