-- Parcelas de cartão («a_receber_cartao») passam a ser liquidadas
-- automaticamente no vencimento quando a forma tem baixa automática.
-- Ativa o flag para as formas de cartão (a operadora deposita sozinha).
UPDATE "formas_pagamento_financeiras"
SET "baixa_automatica" = true
WHERE "codigo_interno" IN ('cartao_credito', 'cartao_debito');
