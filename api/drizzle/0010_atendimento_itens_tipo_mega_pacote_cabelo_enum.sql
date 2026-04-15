-- Novos valores em `atendimento_item_tipo` (commit antes de usar nos CHECK/INSERT seguintes).
DO $$ BEGIN
  ALTER TYPE "atendimento_item_tipo" ADD VALUE 'mega';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE "atendimento_item_tipo" ADD VALUE 'pacote';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE "atendimento_item_tipo" ADD VALUE 'cabelo';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "atendimento_itens"
  ADD COLUMN IF NOT EXISTS "pacote" text;

ALTER TABLE "atendimento_itens"
  ADD COLUMN IF NOT EXISTS "etapa" text;

ALTER TABLE "atendimento_itens"
  ADD COLUMN IF NOT EXISTS "detalhes" text;

ALTER TABLE "atendimento_itens"
  DROP CONSTRAINT IF EXISTS "atendimento_itens_tipo_chk";
