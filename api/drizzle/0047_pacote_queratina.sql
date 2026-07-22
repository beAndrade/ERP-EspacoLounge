-- Pacote Queratina: catálogo paralelo a pacotes / regras_mega + FKs no pivot.

DO $$ BEGIN
  ALTER TYPE "atendimento_item_tipo" ADD VALUE 'pacote_queratina';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

COMMIT AND CHAIN;

CREATE TABLE IF NOT EXISTS "pacotes_queratina" (
  "id" serial PRIMARY KEY NOT NULL,
  "pacote" text NOT NULL,
  "preco_pacote" text
);

CREATE TABLE IF NOT EXISTS "regras_mega_queratina" (
  "id" serial PRIMARY KEY NOT NULL,
  "pacote" text NOT NULL,
  "etapa" text NOT NULL,
  "valor" text,
  "comissao" text,
  "duracao_minutos" integer DEFAULT 30 NOT NULL
);

ALTER TABLE "atendimento_itens" ADD COLUMN IF NOT EXISTS "regra_mega_queratina_id" integer;
ALTER TABLE "atendimento_itens" ADD COLUMN IF NOT EXISTS "pacote_queratina_id" integer;

DO $$ BEGIN
  ALTER TABLE "atendimento_itens"
    ADD CONSTRAINT "atendimento_itens_regra_mega_queratina_id_fkey"
    FOREIGN KEY ("regra_mega_queratina_id") REFERENCES "regras_mega_queratina"("id")
    ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "atendimento_itens"
    ADD CONSTRAINT "atendimento_itens_pacote_queratina_id_fkey"
    FOREIGN KEY ("pacote_queratina_id") REFERENCES "pacotes_queratina"("id")
    ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
