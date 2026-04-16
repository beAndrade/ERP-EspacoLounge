-- Duração (minutos) nos catálogos Mega/Pacote e FKs em `atendimento_itens`.

ALTER TABLE "regras_mega" ADD COLUMN "duracao_minutos" integer DEFAULT 30 NOT NULL;
ALTER TABLE "pacotes" ADD COLUMN "duracao_minutos" integer DEFAULT 30 NOT NULL;

ALTER TABLE "atendimento_itens" ADD COLUMN "regra_mega_id" integer;
ALTER TABLE "atendimento_itens" ADD COLUMN "pacote_id" integer;

ALTER TABLE "atendimento_itens"
  ADD CONSTRAINT "atendimento_itens_regra_mega_id_fkey"
  FOREIGN KEY ("regra_mega_id") REFERENCES "regras_mega"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

ALTER TABLE "atendimento_itens"
  ADD CONSTRAINT "atendimento_itens_pacote_id_fkey"
  FOREIGN KEY ("pacote_id") REFERENCES "pacotes"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- Liga linhas já gravadas ao catálogo quando o texto coincide.
UPDATE "atendimento_itens" ai
SET "regra_mega_id" = rm."id"
FROM "regras_mega" rm
WHERE ai."tipo"::text = 'mega'
  AND trim(both from coalesce(ai."pacote", '')) = trim(both from rm."pacote")
  AND trim(both from coalesce(ai."etapa", '')) = trim(both from rm."etapa");

UPDATE "atendimento_itens" ai
SET "regra_mega_id" = rm."id"
FROM "regras_mega" rm
WHERE ai."tipo"::text = 'pacote'
  AND trim(both from coalesce(ai."pacote", '')) = trim(both from rm."pacote")
  AND trim(both from coalesce(ai."etapa", '')) = trim(both from rm."etapa")
  AND trim(both from coalesce(ai."etapa", '')) <> '';

UPDATE "atendimento_itens" ai
SET "pacote_id" = p."id"
FROM "pacotes" p
WHERE ai."tipo"::text = 'pacote'
  AND trim(both from coalesce(ai."pacote", '')) = trim(both from p."pacote")
  AND (ai."etapa" IS NULL OR trim(both from ai."etapa") = '');

UPDATE "atendimento_itens" ai
SET "pacote_id" = p."id"
FROM "pacotes" p
WHERE ai."tipo"::text = 'mega'
  AND trim(both from coalesce(ai."pacote", '')) = trim(both from p."pacote");
