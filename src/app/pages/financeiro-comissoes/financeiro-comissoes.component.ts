import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { FolhaListaItem } from '../../core/models/api.models';
import { AdminPinService } from '../../core/services/admin-pin.service';
import { SheetsApiService } from '../../core/services/sheets-api.service';

function periodoAtualYm(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

@Component({
  selector: 'app-financeiro-comissoes',
  standalone: true,
  imports: [RouterLink, FormsModule],
  templateUrl: './financeiro-comissoes.component.html',
  styleUrl: './financeiro-comissoes.component.scss',
})
export class FinanceiroComissoesComponent {
  private readonly api = inject(SheetsApiService);
  readonly adminPin = inject(AdminPinService);

  periodoYm = periodoAtualYm();
  pinDraft = '';

  carregando = false;
  erro = '';
  itens: FolhaListaItem[] = [];
  ultimoRecalculo: string | null = null;

  constructor() {
    this.pinDraft = this.adminPin.getPin();
    if (this.adminPin.hasPin()) {
      this.carregar();
    }
  }

  salvarPinECarregar(): void {
    this.adminPin.setPin(this.pinDraft);
    this.erro = '';
    this.carregar();
  }

  terminarSessaoPin(): void {
    this.adminPin.clear();
    this.pinDraft = '';
    this.itens = [];
    this.erro = '';
    this.ultimoRecalculo = null;
  }

  carregar(): void {
    const p = String(this.periodoYm || '').trim().slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(p)) {
      this.erro = 'Período inválido (use AAAA-MM).';
      return;
    }
    if (!this.adminPin.hasPin()) {
      this.erro = 'Introduza o PIN de administrador e guarde.';
      return;
    }
    this.periodoYm = p;
    this.carregando = true;
    this.erro = '';
    this.api.listFolha(p).subscribe({
      next: (rows) => {
        this.itens = rows;
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

  recalcular(): void {
    const p = String(this.periodoYm || '').trim().slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(p)) {
      this.erro = 'Período inválido.';
      return;
    }
    if (!this.adminPin.hasPin()) {
      this.erro = 'PIN em falta.';
      return;
    }
    this.carregando = true;
    this.erro = '';
    this.api.recalcularFolhaComissoes(p).subscribe({
      next: (r) => {
        this.ultimoRecalculo = `${r.linhas_folha_atualizadas} linha(s) de folha atualizada(s).`;
        this.carregando = false;
        this.carregar();
      },
      error: (e: Error) => {
        this.carregando = false;
        this.erro = e.message || 'Falha ao recalcular.';
      },
    });
  }

}
