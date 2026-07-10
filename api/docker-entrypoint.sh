#!/bin/sh
set -e

# Dokploy por vezes não injeta DATABASE_URL interpolada do compose.
# Preferimos montar a partir de POSTGRES_PASSWORD + host do serviço `db`.
DB_HOST="${DB_HOST:-db}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USER:-postgres}"
DB_NAME="${DB_NAME:-espaco_lounge}"

if [ -z "${DATABASE_URL:-}" ]; then
  if [ -z "${POSTGRES_PASSWORD:-}" ]; then
    echo "ERRO: DATABASE_URL e POSTGRES_PASSWORD estão vazias."
    echo "No Dokploy (Environment) defina pelo menos POSTGRES_PASSWORD."
    echo "URL esperada: postgresql://postgres:SENHA@db:5432/espaco_lounge"
    exit 1
  fi
  export DATABASE_URL="postgresql://${DB_USER}:${POSTGRES_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}"
  echo "DATABASE_URL montada a partir de POSTGRES_PASSWORD (host=${DB_HOST})."
fi

case "${DATABASE_URL}" in
  *localhost*|*127.0.0.1*|*"::1"*)
    echo "ERRO: DATABASE_URL aponta para localhost (${DATABASE_URL})."
    echo "Dentro do container use o host DNS do Postgres (ex.: db)."
    echo "Se ENOTFOUND: no Dokploy → Docker, copie o nome do container Postgres e defina DB_HOST=<nome>."
    exit 1
    ;;
esac

if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  echo "Aplicando migrações Drizzle..."
  npm run db:migrate
fi

exec npm start
