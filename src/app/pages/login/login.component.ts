import {
  AfterViewInit,
  Component,
  ElementRef,
  OnInit,
  ViewChild,
  inject,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { extractApiErrorMessage } from '../../core/utils/api-error-message';

/** E-mail lembrado entre logins (senha fica no gerenciador do navegador). */
const EMAIL_LEMBRADO_KEY = 'espaco-lounge-login-email';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent implements OnInit, AfterViewInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  @ViewChild('senhaInput')
  private readonly senhaInput?: ElementRef<HTMLInputElement>;

  email = '';
  senha = '';
  lembrar = true;
  mostrarSenha = false;
  carregando = false;
  erro = '';
  modalSessaoExpirada = false;

  ngOnInit(): void {
    this.preencherEmailLembrado();
    this.avaliarModalSessaoExpirada();
    if (this.auth.bootstrapped() && this.auth.isLoggedIn()) {
      void this.router.navigate(['/painel']);
    }
  }

  ngAfterViewInit(): void {
    /** E-mail lembrado: foco direto na senha. */
    if (this.email) {
      this.senhaInput?.nativeElement.focus();
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
    this.auth.login(email, senha, this.lembrar).subscribe({
      next: () => {
        this.carregando = false;
        this.gravarEmailLembrado(email);
        void this.router.navigate(['/painel']);
      },
      error: (e: unknown) => {
        this.carregando = false;
        this.erro =
          extractApiErrorMessage(e) ??
          'Não foi possível entrar. Verifique e-mail e senha.';
      },
    });
  }

  private preencherEmailLembrado(): void {
    try {
      const salvo = localStorage.getItem(EMAIL_LEMBRADO_KEY)?.trim();
      if (salvo) {
        this.email = salvo;
        this.lembrar = true;
      }
    } catch {
      /* ignore */
    }
  }

  /** Só grava após login bem-sucedido; desmarcado limpa o e-mail salvo. */
  private gravarEmailLembrado(email: string): void {
    try {
      if (this.lembrar) {
        localStorage.setItem(EMAIL_LEMBRADO_KEY, email);
      } else {
        localStorage.removeItem(EMAIL_LEMBRADO_KEY);
      }
    } catch {
      /* ignore */
    }
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
