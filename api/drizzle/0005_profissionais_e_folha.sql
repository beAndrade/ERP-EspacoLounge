-- Cadastro estável de profissionais; `folha.profissional_id` aponta para `profissionais.id`.
-- Idempotente: ignora objetos duplicados.

CREATE TABLE IF NOT EXISTS "profissionais" (
  "id" serial PRIMARY KEY NOT NULL,
  "nome" text NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "profissionais_nome_lower_uidx"
  ON "profissionais" (lower(trim("nome")));

INSERT INTO "profissionais" ("nome")
SELECT d.nome
FROM (
  SELECT DISTINCT trim("profissional") AS nome
  FROM "folha"
  WHERE trim(coalesce("profissional", '')) <> ''
    AND lower(trim("profissional")) <> 'profissional'
    AND trim("profissional") !~* '^r\$'
    AND trim("profissional") !~ '^\d{1,2}/\d{1,2}/\d{4}$'
) AS d
WHERE NOT EXISTS (
  SELECT 1 FROM "profissionais" p
  WHERE lower(trim(p."nome")) = lower(trim(d.nome))
);

ALTER TABLE "folha" ADD COLUMN IF NOT EXISTS "profissional_id" integer;

UPDATE "folha" AS f
SET "profissional_id" = p."id"
FROM "profissionais" AS p
WHERE f."profissional_id" IS NULL
  AND trim(coalesce(f."profissional", '')) <> ''
  AND lower(trim(p."nome")) = lower(trim(f."profissional"));

DO $$
BEGIN
  ALTER TABLE "folha"
    ADD CONSTRAINT "folha_profissional_id_profissionais_id_fk"
    FOREIGN KEY ("profissional_id") REFERENCES "profissionais"("id");
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "folha_profissional_id_idx" ON "folha" ("profissional_id");
