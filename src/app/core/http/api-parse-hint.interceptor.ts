import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';

const HINT =
  ' Confirme que a API Node está a correr (na pasta api: npm run dev ou npm start, porta 3000). ' +
  'Se o pedido passou pelo proxy do ng serve e a API estava parada, o servidor pode ter devolvido HTML em vez de JSON.';

/**
 * Melhora a mensagem quando o corpo não é JSON (típico: API parada + proxy a devolver HTML).
 */
export const apiParseHintInterceptor: HttpInterceptorFn = (req, next) =>
  next(req).pipe(
    catchError((err: unknown) => {
      if (err instanceof HttpErrorResponse) {
        const m = err.message ?? '';
        if (/failure during parsing|parse/i.test(m)) {
          return throwError(() => new Error(m + HINT));
        }
        if (
          typeof err.error === 'string' &&
          err.error.trimStart().startsWith('<!') &&
          err.status >= 400
        ) {
          return throwError(
            () =>
              new Error(
                `O servidor devolveu uma página HTML (${req.method} ${req.url}).${HINT}`,
              ),
          );
        }
      }
      return throwError(() => err);
    }),
  );
