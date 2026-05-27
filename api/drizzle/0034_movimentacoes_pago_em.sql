-- Estado de pagamento por movimentação para suportar switch Pago em Transações.
ALTER TABLE "movimentacoes" ADD COLUMN IF NOT EXISTS "pago_em" date;

-- Backfill: comportamento legado considera linhas existentes como pagas.
UPDATE "movimentacoes"
SET "pago_em" = "data_mov"
WHERE "pago_em" IS NULL;

CREATE INDEX IF NOT EXISTS "movimentacoes_pago_em_idx"
  ON "movimentacoes" ("pago_em");
