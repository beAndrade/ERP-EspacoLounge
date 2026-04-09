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
