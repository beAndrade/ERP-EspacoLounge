import { Component, inject, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { SheetsApiService } from '../../core/services/sheets-api.service';
import { Cliente } from '../../core/models/api.models';

@Component({
  selector: 'app-clientes',
  standalone: true,
  imports: [RouterLink, FormsModule],
  templateUrl: './clientes.component.html',
  styleUrl: './clientes.component.scss',
})
export class ClientesComponent implements OnInit {
  private readonly api = inject(SheetsApiService);

  busca = '';
  carregando = false;
  erro = '';
  /** Durante DELETE na API (por `id` do cliente). */
  excluindoId: string | null = null;
  itens: Cliente[] = [];

  ngOnInit(): void {
    this.carregar();
  }

  carregar(): void {
    this.carregando = true;
    this.erro = '';
    this.api.listClientes().subscribe({
      next: (items) => {
        this.itens = items;
        this.carregando = false;
      },
      error: (e: Error) => {
        this.erro =
          e.message ||
          'Não foi possível carregar clientes. Tente novamente.';
        this.carregando = false;
      },
    });
  }

  /** Mesmo critério da API: só linhas com ID e nome preenchidos. */
  get comDadosValidos(): Cliente[] {
    return this.itens.filter((c) => Boolean(c.id?.trim() && c.nome?.trim()));
  }

  get filtrados(): Cliente[] {
    const q = this.busca.trim().toLowerCase();
    const base = this.comDadosValidos;
    if (!q) return base;
    return base.filter(
      (c) =>
        (c.nome && c.nome.toLowerCase().includes(q)) ||
        (c.telefone && String(c.telefone).includes(q)) ||
        (c.observacoes && String(c.observacoes).toLowerCase().includes(q)),
    );
  }

  confirmarExcluir(c: Cliente): void {
    const nome = String(c.nome ?? '').trim() || c.id;
    if (
      !confirm(
        `Excluir o cliente "${nome}"? O cadastro será removido do banco de dados, juntamente com os atendimentos associados a este cliente.`,
      )
    ) {
      return;
    }
    this.excluindoId = c.id;
    this.erro = '';
    this.api.deleteCliente(c.id).subscribe({
      next: () => {
        this.excluindoId = null;
        this.itens = this.itens.filter((x) => x.id !== c.id);
      },
      error: (e: Error) => {
        this.excluindoId = null;
        this.erro =
          e.message || 'Não foi possível excluir o cliente. Tente novamente.';
      },
    });
  }
}
