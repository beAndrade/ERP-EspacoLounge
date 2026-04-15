-- CHECK com tipo::text (evita 55P04) + backfill. Corre numa transação **depois** do commit da migração anterior.

ALTER TABLE "atendimento_itens"
  DROP CONSTRAINT IF EXISTS "atendimento_itens_tipo_chk";

ALTER TABLE "atendimento_itens"
  ADD CONSTRAINT "atendimento_itens_tipo_chk" CHECK (
    (
      "tipo"::text = 'servico'
      AND "servico_id" IS NOT NULL
      AND "produto_id" IS NULL
    )
    OR
    (
      "tipo"::text = 'produto'
      AND "produto_id" IS NOT NULL
      AND "servico_id" IS NULL
    )
    OR
    (
      "tipo"::text IN ('mega', 'pacote', 'cabelo')
      AND "servico_id" IS NULL
      AND "produto_id" IS NULL
    )
  );

INSERT INTO "atendimento_itens" (
  "id_atendimento",
  "tipo",
  "servico_id",
  "produto_id",
  "quantidade",
  "profissional_id",
  "tamanho",
  "pacote",
  "etapa",
  "detalhes"
)
SELECT
  a."id_atendimento",
  'mega'::"atendimento_item_tipo",
  NULL,
  NULL,
  1,
  a."profissional_id",
  NULL,
  NULLIF(trim(a."pacote"), ''),
  NULLIF(trim(a."etapa"), ''),
  NULL
FROM "atendimentos" AS a
WHERE lower(trim(coalesce(a."tipo", ''))) = 'mega'
  AND trim(coalesce(a."pacote", '')) <> ''
  AND trim(coalesce(a."etapa", '')) <> ''
  AND NOT EXISTS (
    SELECT 1
    FROM "atendimento_itens" AS ai
    WHERE ai."id_atendimento" = a."id_atendimento"
      AND ai."tipo"::text = 'mega'
      AND coalesce(ai."pacote", '') = coalesce(NULLIF(trim(a."pacote"), ''), '')
      AND coalesce(ai."etapa", '') = coalesce(NULLIF(trim(a."etapa"), ''), '')
      AND coalesce(ai."profissional_id", 0) = coalesce(a."profissional_id", 0)
  );

INSERT INTO "atendimento_itens" (
  "id_atendimento",
  "tipo",
  "servico_id",
  "produto_id",
  "quantidade",
  "profissional_id",
  "tamanho",
  "pacote",
  "etapa",
  "detalhes"
)
SELECT
  a."id_atendimento",
  'pacote'::"atendimento_item_tipo",
  NULL,
  NULL,
  1,
  a."profissional_id",
  NULL,
  NULLIF(trim(a."pacote"), ''),
  NULLIF(trim(a."etapa"), ''),
  NULL
FROM "atendimentos" AS a
WHERE lower(trim(coalesce(a."tipo", ''))) = 'pacote'
  AND trim(coalesce(a."pacote", '')) <> ''
  AND NOT EXISTS (
    SELECT 1
    FROM "atendimento_itens" AS ai
    WHERE ai."id_atendimento" = a."id_atendimento"
      AND ai."tipo"::text = 'pacote'
      AND coalesce(ai."pacote", '') = coalesce(NULLIF(trim(a."pacote"), ''), '')
      AND coalesce(ai."etapa", '') = coalesce(NULLIF(trim(a."etapa"), ''), '')
      AND coalesce(ai."profissional_id", 0) = coalesce(a."profissional_id", 0)
  );

INSERT INTO "atendimento_itens" (
  "id_atendimento",
  "tipo",
  "servico_id",
  "produto_id",
  "quantidade",
  "profissional_id",
  "tamanho",
  "pacote",
  "etapa",
  "detalhes"
)
SELECT
  a."id_atendimento",
  'cabelo'::"atendimento_item_tipo",
  NULL,
  NULL,
  1,
  a."profissional_id",
  NULL,
  NULL,
  NULL,
  NULLIF(trim(a."descricao"), '')
FROM "atendimentos" AS a
WHERE lower(trim(coalesce(a."tipo", ''))) = 'cabelo'
  AND NOT EXISTS (
    SELECT 1
    FROM "atendimento_itens" AS ai
    WHERE ai."id_atendimento" = a."id_atendimento"
      AND ai."tipo"::text = 'cabelo'
      AND coalesce(ai."detalhes", '') = coalesce(NULLIF(trim(a."descricao"), ''), '')
      AND coalesce(ai."profissional_id", 0) = coalesce(a."profissional_id", 0)
  );
