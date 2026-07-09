/**
 * Build Docker (nginx no mesmo host): pedidos vão para `/api/...` no mesmo domínio.
 * O `deploy/nginx.conf` faz proxy para o serviço `api`.
 */
export const environment = {
  production: true,
  apiBaseUrl: '',
};
