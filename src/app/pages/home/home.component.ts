import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiResponse } from '../../core/models/api.models';
import { SheetsApiService } from '../../core/services/sheets-api.service';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
})
export class HomeComponent implements OnInit {
  private readonly api = inject(SheetsApiService);

  status: 'idle' | 'loading' | 'ok' | 'erro' = 'idle';
  mensagemErro = '';

  ngOnInit(): void {
    this.status = 'loading';
    this.api.getHealth().subscribe({
      next: (res: ApiResponse<{ status: string; time?: string }>) => {
        if (res.ok) {
          this.status = 'ok';
        } else {
          this.status = 'erro';
          this.mensagemErro =
            res.error?.message ?? 'Não foi possível falar com a API.';
        }
      },
      error: (err: unknown) => {
        this.status = 'erro';
        this.mensagemErro = this.formatarErroConexao(err);
      },
    });
  }

  private formatarErroConexao(err: unknown): string {
    if (err instanceof Error && err.message) {
      return err.message;
    }
    if (err instanceof HttpErrorResponse) {
      if (err.status === 0) {
        return (
          'Sem resposta da rede (status 0). Confirme que a API Elysia está a correr (ex.: npm run start na pasta api), ' +
          'a URL em environment.apiBaseUrl e CORS (CORS_ORIGINS) se o front estiver noutro host.'
        );
      }
      return err.message || 'Falha na requisição.';
    }
    return 'Não foi possível conectar à API. Confira environment.apiBaseUrl e se o servidor está acessível.';
  }
}
