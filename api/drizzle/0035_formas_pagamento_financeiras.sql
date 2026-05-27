CREATE TABLE IF NOT EXISTS "formas_pagamento_financeiras" (
  "id" serial PRIMARY KEY NOT NULL,
  "nome" text NOT NULL,
  "codigo_interno" text NOT NULL,
  "baixa_automatica" boolean DEFAULT false NOT NULL,
  "ordem" integer DEFAULT 0 NOT NULL,
  "ativo" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "formas_pagamento_financeiras_codigo_interno_unique" UNIQUE ("codigo_interno")
);

CREATE INDEX IF NOT EXISTS "formas_pagamento_financeiras_ativo_ordem_idx"
  ON "formas_pagamento_financeiras" ("ativo", "ordem", "id");

INSERT INTO "formas_pagamento_financeiras" ("nome", "codigo_interno", "baixa_automatica", "ordem", "ativo")
SELECT v.nome, v.codigo, v.baixa, v.ordem, true
FROM (VALUES
  ('Pix', 'pix', true, 10),
  ('Dinheiro', 'dinheiro', true, 20),
  ('Cartão de Crédito', 'cartao_credito', false, 30),
  ('Cartão de Débito', 'cartao_debito', true, 40),
  ('Transferência', 'transferencia', false, 50),
  ('Boleto', 'boleto', false, 60),
  ('Cheque à Vista', 'cheque_vista', false, 70),
  ('Cheque Pré', 'cheque_pre', false, 80),
  ('Convênio', 'convenio', false, 90),
  ('Depósito', 'deposito', false, 100),
  ('Pendente', 'pendente', false, 110),
  ('Outros', 'outros', false, 120)
) AS v(nome, codigo, baixa, ordem)
WHERE NOT EXISTS (
  SELECT 1 FROM "formas_pagamento_financeiras" LIMIT 1
);
