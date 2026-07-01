DO $$ BEGIN
  CREATE TYPE "public"."whatsapp_provider" AS ENUM('evolution');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "public"."whatsapp_message_tipo" AS ENUM('confirmacao', 'lembrete', 'cobranca', 'aniversario', 'manual');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "public"."whatsapp_log_status" AS ENUM('pending', 'sent', 'failed');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "public"."whatsapp_connection_status" AS ENUM('unknown', 'open', 'close', 'connecting', 'error');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "whatsapp_config" (
  "id" serial PRIMARY KEY NOT NULL,
  "provider" "whatsapp_provider" DEFAULT 'evolution' NOT NULL,
  "api_base_url" text,
  "api_key" text,
  "instance_name" text,
  "numero_salao" text,
  "nome_empresa" text,
  "connection_status" "whatsapp_connection_status" DEFAULT 'unknown' NOT NULL,
  "connection_checked_at" timestamp with time zone,
  "ativo" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "whatsapp_templates" (
  "id" serial PRIMARY KEY NOT NULL,
  "codigo" text NOT NULL,
  "nome" text NOT NULL,
  "corpo" text NOT NULL,
  "ativo" boolean DEFAULT true NOT NULL,
  "ordem" integer DEFAULT 0 NOT NULL,
  CONSTRAINT "whatsapp_templates_codigo_uq" UNIQUE("codigo")
);

CREATE TABLE IF NOT EXISTS "whatsapp_logs" (
  "id" serial PRIMARY KEY NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "cliente_id" text,
  "telefone" text NOT NULL,
  "tipo" "whatsapp_message_tipo" NOT NULL,
  "template_id" integer,
  "id_atendimento" text,
  "conteudo" text NOT NULL,
  "status" "whatsapp_log_status" DEFAULT 'pending' NOT NULL,
  "erro" text,
  "provider" "whatsapp_provider" NOT NULL,
  "provider_message_id" text
);

DO $$ BEGIN
  ALTER TABLE "whatsapp_logs" ADD CONSTRAINT "whatsapp_logs_cliente_id_clientes_id_cliente_fk"
    FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id_cliente") ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "whatsapp_logs" ADD CONSTRAINT "whatsapp_logs_template_id_whatsapp_templates_id_fk"
    FOREIGN KEY ("template_id") REFERENCES "public"."whatsapp_templates"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "whatsapp_logs" ADD CONSTRAINT "whatsapp_logs_id_atendimento_atendimentos_pedido_id_atendimento_fk"
    FOREIGN KEY ("id_atendimento") REFERENCES "public"."atendimentos_pedido"("id_atendimento") ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "whatsapp_logs_created_at_idx" ON "whatsapp_logs" ("created_at");
CREATE INDEX IF NOT EXISTS "whatsapp_logs_cliente_id_idx" ON "whatsapp_logs" ("cliente_id");
CREATE INDEX IF NOT EXISTS "whatsapp_logs_status_idx" ON "whatsapp_logs" ("status");

INSERT INTO "whatsapp_config" ("id", "provider", "ativo")
SELECT 1, 'evolution', false
WHERE NOT EXISTS (SELECT 1 FROM "whatsapp_config" WHERE "id" = 1);

INSERT INTO "whatsapp_templates" ("codigo", "nome", "corpo", "ativo", "ordem")
SELECT v.codigo, v.nome, v.corpo, true, v.ordem
FROM (VALUES
  (
    'confirmacao',
    'Confirmação de agendamento',
    'Olá {{cliente}}! Seu agendamento na {{empresa}} está confirmado para {{data}} às {{hora}} com {{profissional}}.',
    10
  ),
  (
    'lembrete',
    'Lembrete de agendamento',
    'Olá {{cliente}}! Lembrete: você tem agendamento na {{empresa}} em {{data}} às {{hora}} com {{profissional}}.',
    20
  ),
  (
    'cobranca',
    'Cobrança',
    'Olá {{cliente}}! A {{empresa}} entra em contacto sobre um débito pendente no valor de {{valor}}.',
    30
  ),
  (
    'aniversario',
    'Aniversário',
    'Feliz aniversário, {{cliente}}! A equipe {{empresa}} deseja um dia especial para você!',
    40
  )
) AS v(codigo, nome, corpo, ordem)
WHERE NOT EXISTS (SELECT 1 FROM "whatsapp_templates" LIMIT 1);
