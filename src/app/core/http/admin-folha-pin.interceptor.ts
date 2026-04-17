import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AdminPinService } from '../services/admin-pin.service';

/** Anexa `X-Admin-Pin` aos pedidos a `/api/folha` quando o PIN está definido. */
export const adminFolhaPinInterceptor: HttpInterceptorFn = (req, next) => {
  const pin = inject(AdminPinService).getPin();
  if (!pin || !req.url.includes('/api/folha')) {
    return next(req);
  }
  return next(
    req.clone({
      setHeaders: { 'X-Admin-Pin': pin },
    }),
  );
};
