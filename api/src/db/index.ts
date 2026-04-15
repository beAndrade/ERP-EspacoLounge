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
}
