#!/bin/sh
set -e

# Postgres = serviço Dokploy (default: espacoloungedb-etzdoz na dokploy-network).
DB_HOST="${DB_HOST:-espacoloungedb-etzdoz}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USER:-espacolounge}"
DB_NAME="${DB_NAME:-espacolounge}"

if [ -z "${POSTGRES_PASSWORD:-}" ]; then
  echo "ERRO: POSTGRES_PASSWORD não está definida (senha do Postgres Dokploy)."
  exit 1
fi

export DATABASE_URL="postgresql://${DB_USER}:${POSTGRES_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}"
echo "A ligar ao Postgres em ${DB_HOST}:${DB_PORT}/${DB_NAME} (user=${DB_USER})"

if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  echo "Aplicando migrações Drizzle..."
  npm run db:migrate
fi

exec npm start
