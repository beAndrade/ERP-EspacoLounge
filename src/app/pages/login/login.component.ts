import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { extractApiErrorMessage } from '../../core/utils/api-error-message';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  email = '';
  senha = '';
  mostrarSenha = false;
  carregando = false;
  erro = '';
  modalSessaoExpirada = false;

  ngOnInit(): void {
    this.avaliarModalSessaoExpirada();
    if (this.auth.bootstrapped() && this.auth.isLoggedIn()) {
      void this.router.navigate(['/agenda']);
    }
  }

  fecharModalSessaoExpirada(): void {
    this.modalSessaoExpirada = false;
    this.limparQueryMotivo();
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

  private avaliarModalSessaoExpirada(): void {
    const porQuery =
      this.route.snapshot.queryParamMap.get('motivo') === 'sessao';
    const porServico = this.auth.consumirAvisoSessaoExpirada();
    if (porQuery || porServico) {
      this.modalSessaoExpirada = true;
    }
  }

  private limparQueryMotivo(): void {
    if (this.route.snapshot.queryParamMap.get('motivo') !== 'sessao') {
      return;
    }
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { motivo: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
}
