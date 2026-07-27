ALTER TABLE "produtos" ADD COLUMN IF NOT EXISTS "unidade_equivalente" text;

ALTER TABLE "atendimentos_pedido" ADD COLUMN IF NOT EXISTS "estoque_baixado_em" timestamptz;

CREATE TABLE IF NOT EXISTS "servico_produtos_consumidos" (
  "id" serial PRIMARY KEY NOT NULL,
  "servico_id" integer NOT NULL,
  "produto_id" integer NOT NULL,
  "quantidade" numeric(14, 3) NOT NULL,
  CONSTRAINT "servico_produtos_consumidos_servico_id_fkey"
    FOREIGN KEY ("servico_id") REFERENCES "servicos"("id") ON DELETE CASCADE,
  CONSTRAINT "servico_produtos_consumidos_produto_id_fkey"
    FOREIGN KEY ("produto_id") REFERENCES "produtos"("id") ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS "servico_produtos_consumidos_servico_produto_uq"
  ON "servico_produtos_consumidos" ("servico_id", "produto_id");
CREATE INDEX IF NOT EXISTS "servico_produtos_consumidos_servico_idx"
  ON "servico_produtos_consumidos" ("servico_id");
CREATE INDEX IF NOT EXISTS "servico_produtos_consumidos_produto_idx"
  ON "servico_produtos_consumidos" ("produto_id");

CREATE TABLE IF NOT EXISTS "estoque_movimentos" (
  "id" serial PRIMARY KEY NOT NULL,
  "produto_id" integer NOT NULL,
  "id_atendimento" text,
  "tipo" text NOT NULL,
  "quantidade" numeric(14, 3) NOT NULL,
  "saldo_apos" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "estoque_movimentos_produto_id_fkey"
    FOREIGN KEY ("produto_id") REFERENCES "produtos"("id") ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS "estoque_movimentos_produto_idx"
  ON "estoque_movimentos" ("produto_id");
CREATE INDEX IF NOT EXISTS "estoque_movimentos_id_atendimento_idx"
  ON "estoque_movimentos" ("id_atendimento");
