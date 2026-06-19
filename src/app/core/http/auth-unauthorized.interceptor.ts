import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { extractApiErrorMessage } from '../utils/api-error-message';

/**
 * Sessão inválida ou expirada: limpa o token e volta ao login.
 * (O guard valida no arranque; este interceptor cobre expiração a meio da utilização.)
 */
export const authUnauthorizedInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return next(req).pipe(
    catchError((err: unknown) => {
      if (!(err instanceof HttpErrorResponse) || err.status !== 401) {
        return throwError(() => err);
      }

      const url = req.url;
      if (url.includes('/api/auth/login') || url.includes('/api/auth/me')) {
        return throwError(() => err);
      }

      const msg =
        extractApiErrorMessage(err.error) ??
        'Sessão expirada ou inválida. Faça login novamente.';

      auth.marcarSessaoExpirada();
      auth.logout(false);
      void router.navigate(['/login'], {
        queryParams: { motivo: 'sessao' },
      });

      return throwError(() => new Error(msg));
    }),
  );
};
