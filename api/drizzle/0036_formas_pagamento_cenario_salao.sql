-- Cenário salão: Pix, Dinheiro e Débito como principais; demais raros ficam inativos.
UPDATE "formas_pagamento_financeiras"
SET "baixa_automatica" = true
WHERE "codigo_interno" IN ('pix', 'dinheiro', 'cartao_debito');

UPDATE "formas_pagamento_financeiras"
SET "baixa_automatica" = false
WHERE "codigo_interno" NOT IN ('pix', 'dinheiro', 'cartao_debito');

UPDATE "formas_pagamento_financeiras"
SET "ativo" = false
WHERE "codigo_interno" IN (
  'boleto',
  'cheque_vista',
  'cheque_pre',
  'convenio',
  'deposito'
);
