-- Atendimentos: texto `profissional` -> inteiro `profissional_id` (FK `folha.id`).
-- Seguro a reexecutar: ignora FK duplicada; só faz backfill se a coluna texto ainda existir.

ALTER TABLE "atendimentos" ADD COLUMN IF NOT EXISTS "profissional_id" integer;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = current_schema()
      AND c.table_name = 'atendimentos'
      AND c.column_name = 'profissional'
  ) THEN
    UPDATE "atendimentos" AS a
    SET "profissional_id" = f."id"
    FROM "folha" AS f
    WHERE a."profissional_id" IS NULL
      AND a."profissional" IS NOT NULL
      AND TRIM(a."profissional") = TRIM(f."profissional");
    ALTER TABLE "atendimentos" DROP COLUMN "profissional";
  END IF;
END $$;

DO $$
BEGIN
  ALTER TABLE "atendimentos"
    ADD CONSTRAINT "atendimentos_profissional_id_folha_id_fk"
    FOREIGN KEY ("profissional_id") REFERENCES "folha"("id");
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "atendimentos_profissional_id_idx" ON "atendimentos" ("profissional_id");
