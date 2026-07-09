#!/bin/sh
set -e

if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  echo "Aplicando migrações Drizzle..."
  npm run db:migrate
fi

exec npm start
