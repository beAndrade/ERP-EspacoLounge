-- Desconto por item: V. Unit + Desconto na tabela do carrinho.
-- Permite registar valor unitário e desconto a nível de item (Serviço/Produto/Cabelo),
-- substituindo a inferência por `atendimentos.valor`/`valor_manual`/`desconto`.

ALTER TABLE "atendimento_itens"
  ADD COLUMN IF NOT EXISTS "valor_unitario" numeric(14, 2);

ALTER TABLE "atendimento_itens"
  ADD COLUMN IF NOT EXISTS "desconto" numeric(14, 2);
