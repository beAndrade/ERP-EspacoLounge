CREATE TABLE IF NOT EXISTS "fornecedores" (
	"id" serial PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"email" text,
	"celular" text,
	"telefone" text,
	"inscricao_estadual" text,
	"cnpj" text,
	"ativo" boolean DEFAULT true NOT NULL,
	"cep" text,
	"logradouro" text,
	"numero" text,
	"complemento" text,
	"bairro" text,
	"estado" text,
	"cidade" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "fornecedores_nome_lower_uidx" ON "fornecedores" (lower(trim("nome")));
