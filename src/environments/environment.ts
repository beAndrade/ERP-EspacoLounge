/**
 * Em dev, URL vazia → pedidos vão para `/api/...` no mesmo host do `ng serve`
 * e o proxy (`proxy.conf.json`) encaminha para `http://localhost:3000`.
 * Evita erros de CORS ao abrir o app em `127.0.0.1:4200` ou outro host local.
 */
export const environment = {
  production: false,
  apiBaseUrl: '',
};
