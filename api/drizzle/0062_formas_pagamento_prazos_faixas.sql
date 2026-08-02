CREATE TABLE IF NOT EXISTS "formas_pagamento_prazos_faixas" (
  "id" serial PRIMARY KEY NOT NULL,
  "forma_id" integer NOT NULL,
  "parcelas_de" integer NOT NULL,
  "parcelas_ate" integer NOT NULL,
  "dias_ate_primeira" integer DEFAULT 0 NOT NULL,
  "intervalo_dias" integer DEFAULT 0 NOT NULL,
  "taxa_percentual" numeric(6, 3),
  "juros_cliente" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "formas_pagamento_prazos_faixas"
    ADD CONSTRAINT "formas_pagamento_prazos_faixas_forma_id_formas_pagamento_financeiras_id_fk"
    FOREIGN KEY ("forma_id") REFERENCES "public"."formas_pagamento_financeiras"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "formas_pagamento_prazos_faixas_forma_idx"
  ON "formas_pagamento_prazos_faixas" ("forma_id");
--> statement-breakpoint
-- Placeholder 1x / 2x / 3x+ para cartão de crédito (ajustável no cadastro).
INSERT INTO "formas_pagamento_prazos_faixas" (
  "forma_id", "parcelas_de", "parcelas_ate",
  "dias_ate_primeira", "intervalo_dias", "taxa_percentual", "juros_cliente"
)
SELECT f.id, v.parcelas_de, v.parcelas_ate, v.dias_primeira, v.intervalo, NULL, v.juros
FROM "formas_pagamento_financeiras" f
CROSS JOIN (VALUES
  (1, 1, 30, 0, false),
  (2, 2, 30, 30, false),
  (3, 18, 30, 30, true)
) AS v(parcelas_de, parcelas_ate, dias_primeira, intervalo, juros)
WHERE f.codigo_interno = 'cartao_credito'
  AND NOT EXISTS (
    SELECT 1 FROM "formas_pagamento_prazos_faixas" x WHERE x.forma_id = f.id
  );
