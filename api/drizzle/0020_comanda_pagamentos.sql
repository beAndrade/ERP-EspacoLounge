-- Pagamentos da comanda: 1 linha por pagamento (parcial ou total).
-- Liga-se a `atendimentos_pedido` (id_atendimento) e a `movimentacoes` (receita gerada).

DO $$ BEGIN
  CREATE TYPE "metodo_pagamento_comanda" AS ENUM (
    'dinheiro',
    'cartao_credito',
    'cartao_debito',
    'pix',
    'transferencia',
    'outros'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "comanda_pagamentos" (
  "id" serial PRIMARY KEY,
  "id_atendimento" text NOT NULL,
  "data_pagamento" date NOT NULL,
  "valor" numeric(14, 2) NOT NULL,
  "metodo" "metodo_pagamento_comanda" NOT NULL,
  "parcelas" integer DEFAULT 1 NOT NULL,
  "troco" numeric(14, 2),
  "observacao" text,
  "movimentacao_id" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'comanda_pagamentos_id_atendimento_fkey'
  ) THEN
    ALTER TABLE "comanda_pagamentos"
      ADD CONSTRAINT "comanda_pagamentos_id_atendimento_fkey"
      FOREIGN KEY ("id_atendimento")
      REFERENCES "atendimentos_pedido"("id_atendimento")
      ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'comanda_pagamentos_movimentacao_id_fkey'
  ) THEN
    ALTER TABLE "comanda_pagamentos"
      ADD CONSTRAINT "comanda_pagamentos_movimentacao_id_fkey"
      FOREIGN KEY ("movimentacao_id")
      REFERENCES "movimentacoes"("id")
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "comanda_pagamentos_id_atendimento_idx"
  ON "comanda_pagamentos" ("id_atendimento");

CREATE INDEX IF NOT EXISTS "comanda_pagamentos_data_idx"
  ON "comanda_pagamentos" ("data_pagamento");
