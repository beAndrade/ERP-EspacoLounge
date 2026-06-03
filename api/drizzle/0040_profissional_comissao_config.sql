-- Override de comissão por profissional + serviço; política de listagem por profissional.

CREATE TABLE IF NOT EXISTS "profissional_servico_comissao" (
  "id" serial PRIMARY KEY NOT NULL,
  "profissional_id" integer NOT NULL REFERENCES "profissionais"("id") ON DELETE CASCADE,
  "servico_id" integer NOT NULL REFERENCES "servicos"("id") ON DELETE CASCADE,
  "tipo" text NOT NULL DEFAULT 'percentual',
  "valor" text NOT NULL DEFAULT '',
  "como_auxiliar" boolean NOT NULL DEFAULT false,
  "sobre" text NOT NULL DEFAULT 'valor_bruto',
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "profissional_servico_comissao_prof_serv_uq"
  ON "profissional_servico_comissao" ("profissional_id", "servico_id");

CREATE INDEX IF NOT EXISTS "profissional_servico_comissao_prof_idx"
  ON "profissional_servico_comissao" ("profissional_id");

ALTER TABLE "profissionais" ADD COLUMN IF NOT EXISTS "comissao_listagem_modo" text NOT NULL DEFAULT 'pagamento_cliente';
