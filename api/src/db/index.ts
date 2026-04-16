import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const url =
  process.env.DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:5432/espaco_lounge';

const client = postgres(url, { max: 10 });

export const db = drizzle(client, { schema });
export { schema };
export type Db = typeof db;

/**
 * Garante colunas esperadas quando a migração Drizzle ainda não correu.
 * Usa `information_schema` em vez de `ADD COLUMN IF NOT EXISTS` para evitar NOTICE 42701
 * no arranque (o driver imprime avisos do Postgres).
 */
export async function ensureSchemaPatches(): Promise<void> {
  await db.execute(sql.raw(`
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = current_schema()
      AND c.table_name = 'atendimentos' AND c.column_name = 'cobranca_status'
  ) THEN
    ALTER TABLE "atendimentos" ADD COLUMN "cobranca_status" text;
  END IF;
END $$;
`));
  await db.execute(sql.raw(`
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = current_schema()
      AND c.table_name = 'atendimentos' AND c.column_name = 'pagamento_status'
  ) THEN
    ALTER TABLE "atendimentos" ADD COLUMN "pagamento_status" text;
  END IF;
END $$;
`));
  await db.execute(sql.raw(`
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = current_schema()
      AND c.table_name = 'atendimentos' AND c.column_name = 'pagamento_metodo'
  ) THEN
    ALTER TABLE "atendimentos" ADD COLUMN "pagamento_metodo" text;
  END IF;
END $$;
`));
  await db.execute(sql.raw(`
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = current_schema()
      AND c.table_name = 'servicos' AND c.column_name = 'duracao_minutos'
  ) THEN
    ALTER TABLE "servicos" ADD COLUMN "duracao_minutos" integer DEFAULT 30 NOT NULL;
  END IF;
END $$;
`));
  await db.execute(sql.raw(`
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = current_schema()
      AND c.table_name = 'servicos' AND c.column_name = 'duracao_curto'
  ) THEN
    ALTER TABLE "servicos" ADD COLUMN "duracao_curto" integer;
  END IF;
END $$;
`));
  await db.execute(sql.raw(`
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = current_schema()
      AND c.table_name = 'servicos' AND c.column_name = 'duracao_medio'
  ) THEN
    ALTER TABLE "servicos" ADD COLUMN "duracao_medio" integer;
  END IF;
END $$;
`));
  await db.execute(sql.raw(`
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = current_schema()
      AND c.table_name = 'servicos' AND c.column_name = 'duracao_m_l'
  ) THEN
    ALTER TABLE "servicos" ADD COLUMN "duracao_m_l" integer;
  END IF;
END $$;
`));
  await db.execute(sql.raw(`
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = current_schema()
      AND c.table_name = 'servicos' AND c.column_name = 'duracao_longo'
  ) THEN
    ALTER TABLE "servicos" ADD COLUMN "duracao_longo" integer;
  END IF;
END $$;
`));
  await db.execute(sql.raw(`
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = current_schema()
      AND c.table_name = 'regras_mega' AND c.column_name = 'duracao_minutos'
  ) THEN
    ALTER TABLE "regras_mega" ADD COLUMN "duracao_minutos" integer DEFAULT 30 NOT NULL;
  END IF;
END $$;
`));
  await db.execute(sql.raw(`
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = current_schema()
      AND c.table_name = 'pacotes' AND c.column_name = 'duracao_minutos'
  ) THEN
    ALTER TABLE "pacotes" DROP COLUMN "duracao_minutos";
  END IF;
END $$;
`));
  await db.execute(sql.raw(`
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = current_schema()
      AND c.table_name = 'atendimento_itens' AND c.column_name = 'regra_mega_id'
  ) THEN
    ALTER TABLE "atendimento_itens" ADD COLUMN "regra_mega_id" integer;
    ALTER TABLE "atendimento_itens"
      ADD CONSTRAINT "atendimento_itens_regra_mega_id_fkey"
      FOREIGN KEY ("regra_mega_id") REFERENCES "regras_mega"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
END $$;
`));
  await db.execute(sql.raw(`
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = current_schema()
      AND c.table_name = 'atendimento_itens' AND c.column_name = 'pacote_id'
  ) THEN
    ALTER TABLE "atendimento_itens" ADD COLUMN "pacote_id" integer;
    ALTER TABLE "atendimento_itens"
      ADD CONSTRAINT "atendimento_itens_pacote_id_fkey"
      FOREIGN KEY ("pacote_id") REFERENCES "pacotes"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
END $$;
`));
  await db.execute(sql.raw(`
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = current_schema()
      AND c.table_name = 'folha' AND c.column_name = 'periodo_referencia'
  ) THEN
    ALTER TABLE "folha" ADD COLUMN "periodo_referencia" text;
  END IF;
END $$;
`));
  await db.execute(sql.raw(`
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = current_schema()
      AND c.table_name = 'pagamentos' AND c.column_name = 'profissional_id'
  ) THEN
    ALTER TABLE "pagamentos" ADD COLUMN "profissional_id" integer;
  END IF;
END $$;
`));
  await db.execute(sql.raw(`
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = current_schema()
      AND c.table_name = 'pagamentos' AND c.column_name = 'folha_id'
  ) THEN
    ALTER TABLE "pagamentos" ADD COLUMN "folha_id" integer;
  END IF;
END $$;
`));
}
