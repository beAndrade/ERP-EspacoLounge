import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AdminPinService } from '../services/admin-pin.service';

const PIN_PATH_MARKERS = [
  '/api/folha',
  '/api/financeiro',
  '/api/caixa',
  '/api/movimentacoes',
  '/api/despesas',
];

function urlNeedsFinanceiroPin(url: string): boolean {
  if (url.includes('/api/financeiro/formas-pagamento/opcoes')) {
    return false;
  }
  return PIN_PATH_MARKERS.some((m) => url.includes(m));
}

/** Anexa `X-Admin-Pin` aos pedidos financeiros quando o PIN está definido. */
export const adminFolhaPinInterceptor: HttpInterceptorFn = (req, next) => {
  const pin = inject(AdminPinService).getPin();
  if (!pin || !urlNeedsFinanceiroPin(req.url)) {
    return next(req);
  }
  return next(
    req.clone({
      setHeaders: { 'X-Admin-Pin': pin },
    }),
  );
};
