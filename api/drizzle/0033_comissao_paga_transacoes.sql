-- Comissão paga por linha + categoria financeira para Transações
ALTER TABLE "atendimentos" ADD COLUMN IF NOT EXISTS "comissao_paga_em" date;

CREATE INDEX IF NOT EXISTS "atendimentos_comissao_paga_em_idx"
  ON "atendimentos" ("comissao_paga_em")
  WHERE "comissao_paga_em" IS NOT NULL;

INSERT INTO "categorias_financeiras" ("nome", "natureza", "slug", "ordem", "ativo")
SELECT 'Comissão', 'despesa', 'despesa_comissao', 125, true
WHERE NOT EXISTS (
  SELECT 1 FROM "categorias_financeiras" WHERE "slug" = 'despesa_comissao'
);
