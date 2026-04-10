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

/** Garante colunas esperadas pelo código quando a migração Drizzle ainda não correu. */
export async function ensureSchemaPatches(): Promise<void> {
  await db.execute(
    sql.raw(
      'ALTER TABLE "atendimentos" ADD COLUMN IF NOT EXISTS "cobranca_status" text',
    ),
  );
}
