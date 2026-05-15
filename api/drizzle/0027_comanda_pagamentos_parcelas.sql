-- Parcelas: 1 linha por prestação (valor + data + método efectivo).
-- `parcela_numero` / `parcelas_total` + `metodo_rotulo` para UI «Método 1/2» (2.ª+ em `pendente`).

ALTER TABLE "comanda_pagamentos" ADD COLUMN IF NOT EXISTS "parcela_numero" integer;
ALTER TABLE "comanda_pagamentos" ADD COLUMN IF NOT EXISTS "parcelas_total" integer;
ALTER TABLE "comanda_pagamentos" ADD COLUMN IF NOT EXISTS "metodo_rotulo" text;
