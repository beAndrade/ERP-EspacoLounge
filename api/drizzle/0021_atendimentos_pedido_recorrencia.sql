ALTER TABLE "atendimentos_pedido"
  ADD COLUMN IF NOT EXISTS "id_recorrencia" text;

ALTER TABLE "atendimentos_pedido"
  ADD COLUMN IF NOT EXISTS "ordem_recorrencia" integer;

CREATE INDEX IF NOT EXISTS "atendimentos_pedido_id_recorrencia_idx"
  ON "atendimentos_pedido" ("id_recorrencia");
