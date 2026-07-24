-- Orçamentos: modo do pedido + ciclo de status (fora de produção/financeiro/agenda).

DO $$ BEGIN
  CREATE TYPE "pedido_modo" AS ENUM ('producao', 'orcamento');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "orcamento_status" AS ENUM ('rascunho', 'enviado', 'aceito', 'arquivado');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "atendimentos_pedido"
  ADD COLUMN IF NOT EXISTS "modo" "pedido_modo" NOT NULL DEFAULT 'producao';

ALTER TABLE "atendimentos_pedido"
  ADD COLUMN IF NOT EXISTS "orcamento_status" "orcamento_status";

ALTER TABLE "atendimentos_pedido"
  ADD COLUMN IF NOT EXISTS "orcamento_enviado_em" timestamptz;

ALTER TABLE "atendimentos_pedido"
  ADD COLUMN IF NOT EXISTS "orcamento_convertido_em" timestamptz;

ALTER TABLE "atendimentos_pedido"
  ADD COLUMN IF NOT EXISTS "orcamento_convertido_de" text;

CREATE INDEX IF NOT EXISTS "atendimentos_pedido_modo_idx"
  ON "atendimentos_pedido" ("modo");

CREATE INDEX IF NOT EXISTS "atendimentos_pedido_orcamento_status_idx"
  ON "atendimentos_pedido" ("orcamento_status");

-- Template WhatsApp para envio de orçamento (idempotente).
DO $$ BEGIN
  ALTER TYPE "whatsapp_message_tipo" ADD VALUE IF NOT EXISTS 'orcamento';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

INSERT INTO "whatsapp_templates" ("codigo", "nome", "corpo", "ativo", "ordem")
SELECT
  'orcamento',
  'Orçamento',
  'Olá {{cliente}}! Segue o orçamento #{{numero_comanda}} da {{empresa}}:' || E'\n\n' || '{{resumo}}' || E'\n\n' || 'Total: {{valor}}' || E'\n\n' || 'Qualquer dúvida, estamos à disposição.',
  true,
  50
WHERE NOT EXISTS (
  SELECT 1 FROM "whatsapp_templates" WHERE "codigo" = 'orcamento'
);
