/**
 * Zera `public` + `drizzle` e aplica todas as migrações em `api/drizzle/*.sql`.
 * Uso: na pasta `api`, com Postgres acessível em DATABASE_URL:
 *   npm run db:reset
 */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

const url =
  process.env['DATABASE_URL'] ??
  'postgresql://postgres:postgres@localhost:5432/espaco_lounge';

const apiRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

const sql = postgres(url, { max: 1 });

try {
  await sql.unsafe('DROP SCHEMA IF EXISTS drizzle CASCADE');
  await sql.unsafe('DROP SCHEMA IF EXISTS public CASCADE');
  await sql.unsafe('CREATE SCHEMA public');
  await sql.unsafe('GRANT ALL ON SCHEMA public TO postgres');
  await sql.unsafe('GRANT ALL ON SCHEMA public TO public');
  console.log('[db:reset] Schemas drizzle + public recriados.');
} finally {
  await sql.end({ timeout: 5 });
}

const r = spawnSync('npx', ['drizzle-kit', 'migrate'], {
  cwd: apiRoot,
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, DATABASE_URL: url },
});

if (r.error) throw r.error;
process.exit(r.status ?? 1);
