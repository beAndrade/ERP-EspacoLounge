ALTER TABLE "servicos" ADD COLUMN IF NOT EXISTS "categoria" text;
ALTER TABLE "servicos" ADD COLUMN IF NOT EXISTS "mostra_no_site" boolean DEFAULT true NOT NULL;
ALTER TABLE "servicos" ADD COLUMN IF NOT EXISTS "descricao" text;
ALTER TABLE "servicos" ADD COLUMN IF NOT EXISTS "foto_url" text;
