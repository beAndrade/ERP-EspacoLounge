-- Número de comanda global e estável (#1, #2, …) por pedido; atribuído na criação do registo em `atendimentos_pedido`.

ALTER TABLE "atendimentos_pedido"
  ADD COLUMN IF NOT EXISTS "numero_comanda" integer;

-- Ordem estável: primeira linha em `atendimentos` (PK `id`) por pedido.
WITH ordem AS (
  SELECT
    p.id_atendimento,
    ROW_NUMBER() OVER (
      ORDER BY COALESCE(m.primeiro_id, 2147483647), p.id_atendimento
    ) AS n
  FROM atendimentos_pedido p
  LEFT JOIN (
    SELECT id_atendimento, MIN(id) AS primeiro_id
    FROM atendimentos
    GROUP BY id_atendimento
  ) m ON m.id_atendimento = p.id_atendimento
)
UPDATE "atendimentos_pedido" p
SET "numero_comanda" = ordem.n
FROM ordem
WHERE p.id_atendimento = ordem.id_atendimento
  AND p.numero_comanda IS NULL;

CREATE SEQUENCE IF NOT EXISTS "atendimentos_pedido_numero_comanda_seq";

-- setval não aceita 0 (mínimo 1). BD vazia → próximo nextval = 1 (is_called=false).
SELECT setval(
  'atendimentos_pedido_numero_comanda_seq',
  COALESCE((SELECT MAX("numero_comanda") FROM "atendimentos_pedido"), 1),
  (SELECT COALESCE(MAX("numero_comanda"), 0) FROM "atendimentos_pedido") > 0
);

ALTER TABLE "atendimentos_pedido"
  ALTER COLUMN "numero_comanda" SET DEFAULT nextval('atendimentos_pedido_numero_comanda_seq');

ALTER TABLE "atendimentos_pedido"
  ALTER COLUMN "numero_comanda" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "atendimentos_pedido_numero_comanda_uidx"
  ON "atendimentos_pedido" ("numero_comanda");
