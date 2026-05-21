-- Comandas walk-in podem omitir status de cartão na agenda (sem `inicio`/`fim`).
ALTER TABLE "atendimentos" ALTER COLUMN "agenda_status" DROP NOT NULL;
