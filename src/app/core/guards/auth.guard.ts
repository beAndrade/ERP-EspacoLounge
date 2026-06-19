import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map, of } from 'rxjs';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  /** Valida o JWT com `/api/auth/me` antes de entrar na app (evita 401 na agenda com token antigo). */
  if (!auth.bootstrapped()) {
    if (!auth.token) {
      auth.bootstrapped.set(true);
      return of(router.createUrlTree(['/login']));
    }
    return auth.bootstrapSession().pipe(
      map((ok) =>
        ok
          ? true
          : router.createUrlTree(['/login'], {
              queryParams: { motivo: 'sessao' },
            }),
      ),
    );
  }

  return auth.isLoggedIn()
    ? true
    : of(router.createUrlTree(['/login']));
};
