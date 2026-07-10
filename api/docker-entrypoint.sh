#!/bin/sh
set -e

if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERRO: DATABASE_URL não está definida. No Compose Dokploy deve ser:"
  echo "  postgresql://postgres:\${POSTGRES_PASSWORD}@db:5432/espaco_lounge"
  exit 1
fi

case "${DATABASE_URL}" in
  *localhost*|*127.0.0.1*|*"::1"*)
    echo "ERRO: DATABASE_URL aponta para localhost (${DATABASE_URL})."
    echo "Dentro do container use o host do serviço Compose: db"
    exit 1
    ;;
esac

if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  echo "Aplicando migrações Drizzle..."
  npm run db:migrate
fi

exec npm start
