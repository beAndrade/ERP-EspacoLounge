-- Antes só em `ensureSchemaPatches` no arranque da API; necessária para `db:seed` / Drizzle.
ALTER TABLE "servicos" ADD COLUMN IF NOT EXISTS "duracao_minutos" integer DEFAULT 30 NOT NULL;
