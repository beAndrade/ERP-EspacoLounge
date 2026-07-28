ALTER TABLE "estoque_movimentos"
  ADD COLUMN IF NOT EXISTS "profissional_id" integer;
ALTER TABLE "estoque_movimentos"
  ADD COLUMN IF NOT EXISTS "usuario_id" integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'estoque_movimentos_profissional_id_fkey'
  ) THEN
    ALTER TABLE "estoque_movimentos"
      ADD CONSTRAINT "estoque_movimentos_profissional_id_fkey"
      FOREIGN KEY ("profissional_id") REFERENCES "profissionais"("id") ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'estoque_movimentos_usuario_id_fkey'
  ) THEN
    ALTER TABLE "estoque_movimentos"
      ADD CONSTRAINT "estoque_movimentos_usuario_id_fkey"
      FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "estoque_movimentos_profissional_id_idx"
  ON "estoque_movimentos" ("profissional_id");
