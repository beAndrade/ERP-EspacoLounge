-- Duração (minutos) por tamanho de cabelo; serviço Fixo usa só `duracao_minutos`.
ALTER TABLE "servicos" ADD COLUMN IF NOT EXISTS "duracao_curto" integer;
ALTER TABLE "servicos" ADD COLUMN IF NOT EXISTS "duracao_medio" integer;
ALTER TABLE "servicos" ADD COLUMN IF NOT EXISTS "duracao_m_l" integer;
ALTER TABLE "servicos" ADD COLUMN IF NOT EXISTS "duracao_longo" integer;
