-- Corrige sequências serial desalinhadas após import/restore com IDs explícitos.
-- Sem isto, INSERT sem id falha com: duplicate key value violates unique constraint "*_pkey".

DO $$
DECLARE
  t text;
  seq regclass;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'produtos',
    'servicos',
    'marcas',
    'categorias',
    'estoque_movimentos'
  ]
  LOOP
    seq := pg_get_serial_sequence(t, 'id');
    IF seq IS NULL THEN
      CONTINUE;
    END IF;
    EXECUTE format(
      'SELECT setval($1, GREATEST(1, COALESCE((SELECT MAX(id) FROM %I), 0)), (SELECT EXISTS (SELECT 1 FROM %I LIMIT 1)))',
      t,
      t
    )
    USING seq;
  END LOOP;
END $$;
