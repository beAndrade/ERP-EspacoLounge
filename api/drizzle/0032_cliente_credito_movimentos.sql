CREATE TABLE IF NOT EXISTS "cliente_credito_movimentos" (
  "id" serial PRIMARY KEY NOT NULL,
  "cliente_id" text NOT NULL,
  "id_atendimento" text,
  "data_mov" date NOT NULL,
  "valor" numeric(14, 2) NOT NULL,
  "tipo" text NOT NULL,
  "motivo" text NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "cliente_credito_movimentos_cliente_id_clientes_id_cliente_fk"
    FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id_cliente") ON DELETE CASCADE,
  CONSTRAINT "cliente_credito_movimentos_tipo_chk"
    CHECK ("tipo" IN ('entrada', 'saida'))
);

CREATE INDEX IF NOT EXISTS "cliente_credito_movimentos_cliente_idx"
  ON "cliente_credito_movimentos" ("cliente_id");

CREATE INDEX IF NOT EXISTS "cliente_credito_movimentos_cliente_data_idx"
  ON "cliente_credito_movimentos" ("cliente_id", "data_mov" DESC, "id" DESC);
