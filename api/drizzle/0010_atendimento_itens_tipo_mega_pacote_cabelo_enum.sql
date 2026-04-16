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

-- Drizzle pode aplicar várias migrações na mesma transação; o Postgres exige commit
-- após ADD VALUE antes de usar os rótulos. `COMMIT AND CHAIN` mantém uma transação
-- aberta e evita aviso 25P01 no fecho da migração pelo runner. Ver drizzle-orm#3249.
COMMIT AND CHAIN;
