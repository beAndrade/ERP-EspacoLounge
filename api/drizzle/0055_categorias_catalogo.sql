CREATE TABLE IF NOT EXISTS "categorias" (
	"id" serial PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "categorias_nome_lower_uidx" ON "categorias" (lower(trim("nome")));
--> statement-breakpoint
INSERT INTO "categorias" ("nome", "ativo")
SELECT DISTINCT trim(src.categoria) AS nome, true
FROM (
	SELECT "categoria" FROM "produtos"
	WHERE trim(coalesce("categoria", '')) <> ''
	UNION
	SELECT "categoria" FROM "servicos"
	WHERE trim(coalesce("categoria", '')) <> ''
) AS src
WHERE NOT EXISTS (
	SELECT 1
	FROM "categorias" c
	WHERE lower(trim(c."nome")) = lower(trim(src.categoria))
);
