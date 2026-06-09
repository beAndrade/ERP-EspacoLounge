DO $$ BEGIN
 CREATE TYPE "public"."usuario_role" AS ENUM('admin', 'profissional');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "usuarios" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"senha_hash" text NOT NULL,
	"nome_exibicao" text NOT NULL,
	"role" "usuario_role" DEFAULT 'profissional' NOT NULL,
	"profissional_id" integer,
	"ativo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_profissional_id_profissionais_id_fk" FOREIGN KEY ("profissional_id") REFERENCES "public"."profissionais"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "usuarios_email_lower_uq" ON "usuarios" (lower(trim("email")));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "usuarios_profissional_id_idx" ON "usuarios" ("profissional_id");
