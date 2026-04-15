-- CHECK alargado + backfill a partir das linhas `atendimentos` (Mega, Pacote, Cabelo).

ALTER TABLE "atendimento_itens"
  ADD CONSTRAINT "atendimento_itens_tipo_chk" CHECK (
    (
      "tipo" = 'servico'::"atendimento_item_tipo"
      AND "servico_id" IS NOT NULL
      AND "produto_id" IS NULL
    )
    OR
    (
      "tipo" = 'produto'::"atendimento_item_tipo"
      AND "produto_id" IS NOT NULL
      AND "servico_id" IS NULL
    )
    OR
    (
      "tipo" IN (
        'mega'::"atendimento_item_tipo",
        'pacote'::"atendimento_item_tipo",
        'cabelo'::"atendimento_item_tipo"
      )
      AND "servico_id" IS NULL
      AND "produto_id" IS NULL
    )
  );

-- Mega: uma linha na pivot por linha em `atendimentos` (pacote + etapa).
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
      AND ai."tipo" = 'mega'::"atendimento_item_tipo"
      AND coalesce(ai."pacote", '') = coalesce(NULLIF(trim(a."pacote"), ''), '')
      AND coalesce(ai."etapa", '') = coalesce(NULLIF(trim(a."etapa"), ''), '')
      AND coalesce(ai."profissional_id", 0) = coalesce(a."profissional_id", 0)
  );

-- Pacote: cabeça (etapa vazia) e etapas.
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
      AND ai."tipo" = 'pacote'::"atendimento_item_tipo"
      AND coalesce(ai."pacote", '') = coalesce(NULLIF(trim(a."pacote"), ''), '')
      AND coalesce(ai."etapa", '') = coalesce(NULLIF(trim(a."etapa"), ''), '')
      AND coalesce(ai."profissional_id", 0) = coalesce(a."profissional_id", 0)
  );

-- Cabelo: texto livre em `detalhes` (= descrição da linha).
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
      AND ai."tipo" = 'cabelo'::"atendimento_item_tipo"
      AND coalesce(ai."detalhes", '') = coalesce(NULLIF(trim(a."descricao"), ''), '')
      AND coalesce(ai."profissional_id", 0) = coalesce(a."profissional_id", 0)
  );
