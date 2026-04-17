-- Despesas como detalhe 1:1 de `movimentacoes` (valor e saldo só em movimentacoes).

ALTER TABLE "despesas" ADD COLUMN IF NOT EXISTS "movimentacao_id" integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'despesas_movimentacao_id_movimentacoes_id_fk'
  ) THEN
    ALTER TABLE "despesas"
      ADD CONSTRAINT "despesas_movimentacao_id_movimentacoes_id_fk"
      FOREIGN KEY ("movimentacao_id") REFERENCES "movimentacoes"("id") ON DELETE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "despesas_movimentacao_id_uq"
  ON "despesas" ("movimentacao_id")
  WHERE "movimentacao_id" IS NOT NULL;

ALTER TABLE "despesas" ADD COLUMN IF NOT EXISTS "data_registo" date;

-- Índice para relatórios por data (alinhado a `movimentacoes.data_mov` nas linhas ligadas).
CREATE INDEX IF NOT EXISTS "despesas_data_registo_idx" ON "despesas" ("data_registo");

-- Legado: preencher data_registo quando a coluna texto `data` for ISO (aaaa-mm-dd).
UPDATE "despesas"
SET "data_registo" = substring(trim("data") from 1 for 10)::date
WHERE "data_registo" IS NULL
  AND "data" IS NOT NULL
  AND trim("data") ~ '^\d{4}-\d{2}-\d{2}';

-- `movimentacoes` já tem `movimentacoes_data_mov_idx` em `data_mov` (equivalente a “data” do razão).
