ALTER TABLE "profissionais" ADD COLUMN IF NOT EXISTS "cep" text;
--> statement-breakpoint
ALTER TABLE "profissionais" ADD COLUMN IF NOT EXISTS "logradouro" text;
--> statement-breakpoint
ALTER TABLE "profissionais" ADD COLUMN IF NOT EXISTS "endereco_numero" text;
--> statement-breakpoint
ALTER TABLE "profissionais" ADD COLUMN IF NOT EXISTS "complemento" text;
--> statement-breakpoint
ALTER TABLE "profissionais" ADD COLUMN IF NOT EXISTS "bairro" text;
--> statement-breakpoint
ALTER TABLE "profissionais" ADD COLUMN IF NOT EXISTS "estado" text;
--> statement-breakpoint
ALTER TABLE "profissionais" ADD COLUMN IF NOT EXISTS "cidade" text;
