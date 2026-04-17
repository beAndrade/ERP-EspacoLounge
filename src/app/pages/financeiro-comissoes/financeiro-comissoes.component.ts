import { Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { FolhaListaItem } from '../../core/models/api.models';
import { AdminPinService } from '../../core/services/admin-pin.service';
import { SheetsApiService } from '../../core/services/sheets-api.service';

function periodoAtualYm(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const MESES_PT: ReadonlyArray<{ v: string; nome: string }> = [
  { v: '01', nome: 'Janeiro' },
  { v: '02', nome: 'Fevereiro' },
  { v: '03', nome: 'Março' },
  { v: '04', nome: 'Abril' },
  { v: '05', nome: 'Maio' },
  { v: '06', nome: 'Junho' },
  { v: '07', nome: 'Julho' },
  { v: '08', nome: 'Agosto' },
  { v: '09', nome: 'Setembro' },
  { v: '10', nome: 'Outubro' },
  { v: '11', nome: 'Novembro' },
  { v: '12', nome: 'Dezembro' },
];

function anosCompetenciaRange(): number[] {
  const y = new Date().getFullYear();
  const out: number[] = [];
  for (let i = y - 3; i <= y + 5; i++) {
    out.push(i);
  }
  return out;
}

@Component({
  selector: 'app-financeiro-comissoes',
  standalone: true,
  imports: [RouterLink, FormsModule],
  templateUrl: './financeiro-comissoes.component.html',
  styleUrl: './financeiro-comissoes.component.scss',
})
export class FinanceiroComissoesComponent implements OnInit {
  private readonly api = inject(SheetsApiService);
  readonly adminPin = inject(AdminPinService);

  readonly mesesPt = MESES_PT;
  readonly anosCompetencia = anosCompetenciaRange();

  periodoYm = periodoAtualYm();

  carregando = false;
  erro = '';
  itens: FolhaListaItem[] = [];
  ultimoRecalculo: string | null = null;

  ngOnInit(): void {
    if (this.adminPin.hasPin()) {
      this.carregar();
    }
  }

  mesCompetencia(): string {
    const p = String(this.periodoYm || '').trim().slice(0, 7);
    const m = p.split('-')[1];
    return m && /^\d{2}$/.test(m) ? m : '01';
  }

  anoCompetencia(): string {
    const p = String(this.periodoYm || '').trim().slice(0, 7);
    const y = p.split('-')[0];
    const n = y && /^\d{4}$/.test(y) ? parseInt(y, 10) : new Date().getFullYear();
    return String(n);
  }

  onMesCompetenciaChange(v: string): void {
    this.periodoYm = `${this.anoCompetencia()}-${v}`;
  }

  onAnoCompetenciaChange(y: string): void {
    this.periodoYm = `${y}-${this.mesCompetencia()}`;
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
