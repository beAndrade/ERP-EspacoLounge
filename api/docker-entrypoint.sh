#!/bin/sh
set -e

# Peças da ligação (Dokploy Environment).
# DB_HOST tem prioridade: se estiver definido, a URL é sempre remontada
# (ignora DATABASE_URL antiga com host "db").
DB_HOST="${DB_HOST:-db}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USER:-postgres}"
DB_NAME="${DB_NAME:-espaco_lounge}"

build_url() {
  printf 'postgresql://%s:%s@%s:%s/%s' \
    "${DB_USER}" "${POSTGRES_PASSWORD}" "${DB_HOST}" "${DB_PORT}" "${DB_NAME}"
}

# Se há senha, montamos/remontamos a URL com o DB_HOST actual.
# Assim DB_HOST no painel Dokploy nunca é ignorado por um DATABASE_URL antigo.
if [ -n "${POSTGRES_PASSWORD:-}" ]; then
  export DATABASE_URL="$(build_url)"
  echo "DATABASE_URL → user=${DB_USER} host=${DB_HOST} port=${DB_PORT} db=${DB_NAME}"
elif [ -z "${DATABASE_URL:-}" ]; then
  echo "ERRO: DATABASE_URL e POSTGRES_PASSWORD estão vazias."
  echo "No Dokploy (Environment) defina POSTGRES_PASSWORD e, se preciso, DB_HOST."
  exit 1
else
  echo "A usar DATABASE_URL já definida (POSTGRES_PASSWORD vazio)."
fi

case "${DATABASE_URL}" in
  *localhost*|*127.0.0.1*|*"::1"*)
    echo "ERRO: DATABASE_URL aponta para localhost."
    echo "Defina DB_HOST com o nome DNS/container do Postgres (Dokploy → Docker)."
    exit 1
    ;;
esac

if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  echo "Aplicando migrações Drizzle (host=${DB_HOST})..."
  npm run db:migrate
fi

exec npm start
