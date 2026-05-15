ALTER TABLE "clientes" ADD COLUMN IF NOT EXISTS "credito_saldo" numeric(14, 2) DEFAULT 0 NOT NULL;
