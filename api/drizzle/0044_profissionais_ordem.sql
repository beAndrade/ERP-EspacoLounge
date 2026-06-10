ALTER TABLE "profissionais" ADD COLUMN IF NOT EXISTS "ordem" integer DEFAULT 0 NOT NULL;

WITH ranked AS (
  SELECT id, (row_number() OVER (ORDER BY nome ASC, id ASC)) * 10 AS o
  FROM "profissionais"
)
UPDATE "profissionais" AS p
SET "ordem" = r.o
FROM ranked AS r
WHERE p.id = r.id AND p.ordem = 0;
