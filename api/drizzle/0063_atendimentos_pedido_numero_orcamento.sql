-- Numeração de orçamento separada da de comanda.

ALTER TABLE "atendimentos_pedido"
  ADD COLUMN IF NOT EXISTS "numero_orcamento" integer;

-- Orçamentos existentes: sequência própria 1..N (ordem pelo ticket antigo).
WITH ordem AS (
  SELECT
    p.id_atendimento,
    ROW_NUMBER() OVER (
      ORDER BY COALESCE(p.numero_comanda, 2147483647), p.id_atendimento
    ) AS n
  FROM atendimentos_pedido p
  WHERE p.modo = 'orcamento'
)
UPDATE "atendimentos_pedido" p
SET "numero_orcamento" = ordem.n
FROM ordem
WHERE p.id_atendimento = ordem.id_atendimento
  AND p.numero_orcamento IS NULL;

-- Libera NULL em `numero_comanda` antes de limpar orçamentos.
ALTER TABLE "atendimentos_pedido"
  ALTER COLUMN "numero_comanda" DROP NOT NULL;

ALTER TABLE "atendimentos_pedido"
  ALTER COLUMN "numero_comanda" DROP DEFAULT;

-- Orçamentos deixam de ocupar a sequência de comandas.
UPDATE "atendimentos_pedido"
SET "numero_comanda" = NULL
WHERE "modo" = 'orcamento';

CREATE SEQUENCE IF NOT EXISTS "atendimentos_pedido_numero_orcamento_seq";

SELECT setval(
  'atendimentos_pedido_numero_orcamento_seq',
  GREATEST(
    1,
    COALESCE((SELECT MAX("numero_orcamento") FROM "atendimentos_pedido"), 1)
  ),
  (SELECT COALESCE(MAX("numero_orcamento"), 0) FROM "atendimentos_pedido") > 0
);

SELECT setval(
  'atendimentos_pedido_numero_comanda_seq',
  GREATEST(
    1,
    COALESCE((SELECT MAX("numero_comanda") FROM "atendimentos_pedido"), 1)
  ),
  (SELECT COALESCE(MAX("numero_comanda"), 0) FROM "atendimentos_pedido") > 0
);

DROP INDEX IF EXISTS "atendimentos_pedido_numero_comanda_uidx";

CREATE UNIQUE INDEX IF NOT EXISTS "atendimentos_pedido_numero_comanda_uidx"
  ON "atendimentos_pedido" ("numero_comanda")
  WHERE "numero_comanda" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "atendimentos_pedido_numero_orcamento_uidx"
  ON "atendimentos_pedido" ("numero_orcamento")
  WHERE "numero_orcamento" IS NOT NULL;
