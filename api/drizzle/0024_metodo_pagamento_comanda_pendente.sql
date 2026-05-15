-- Valor «pendente» = valor alocado em dívida (sem movimentação de receita até liquidação).

DO $$ BEGIN
  ALTER TYPE "metodo_pagamento_comanda" ADD VALUE 'pendente';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
