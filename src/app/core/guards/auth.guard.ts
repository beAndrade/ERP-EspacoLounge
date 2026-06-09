import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map, of } from 'rxjs';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isLoggedIn()) return true;

  if (!auth.bootstrapped()) {
    return auth.bootstrapSession().pipe(
      map((ok) => {
        if (ok) return true;
        return router.createUrlTree(['/login']);
      }),
    );
  }

  return of(router.createUrlTree(['/login']));
};
