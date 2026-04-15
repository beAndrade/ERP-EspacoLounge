-- Colunas extras + remove CHECK antigo (sem referenciar os novos rótulos do enum).

ALTER TABLE "atendimento_itens"
  ADD COLUMN IF NOT EXISTS "pacote" text;

ALTER TABLE "atendimento_itens"
  ADD COLUMN IF NOT EXISTS "etapa" text;

ALTER TABLE "atendimento_itens"
  ADD COLUMN IF NOT EXISTS "detalhes" text;

ALTER TABLE "atendimento_itens"
  DROP CONSTRAINT IF EXISTS "atendimento_itens_tipo_chk";
