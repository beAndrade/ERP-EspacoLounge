ALTER TABLE "formas_pagamento_financeiras"
  ADD COLUMN IF NOT EXISTS "prazo_recebimento" integer DEFAULT 0 NOT NULL;

UPDATE "formas_pagamento_financeiras"
SET "prazo_recebimento" = 30
WHERE "codigo_interno" IN ('cartao_credito', 'boleto', 'cheque_pre');

UPDATE "formas_pagamento_financeiras"
SET "prazo_recebimento" = 1
WHERE "codigo_interno" = 'transferencia';
