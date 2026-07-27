CREATE TABLE IF NOT EXISTS "marcas" (
	"id" serial PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "marcas_nome_lower_uidx" ON "marcas" (lower(trim("nome")));
--> statement-breakpoint
INSERT INTO "marcas" ("nome", "ativo")
SELECT DISTINCT trim(src.marca) AS nome, true
FROM (
	SELECT "marca" FROM "produtos"
	WHERE trim(coalesce("marca", '')) <> ''
) AS src
WHERE NOT EXISTS (
	SELECT 1
	FROM "marcas" m
	WHERE lower(trim(m."nome")) = lower(trim(src.marca))
);
