-- PK da aba Serviços: `linha` → `id` (mesmo significado: número da linha na planilha).

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = current_schema()
      AND c.table_name = 'servicos'
      AND c.column_name = 'linha'
  ) THEN
    ALTER TABLE "servicos" RENAME COLUMN "linha" TO "id";
  END IF;
END $$;
