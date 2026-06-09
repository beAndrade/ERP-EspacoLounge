import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { extractApiErrorMessage } from '../../core/utils/api-error-message';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  email = '';
  senha = '';
  mostrarSenha = false;
  carregando = false;
  erro = '';

  constructor() {
    if (this.auth.isLoggedIn()) {
      void this.router.navigate(['/agenda']);
    }
  }

  entrar(): void {
    this.erro = '';
    const email = this.email.trim();
    const senha = this.senha;
    if (!email || !senha) {
      this.erro = 'Informe e-mail e senha.';
      return;
    }
    this.carregando = true;
    this.auth.login(email, senha).subscribe({
      next: () => {
        this.carregando = false;
        void this.router.navigate(['/agenda']);
      },
      error: (e: unknown) => {
        this.carregando = false;
        this.erro =
          extractApiErrorMessage(e) ??
          'Não foi possível entrar. Verifique e-mail e senha.';
      },
    });
  }
}
