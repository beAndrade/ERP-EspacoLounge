-- A enum `pacote_queratina` (0047) existia, mas o CHECK antigo não a incluía —
-- inserir pivot de Pacote Adesivo+Queratina violava `atendimento_itens_tipo_chk`.

ALTER TABLE "atendimento_itens"
  DROP CONSTRAINT IF EXISTS "atendimento_itens_tipo_chk";

ALTER TABLE "atendimento_itens"
  ADD CONSTRAINT "atendimento_itens_tipo_chk" CHECK (
    (
      "tipo"::text = 'servico'
      AND "servico_id" IS NOT NULL
      AND "produto_id" IS NULL
    )
    OR
    (
      "tipo"::text = 'produto'
      AND "produto_id" IS NOT NULL
      AND "servico_id" IS NULL
    )
    OR
    (
      "tipo"::text IN ('mega', 'pacote', 'pacote_queratina', 'cabelo')
      AND "servico_id" IS NULL
      AND "produto_id" IS NULL
    )
  );
