-- Cadastro de profissionais: soft-disable via `ativo` (sem DELETE).

ALTER TABLE "profissionais" ADD COLUMN IF NOT EXISTS "ativo" boolean DEFAULT true NOT NULL;
