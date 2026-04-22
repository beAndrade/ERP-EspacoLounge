import { Component, inject, OnInit } from '@angular/core';
import { FolhaListaItem } from '../../core/models/api.models';
import { AdminPinService } from '../../core/services/admin-pin.service';
import { SheetsApiService } from '../../core/services/sheets-api.service';

function periodoAtualYm(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const fmtBrl = (n: number): string =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
    n,
  );

/** API devolve snake_case; alguns proxies/clientes podem expor camelCase — normalizamos. */
function normalizarFolhaItem(raw: unknown): FolhaListaItem {
  const o = raw as Record<string, unknown>;
  const pickStr = (...keys: string[]): string | null => {
    for (const k of keys) {
      const v = o[k];
      if (v == null || v === '') continue;
      const s = String(v).trim();
      if (s !== '') return s;
    }
    return null;
  };
  /** Texto da planilha ou número vindo do JSON. */
  const pickMoeda = (...keys: string[]): string | null => {
    for (const k of keys) {
      const v = o[k];
      if (v == null || v === '') continue;
      if (typeof v === 'number' && Number.isFinite(v)) return fmtBrl(v);
      const s = String(v).trim();
      if (s !== '') return s;
    }
    return null;
  };
  const pidRaw = o['profissional_id'] ?? o['profissionalId'];
  const profissionalId =
    pidRaw != null && pidRaw !== '' && !Number.isNaN(Number(pidRaw))
      ? Number(pidRaw)
      : null;
  return {
    id: Number(o['id']),
    profissional_id: profissionalId,
    profissional: pickStr('profissional'),
    periodo_referencia: pickStr('periodo_referencia', 'periodoReferencia'),
    mes: pickStr('mes'),
    total_comissao: pickMoeda('total_comissao', 'totalComissao'),
    total_pago: pickMoeda('total_pago', 'totalPago'),
    saldo: pickMoeda('saldo'),
    status: pickStr('status'),
  };
}

@Component({
  selector: 'app-financeiro-comissoes',
  standalone: true,
  imports: [],
  templateUrl: './financeiro-comissoes.component.html',
  styleUrl: './financeiro-comissoes.component.scss',
})
export class FinanceiroComissoesComponent implements OnInit {
  private readonly api = inject(SheetsApiService);
  readonly adminPin = inject(AdminPinService);

  periodoYm = periodoAtualYm();

  carregando = false;
  erro = '';
  itens: FolhaListaItem[] = [];

  ngOnInit(): void {
    if (this.adminPin.hasPin()) {
      this.carregar();
    }
  }

  /** Exibe células monetárias de forma consistente (evita colunas “vazias” por tipo inesperado). */
  formatMoeda(v: string | null | undefined): string {
    if (v == null || String(v).trim() === '') return '—';
    const s = String(v).trim();
    if (/^R\$\s/i.test(s) || /^[\d.,R$\s-]+$/.test(s)) return s;
    return s;
  }

  carregar(): void {
    const p = String(this.periodoYm || '').trim().slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(p)) {
      this.erro = 'Período inválido (use AAAA-MM).';
      return;
    }
    if (!this.adminPin.hasPin()) {
      this.erro = 'Sessão sem PIN. Volte ao Financeiro e introduza o PIN.';
      return;
    }
    this.periodoYm = p;
    this.carregando = true;
    this.erro = '';
    this.api.listFolha(p).subscribe({
      next: (rows) => {
        this.itens = rows.map((r) => normalizarFolhaItem(r));
        this.carregando = false;
      },
      error: (e: Error) => {
        this.carregando = false;
        this.itens = [];
        this.erro =
          e.message ||
          'Não foi possível carregar a folha. Verifique o PIN e a API.';
      },
    });
  }
}
