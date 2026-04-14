-- Categorias financeiras + movimentações (razão único) + idempotência na confirmação de pagamento.

DO $$
BEGIN
  CREATE TYPE "public"."natureza_financeira" AS ENUM ('receita', 'despesa');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "categorias_financeiras" (
  "id" serial PRIMARY KEY NOT NULL,
  "nome" text NOT NULL,
  "natureza" "natureza_financeira" NOT NULL,
  "slug" text NOT NULL,
  "ordem" integer DEFAULT 0 NOT NULL,
  "ativo" boolean DEFAULT true NOT NULL,
  CONSTRAINT "categorias_financeiras_slug_unique" UNIQUE ("slug")
);

CREATE TABLE IF NOT EXISTS "movimentacoes" (
  "id" serial PRIMARY KEY NOT NULL,
  "data_mov" date NOT NULL,
  "natureza" "natureza_financeira" NOT NULL,
  "valor" numeric(14, 2) NOT NULL,
  "categoria_id" integer NOT NULL,
  "descricao" text,
  "id_atendimento" text,
  "metodo_pagamento" text,
  "origem" text NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

DO $$
BEGIN
  ALTER TABLE "movimentacoes"
    ADD CONSTRAINT "movimentacoes_categoria_id_categorias_financeiras_id_fk"
    FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias_financeiras"("id");
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "movimentacoes_data_mov_idx" ON "movimentacoes" ("data_mov");
CREATE INDEX IF NOT EXISTS "movimentacoes_categoria_id_idx" ON "movimentacoes" ("categoria_id");
CREATE INDEX IF NOT EXISTS "movimentacoes_id_atendimento_idx" ON "movimentacoes" ("id_atendimento");

CREATE UNIQUE INDEX IF NOT EXISTS "movimentacoes_confirm_receita_id_at_idx"
  ON "movimentacoes" ("id_atendimento")
  WHERE ("origem" = 'atendimento_confirmacao' AND "natureza" = 'receita');

INSERT INTO "categorias_financeiras" ("nome", "natureza", "slug", "ordem", "ativo") VALUES
  ('Serviços', 'receita', 'receita_servicos', 10, true),
  ('Produtos', 'receita', 'receita_produtos', 20, true),
  ('Pacotes', 'receita', 'receita_pacotes', 30, true),
  ('Mega', 'receita', 'receita_mega', 40, true),
  ('Cabelo', 'receita', 'receita_cabelo', 50, true),
  ('Aluguel', 'despesa', 'despesa_aluguel', 100, true),
  ('Produtos (custo)', 'despesa', 'despesa_produtos', 110, true),
  ('Salários', 'despesa', 'despesa_salario', 120, true),
  ('Marketing', 'despesa', 'despesa_marketing', 130, true),
  ('Outras despesas', 'despesa', 'despesa_outras', 200, true)
ON CONFLICT ("slug") DO NOTHING;
