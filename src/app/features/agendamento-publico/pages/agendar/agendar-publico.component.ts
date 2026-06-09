import { Component, DestroyRef, inject, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../../environments/environment';
import type { ApiResponse } from '../../../../core/models/api.models';
import { extractApiErrorMessage } from '../../../../core/utils/api-error-message';

interface ServicoPublico {
  id: string;
  nome: string;
  tipo: string | null;
  duracao_minutos: number;
}

interface ProfissionalPublico {
  id: number;
  nome: string;
  apelido: string | null;
}

@Component({
  selector: 'app-agendar-publico',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './agendar-publico.component.html',
  styleUrl: './agendar-publico.component.scss',
})
export class AgendarPublicoComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);
  private readonly baseUrl = environment.apiBaseUrl.replace(/\/$/, '');

  servicos: ServicoPublico[] = [];
  profissionais: ProfissionalPublico[] = [];
  slots: string[] = [];

  servicoId = '';
  profissionalId: number | null = null;
  data = '';
  readonly dataMin = this.dataMinima();
  hora = '';
  tamanho = '';
  nome = '';
  telefone = '';
  email = '';

  carregandoCatalogo = false;
  carregandoSlots = false;
  enviando = false;
  sucesso = false;
  erro = '';

  ngOnInit(): void {
    this.data = this.dataMinima();
    this.carregarCatalogo();
  }

  private dataMinima(): string {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  carregarCatalogo(): void {
    this.carregandoCatalogo = true;
    this.erro = '';
    this.http
      .get<ApiResponse<{ items: ServicoPublico[] }>>(
        `${this.baseUrl}/api/public/servicos`,
      )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (r) => {
          this.carregandoCatalogo = false;
          if (!r.ok) {
            this.erro = r.error?.message ?? 'Não foi possível carregar serviços.';
            return;
          }
          this.servicos = r.data?.items ?? [];
        },
        error: (e) => {
          this.carregandoCatalogo = false;
          this.erro =
            extractApiErrorMessage(e) ?? 'Não foi possível carregar serviços.';
        },
      });

    this.http
      .get<ApiResponse<{ items: ProfissionalPublico[] }>>(
        `${this.baseUrl}/api/public/profissionais`,
      )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (r) => {
          if (!r.ok) return;
          this.profissionais = r.data?.items ?? [];
        },
      });
  }

  aoMudarSelecao(): void {
    this.hora = '';
    this.slots = [];
    if (!this.servicoId || !this.profissionalId || !this.data) return;
    this.carregarSlots();
  }

  carregarSlots(): void {
    if (!this.servicoId || !this.profissionalId || !this.data) return;
    this.carregandoSlots = true;
    const params = new URLSearchParams({
      servico_id: this.servicoId,
      profissional_id: String(this.profissionalId),
      data: this.data,
    });
    if (this.tamanho.trim()) params.set('tamanho', this.tamanho.trim());

    this.http
      .get<ApiResponse<{ slots: string[] }>>(
        `${this.baseUrl}/api/public/disponibilidade?${params}`,
      )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (r) => {
          this.carregandoSlots = false;
          if (!r.ok) {
            this.erro = r.error?.message ?? 'Não foi possível carregar horários.';
            return;
          }
          this.slots = r.data?.slots ?? [];
          this.erro = '';
        },
        error: (e) => {
          this.carregandoSlots = false;
          this.erro =
            extractApiErrorMessage(e) ?? 'Não foi possível carregar horários.';
        },
      });
  }

  confirmar(): void {
    this.erro = '';
    if (
      !this.nome.trim() ||
      !this.telefone.trim() ||
      !this.servicoId ||
      !this.profissionalId ||
      !this.data ||
      !this.hora
    ) {
      this.erro = 'Preencha todos os campos obrigatórios.';
      return;
    }
    this.enviando = true;
    this.http
      .post<ApiResponse<{ id_atendimento: string }>>(
        `${this.baseUrl}/api/public/agendamentos`,
        {
          nome: this.nome.trim(),
          telefone: this.telefone.trim(),
          email: this.email.trim() || undefined,
          servico_id: this.servicoId,
          profissional_id: this.profissionalId,
          data: this.data,
          hora: this.hora,
          tamanho: this.tamanho.trim() || undefined,
        },
      )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (r) => {
          this.enviando = false;
          if (!r.ok) {
            this.erro = r.error?.message ?? 'Não foi possível confirmar.';
            return;
          }
          this.sucesso = true;
        },
        error: (e) => {
          this.enviando = false;
          this.erro =
            extractApiErrorMessage(e) ?? 'Não foi possível confirmar o agendamento.';
        },
      });
  }
}
