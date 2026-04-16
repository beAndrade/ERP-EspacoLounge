-- Duração de Mega/Pacote vem só das etapas em `regras_mega.duracao_minutos`.
ALTER TABLE "pacotes" DROP COLUMN IF EXISTS "duracao_minutos";
