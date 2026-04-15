-- `inicio` / `fim`: timestamp **sem** timezone (relógio do salão).
-- Se já existirem como `timestamptz`, converte para wall clock em America/Sao_Paulo.

DO $$
DECLARE
  dt_inicio text;
  dt_fim text;
BEGIN
  SELECT c.data_type INTO dt_inicio
  FROM information_schema.columns c
  WHERE c.table_schema = current_schema()
    AND c.table_name = 'atendimentos'
    AND c.column_name = 'inicio';

  IF dt_inicio IS NULL THEN
    ALTER TABLE "atendimentos" ADD COLUMN "inicio" timestamp without time zone;
  ELSIF dt_inicio = 'timestamp with time zone' THEN
    ALTER TABLE "atendimentos"
      ALTER COLUMN "inicio" TYPE timestamp without time zone
      USING ("inicio" AT TIME ZONE 'America/Sao_Paulo');
  END IF;

  SELECT c.data_type INTO dt_fim
  FROM information_schema.columns c
  WHERE c.table_schema = current_schema()
    AND c.table_name = 'atendimentos'
    AND c.column_name = 'fim';

  IF dt_fim IS NULL THEN
    ALTER TABLE "atendimentos" ADD COLUMN "fim" timestamp without time zone;
  ELSIF dt_fim = 'timestamp with time zone' THEN
    ALTER TABLE "atendimentos"
      ALTER COLUMN "fim" TYPE timestamp without time zone
      USING ("fim" AT TIME ZONE 'America/Sao_Paulo');
  END IF;
END $$;
