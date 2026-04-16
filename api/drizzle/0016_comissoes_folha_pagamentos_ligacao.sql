-- Ligação explícita: folha = resumo mensal por profissional; pagamentos = saídas para profissionais.
-- atendimentos continua a fonte por linha (comissao + profissional_id + data); sem FK folha↔atendimento.

ALTER TABLE "folha" ADD COLUMN "periodo_referencia" text;

UPDATE "folha" AS f
SET "periodo_referencia" = to_char(to_date(trim(f."mes"), 'MM/YYYY'), 'YYYY-MM')
WHERE f."periodo_referencia" IS NULL
  AND f."mes" IS NOT NULL
  AND trim(f."mes") ~ '^[0-9]{1,2}/[0-9]{4}$';

CREATE INDEX "folha_profissional_periodo_idx" ON "folha" ("profissional_id", "periodo_referencia");

ALTER TABLE "pagamentos" ADD COLUMN "profissional_id" integer;
ALTER TABLE "pagamentos" ADD COLUMN "folha_id" integer;

UPDATE "pagamentos" AS p
SET "profissional_id" = pr."id"
FROM "profissionais" AS pr
WHERE p."profissional_id" IS NULL
  AND trim(coalesce(p."profissional", '')) <> ''
  AND lower(trim(pr."nome")) = lower(trim(p."profissional"));

CREATE INDEX "pagamentos_profissional_id_idx" ON "pagamentos" ("profissional_id");
CREATE INDEX "pagamentos_folha_id_idx" ON "pagamentos" ("folha_id");

ALTER TABLE "pagamentos"
  ADD CONSTRAINT "pagamentos_profissional_id_profissionais_id_fk"
  FOREIGN KEY ("profissional_id") REFERENCES "profissionais" ("id")
  ON DELETE SET NULL ON UPDATE NO ACTION;

ALTER TABLE "pagamentos"
  ADD CONSTRAINT "pagamentos_folha_id_folha_id_fk"
  FOREIGN KEY ("folha_id") REFERENCES "folha" ("id")
  ON DELETE SET NULL ON UPDATE NO ACTION;
