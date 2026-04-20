import { Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SheetsApiService } from '../../core/services/sheets-api.service';
import { ProfissionalListaItem } from '../../core/models/api.models';

@Component({
  selector: 'app-profissionais',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './profissionais.component.html',
  styleUrl: './profissionais.component.scss',
})
export class ProfissionaisComponent implements OnInit {
  private readonly api = inject(SheetsApiService);

  busca = '';
  carregando = false;
  erro = '';
  salvando = false;
  erroForm = '';
  itens: ProfissionalListaItem[] = [];

  mostrarFormulario = false;
  editandoId: number | null = null;
  formNome = '';
  formAtivo = true;

  ngOnInit(): void {
    this.carregar();
  }

  carregar(): void {
    this.carregando = true;
    this.erro = '';
    this.api.listProfissionais(true).subscribe({
      next: (items) => {
        this.itens = items;
        this.carregando = false;
      },
      error: (e: Error) => {
        this.erro =
          e.message ||
          'Não foi possível carregar profissionais. Tente novamente.';
        this.carregando = false;
      },
    });
  }

  get filtrados(): ProfissionalListaItem[] {
    const q = this.busca.trim().toLowerCase();
    const base = this.itens.filter((p) => Boolean(p.nome?.trim()));
    if (!q) return base;
    return base.filter((p) => p.nome.toLowerCase().includes(q));
  }

  abrirNovo(): void {
    this.editandoId = null;
    this.formNome = '';
    this.formAtivo = true;
    this.erroForm = '';
    this.mostrarFormulario = true;
  }

  abrirEditar(p: ProfissionalListaItem): void {
    this.editandoId = p.id;
    this.formNome = p.nome.trim();
    this.formAtivo = p.ativo !== false;
    this.erroForm = '';
    this.mostrarFormulario = true;
  }

  cancelarForm(): void {
    this.mostrarFormulario = false;
    this.editandoId = null;
    this.erroForm = '';
  }

  salvar(): void {
    const nome = this.formNome.trim();
    if (!nome) {
      this.erroForm = 'Nome é obrigatório.';
      return;
    }
    this.salvando = true;
    this.erroForm = '';
    if (this.editandoId == null) {
      this.api.createProfissional({ nome, ativo: this.formAtivo }).subscribe({
        next: () => {
          this.salvando = false;
          this.mostrarFormulario = false;
          this.carregar();
        },
        error: (e: Error) => {
          this.salvando = false;
          this.erroForm =
            e.message || 'Não foi possível guardar. Tente novamente.';
        },
      });
    } else {
      this.api
        .updateProfissional({
          id: this.editandoId,
          nome,
          ativo: this.formAtivo,
        })
        .subscribe({
          next: () => {
            this.salvando = false;
            this.mostrarFormulario = false;
            this.carregar();
          },
          error: (e: Error) => {
            this.salvando = false;
            this.erroForm =
              e.message || 'Não foi possível guardar. Tente novamente.';
          },
        });
    }
  }

  rotuloStatus(p: ProfissionalListaItem): string {
    return p.ativo === false ? 'Inativo' : 'Ativo';
  }
}
