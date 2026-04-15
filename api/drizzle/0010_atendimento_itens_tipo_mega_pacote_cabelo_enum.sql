-- Só novos valores de enum — precisa commit antes de qualquer uso de 'mega'/'pacote'/'cabelo' (próxima migração).
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
