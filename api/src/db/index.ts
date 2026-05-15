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
 * Usa `information_schema` / `pg_indexes` em vez de `IF NOT EXISTS` para evitar NOTICE
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
  await db.execute(sql.raw(`
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = current_schema()
      AND c.table_name = 'profissionais' AND c.column_name = 'ativo'
  ) THEN
    ALTER TABLE "profissionais" ADD COLUMN "ativo" boolean DEFAULT true NOT NULL;
  END IF;
END $$;
`));
  await db.execute(sql.raw(`
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = current_schema()
      AND c.table_name = 'atendimentos' AND c.column_name = 'agenda_status'
  ) THEN
    ALTER TABLE "atendimentos" ADD COLUMN "agenda_status" text;
  END IF;
END $$;
`));
  await db.execute(sql.raw(`
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = current_schema()
      AND c.table_name = 'atendimentos' AND c.column_name = 'agenda_cor'
  ) THEN
    ALTER TABLE "atendimentos" ADD COLUMN "agenda_cor" text;
  END IF;
END $$;
`));
  await db.execute(sql.raw(`
DO $$ BEGIN
  CREATE TYPE "metodo_pagamento_comanda" AS ENUM (
    'dinheiro',
    'cartao_credito',
    'cartao_debito',
    'pix',
    'transferencia',
    'outros'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
`));
  await db.execute(sql.raw(`
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables t
    WHERE t.table_schema = current_schema()
      AND t.table_name = 'comanda_pagamentos'
  ) THEN
    CREATE TABLE "comanda_pagamentos" (
      "id" serial PRIMARY KEY,
      "id_atendimento" text NOT NULL,
      "data_pagamento" date NOT NULL,
      "valor" numeric(14, 2) NOT NULL,
      "metodo" "metodo_pagamento_comanda" NOT NULL,
      "parcelas" integer DEFAULT 1 NOT NULL,
      "troco" numeric(14, 2),
      "observacao" text,
      "movimentacao_id" integer,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL
    );
  END IF;
END $$;
`));
  await db.execute(sql.raw(`
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'comanda_pagamentos_id_atendimento_fkey'
  ) THEN
    ALTER TABLE "comanda_pagamentos"
      ADD CONSTRAINT "comanda_pagamentos_id_atendimento_fkey"
      FOREIGN KEY ("id_atendimento")
      REFERENCES "atendimentos_pedido"("id_atendimento")
      ON DELETE CASCADE;
  END IF;
END $$;
`));
  await db.execute(sql.raw(`
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'comanda_pagamentos_movimentacao_id_fkey'
  ) THEN
    ALTER TABLE "comanda_pagamentos"
      ADD CONSTRAINT "comanda_pagamentos_movimentacao_id_fkey"
      FOREIGN KEY ("movimentacao_id")
      REFERENCES "movimentacoes"("id")
      ON DELETE SET NULL;
  END IF;
END $$;
`));
  await db.execute(sql.raw(`
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes i
    WHERE i.schemaname = current_schema()
      AND i.tablename = 'comanda_pagamentos'
      AND i.indexname = 'comanda_pagamentos_id_atendimento_idx'
  ) THEN
    CREATE INDEX "comanda_pagamentos_id_atendimento_idx"
      ON "comanda_pagamentos" ("id_atendimento");
  END IF;
END $$;
`));
  await db.execute(sql.raw(`
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes i
    WHERE i.schemaname = current_schema()
      AND i.tablename = 'comanda_pagamentos'
      AND i.indexname = 'comanda_pagamentos_data_idx'
  ) THEN
    CREATE INDEX "comanda_pagamentos_data_idx"
      ON "comanda_pagamentos" ("data_pagamento");
  END IF;
END $$;
`));
  await db.execute(sql.raw(`
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = current_schema()
      AND c.table_name = 'atendimentos_pedido' AND c.column_name = 'id_recorrencia'
  ) THEN
    ALTER TABLE "atendimentos_pedido" ADD COLUMN "id_recorrencia" text;
  END IF;
END $$;
`));
  await db.execute(sql.raw(`
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = current_schema()
      AND c.table_name = 'atendimentos_pedido' AND c.column_name = 'ordem_recorrencia'
  ) THEN
    ALTER TABLE "atendimentos_pedido" ADD COLUMN "ordem_recorrencia" integer;
  END IF;
END $$;
`));
  await db.execute(sql.raw(`
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes i
    WHERE i.schemaname = current_schema()
      AND i.tablename = 'atendimentos_pedido'
      AND i.indexname = 'atendimentos_pedido_id_recorrencia_idx'
  ) THEN
    CREATE INDEX "atendimentos_pedido_id_recorrencia_idx"
      ON "atendimentos_pedido" ("id_recorrencia");
  END IF;
END $$;
`));
  await db.execute(sql.raw(`
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = current_schema()
      AND c.table_name = 'atendimento_itens' AND c.column_name = 'valor_unitario'
  ) THEN
    ALTER TABLE "atendimento_itens" ADD COLUMN "valor_unitario" numeric(14, 2);
  END IF;
END $$;
`));
  await db.execute(sql.raw(`
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = current_schema()
      AND c.table_name = 'atendimento_itens' AND c.column_name = 'desconto'
  ) THEN
    ALTER TABLE "atendimento_itens" ADD COLUMN "desconto" numeric(14, 2);
  END IF;
END $$;
`));
  /** Alinha com `0025_clientes_credito_saldo` quando `db:migrate` ainda não correu. */
  await db.execute(sql.raw(`
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = current_schema()
      AND c.table_name = 'clientes' AND c.column_name = 'credito_saldo'
  ) THEN
    ALTER TABLE "clientes" ADD COLUMN "credito_saldo" numeric(14, 2) DEFAULT 0 NOT NULL;
  END IF;
END $$;
`));
  /** Alinha com `0026_atendimentos_quantidade` quando `db:migrate` ainda não correu. */
  await db.execute(sql.raw(`
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = current_schema()
      AND c.table_name = 'atendimentos' AND c.column_name = 'quantidade'
  ) THEN
    ALTER TABLE "atendimentos" ADD COLUMN "quantidade" integer DEFAULT 1 NOT NULL;
  END IF;
END $$;
`));
}
