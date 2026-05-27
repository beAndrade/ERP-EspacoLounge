ALTER TABLE "formas_pagamento_financeiras"
  ADD COLUMN IF NOT EXISTS "taxa_percentual" numeric(6, 3) DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS "taxa_fixa" numeric(14, 2) DEFAULT 0 NOT NULL;

UPDATE "formas_pagamento_financeiras"
SET "taxa_percentual" = 3.000
WHERE "codigo_interno" = 'cartao_credito';

UPDATE "formas_pagamento_financeiras"
SET "taxa_percentual" = 1.500
WHERE "codigo_interno" = 'cartao_debito';
