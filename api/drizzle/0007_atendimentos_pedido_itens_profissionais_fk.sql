-- 1) `atendimentos.profissional_id`: de FK `folha.id` para FK `profissionais.id`.
-- 2) Cabeçalho `atendimentos_pedido` + pivot `atendimento_itens` (polimórfico) + backfill.

-- Remapear IDs antigos (folha.id) → profissionais.id
UPDATE "atendimentos" AS a
SET "profissional_id" = f."profissional_id"
FROM "folha" AS f
WHERE a."profissional_id" IS NOT NULL
  AND a."profissional_id" = f."id"
  AND f."profissional_id" IS NOT NULL;

UPDATE "atendimentos" AS a
SET "profissional_id" = p."id"
FROM "folha" AS f
JOIN "profissionais" AS p ON lower(trim(p."nome")) = lower(trim(coalesce(f."profissional", '')))
WHERE a."profissional_id" IS NOT NULL
  AND a."profissional_id" = f."id"
  AND a."profissional_id" NOT IN (SELECT "id" FROM "profissionais");

UPDATE "atendimentos"
SET "profissional_id" = NULL
WHERE "profissional_id" IS NOT NULL
  AND "profissional_id" NOT IN (SELECT "id" FROM "profissionais");

ALTER TABLE "atendimentos" DROP CONSTRAINT IF EXISTS "atendimentos_profissional_id_folha_id_fk";

DO $$
BEGIN
  ALTER TABLE "atendimentos"
    ADD CONSTRAINT "atendimentos_profissional_id_profissionais_id_fk"
    FOREIGN KEY ("profissional_id") REFERENCES "profissionais"("id");
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Cabeçalho do pedido (um por `id_atendimento` textual)
CREATE TABLE IF NOT EXISTS "atendimentos_pedido" (
  "id_atendimento" text PRIMARY KEY NOT NULL,
  "id_cliente" text NOT NULL REFERENCES "clientes"("id_cliente") ON DELETE NO ACTION ON UPDATE NO ACTION
);

INSERT INTO "atendimentos_pedido" ("id_atendimento", "id_cliente")
SELECT DISTINCT ON (a."id_atendimento") a."id_atendimento", a."id_cliente"
FROM "atendimentos" AS a
ORDER BY a."id_atendimento", a."id"
ON CONFLICT ("id_atendimento") DO NOTHING;

DO $$
BEGIN
  CREATE TYPE "atendimento_item_tipo" AS ENUM ('servico', 'produto');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "atendimento_itens" (
  "id" serial PRIMARY KEY NOT NULL,
  "id_atendimento" text NOT NULL REFERENCES "atendimentos_pedido"("id_atendimento") ON DELETE CASCADE ON UPDATE NO ACTION,
  "tipo" "atendimento_item_tipo" NOT NULL,
  "servico_id" integer REFERENCES "servicos"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  "produto_id" integer REFERENCES "produtos"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  "quantidade" integer DEFAULT 1 NOT NULL,
  "profissional_id" integer REFERENCES "profissionais"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  "tamanho" text,
  CONSTRAINT "atendimento_itens_quantidade_pos_chk" CHECK ("quantidade" > 0),
  CONSTRAINT "atendimento_itens_tipo_chk" CHECK (
    ("tipo" = 'servico'::"atendimento_item_tipo" AND "servico_id" IS NOT NULL AND "produto_id" IS NULL)
    OR
    ("tipo" = 'produto'::"atendimento_item_tipo" AND "produto_id" IS NOT NULL AND "servico_id" IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS "atendimento_itens_id_atendimento_idx"
  ON "atendimento_itens" ("id_atendimento");

CREATE UNIQUE INDEX IF NOT EXISTS "atendimento_itens_uq_servico"
  ON "atendimento_itens" ("id_atendimento", "servico_id", coalesce("tamanho", ''))
  WHERE "tipo" = 'servico'::"atendimento_item_tipo";

CREATE UNIQUE INDEX IF NOT EXISTS "atendimento_itens_uq_produto"
  ON "atendimento_itens" ("id_atendimento", "produto_id")
  WHERE "tipo" = 'produto'::"atendimento_item_tipo";

-- Backfill serviços (nome na coluna `servicos` = catálogo)
-- DISTINCT ON: várias linhas `atendimentos` com o mesmo pedido + serviço + tamanho
-- violariam o índice único na mesma instrução INSERT (NOT EXISTS não vê linhas ainda inseridas).
INSERT INTO "atendimento_itens" (
  "id_atendimento", "tipo", "servico_id", "produto_id", "quantidade", "profissional_id", "tamanho"
)
SELECT DISTINCT ON (
  a."id_atendimento",
  s."id",
  coalesce(NULLIF(trim(a."tamanho"), ''), '')
)
  a."id_atendimento",
  'servico'::"atendimento_item_tipo",
  s."id",
  NULL,
  1,
  a."profissional_id",
  NULLIF(trim(a."tamanho"), '')
FROM "atendimentos" AS a
INNER JOIN LATERAL (
  SELECT s2."id"
  FROM "servicos" AS s2
  WHERE lower(trim(coalesce(s2."servico", ''))) = lower(trim(coalesce(a."servicos", '')))
    AND trim(coalesce(a."servicos", '')) <> ''
  ORDER BY s2."id"
  LIMIT 1
) AS s ON true
WHERE lower(trim(coalesce(a."tipo", ''))) IN ('serviço', 'servico')
  AND NOT EXISTS (
    SELECT 1 FROM "atendimento_itens" ai
    WHERE ai."id_atendimento" = a."id_atendimento"
      AND ai."tipo" = 'servico'::"atendimento_item_tipo"
      AND ai."servico_id" = s."id"
      AND coalesce(ai."tamanho", '') = coalesce(NULLIF(trim(a."tamanho"), ''), '')
  )
ORDER BY
  a."id_atendimento",
  s."id",
  coalesce(NULLIF(trim(a."tamanho"), ''), ''),
  a."id";

-- Backfill produtos (quantidade via "Qtd:" na descrição, senão 1)
INSERT INTO "atendimento_itens" (
  "id_atendimento", "tipo", "servico_id", "produto_id", "quantidade", "profissional_id", "tamanho"
)
SELECT DISTINCT ON (a."id_atendimento", p."id")
  a."id_atendimento",
  'produto'::"atendimento_item_tipo",
  NULL,
  p."id",
  GREATEST(
    1,
    COALESCE(
      NULLIF(trim(substring(coalesce(a."descricao", '') FROM '[Qq]td:\s*([0-9]+)')), '')::integer,
      1
    )
  ),
  a."profissional_id",
  NULL
FROM "atendimentos" AS a
INNER JOIN LATERAL (
  SELECT p2."id"
  FROM "produtos" AS p2
  WHERE lower(trim(coalesce(p2."produto", ''))) = lower(trim(coalesce(a."produto", '')))
    AND trim(coalesce(a."produto", '')) <> ''
  ORDER BY p2."id"
  LIMIT 1
) AS p ON true
WHERE lower(trim(coalesce(a."tipo", ''))) = 'produto'
  AND NOT EXISTS (
    SELECT 1 FROM "atendimento_itens" ai
    WHERE ai."id_atendimento" = a."id_atendimento"
      AND ai."tipo" = 'produto'::"atendimento_item_tipo"
      AND ai."produto_id" = p."id"
  )
ORDER BY a."id_atendimento", p."id", a."id";
