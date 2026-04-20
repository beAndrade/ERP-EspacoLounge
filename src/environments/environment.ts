/**
 * URL directa da API Elysia. A API já envia CORS para `http://localhost:4200`.
 * Evita depender do proxy do `ng serve` para `/api` — se a API estiver parada, o proxy
 * pode devolver HTML e o HttpClient falha com "Http failure during parsing".
 */
export const environment = {
  production: false,
  apiBaseUrl: 'http://localhost:3000',
};
