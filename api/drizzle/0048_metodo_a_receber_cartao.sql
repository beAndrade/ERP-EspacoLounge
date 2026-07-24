-- Parcela futura de cartão ≠ dívida do cliente (`pendente`).
-- Backfill de linhas antigas: `ensureSchemaPatches` em `api/src/db/index.ts`
-- (Postgres exige commit do ADD VALUE antes de usar o enum numa UPDATE).

DO $$ BEGIN
  ALTER TYPE "metodo_pagamento_comanda" ADD VALUE IF NOT EXISTS 'a_receber_cartao';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
