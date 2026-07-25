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
  /** Alinha com `0024` + `0048_metodo_a_receber_cartao` (só o enum; backfill mais abaixo). */
  await db.execute(sql.raw(`
DO $$ BEGIN
  ALTER TYPE "metodo_pagamento_comanda" ADD VALUE 'pendente';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
`));
  await db.execute(sql.raw(`
DO $$ BEGIN
  ALTER TYPE "metodo_pagamento_comanda" ADD VALUE 'a_receber_cartao';
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
  for (const col of ['parcela_numero', 'parcelas_total', 'metodo_rotulo']) {
    const colType = col === 'metodo_rotulo' ? 'text' : 'integer';
    await db.execute(sql.raw(`
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = current_schema()
      AND c.table_name = 'comanda_pagamentos' AND c.column_name = '${col}'
  ) THEN
    ALTER TABLE "comanda_pagamentos" ADD COLUMN "${col}" ${colType};
  END IF;
END $$;
`));
  }
  /** Backfill `0048`: pendente com rótulo de cartão → a_receber_cartao. */
  await db.execute(sql.raw(`
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = current_schema()
      AND c.table_name = 'comanda_pagamentos' AND c.column_name = 'metodo_rotulo'
  ) THEN
    UPDATE "comanda_pagamentos"
    SET "metodo" = 'a_receber_cartao'
    WHERE "metodo" = 'pendente'
      AND (
        lower(coalesce("metodo_rotulo", '')) IN ('cartao_credito', 'cartao_debito')
        OR lower(coalesce("metodo_rotulo", '')) LIKE '%cartao%'
        OR lower(coalesce("metodo_rotulo", '')) LIKE '%cartão%'
        OR lower(coalesce("metodo_rotulo", '')) LIKE '%crédito%'
        OR lower(coalesce("metodo_rotulo", '')) LIKE '%credito%'
        OR lower(coalesce("metodo_rotulo", '')) LIKE '%débito%'
        OR lower(coalesce("metodo_rotulo", '')) LIKE '%debito%'
      );
  END IF;
END $$;
`));
  /**
   * Comandas finalizadas só com parcelas de cartão a receber (sem fiado):
   * deixa de ficar `pagamento_status = pendente` na recepção.
   */
  await db.execute(sql.raw(`
UPDATE "atendimentos" a
SET "pagamento_status" = 'confirmado'
WHERE lower(coalesce(a."cobranca_status", '')) = 'finalizada'
  AND lower(coalesce(a."pagamento_status", '')) = 'pendente'
  AND NOT EXISTS (
    SELECT 1 FROM "comanda_pagamentos" cp
    WHERE cp."id_atendimento" = a."id_atendimento"
      AND cp."metodo" = 'pendente'
  )
  AND EXISTS (
    SELECT 1 FROM "comanda_pagamentos" cp
    WHERE cp."id_atendimento" = a."id_atendimento"
      AND cp."metodo" = 'a_receber_cartao'
  );
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
  /** Campos estruturados do cadastro de cliente (`0028_clientes_campos_cadastro`). */
  await db.execute(sql.raw(`
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = current_schema()
      AND c.table_name = 'clientes' AND c.column_name = 'apelido'
  ) THEN
    ALTER TABLE "clientes" ADD COLUMN "apelido" text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = current_schema()
      AND c.table_name = 'clientes' AND c.column_name = 'email'
  ) THEN
    ALTER TABLE "clientes" ADD COLUMN "email" text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = current_schema()
      AND c.table_name = 'clientes' AND c.column_name = 'celular'
  ) THEN
    ALTER TABLE "clientes" ADD COLUMN "celular" text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = current_schema()
      AND c.table_name = 'clientes' AND c.column_name = 'telefone_fixo'
  ) THEN
    ALTER TABLE "clientes" ADD COLUMN "telefone_fixo" text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = current_schema()
      AND c.table_name = 'clientes' AND c.column_name = 'aniversario'
  ) THEN
    ALTER TABLE "clientes" ADD COLUMN "aniversario" text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = current_schema()
      AND c.table_name = 'clientes' AND c.column_name = 'cnpj'
  ) THEN
    ALTER TABLE "clientes" ADD COLUMN "cnpj" text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = current_schema()
      AND c.table_name = 'clientes' AND c.column_name = 'cpf'
  ) THEN
    ALTER TABLE "clientes" ADD COLUMN "cpf" text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = current_schema()
      AND c.table_name = 'clientes' AND c.column_name = 'rg'
  ) THEN
    ALTER TABLE "clientes" ADD COLUMN "rg" text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = current_schema()
      AND c.table_name = 'clientes' AND c.column_name = 'foto_url'
  ) THEN
    ALTER TABLE "clientes" ADD COLUMN "foto_url" text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = current_schema()
      AND c.table_name = 'clientes' AND c.column_name = 'notificacoes_ativo'
  ) THEN
    ALTER TABLE "clientes" ADD COLUMN "notificacoes_ativo" boolean DEFAULT true NOT NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = current_schema()
      AND c.table_name = 'clientes' AND c.column_name = 'desconto_padrao_texto'
  ) THEN
    ALTER TABLE "clientes" ADD COLUMN "desconto_padrao_texto" text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = current_schema()
      AND c.table_name = 'clientes' AND c.column_name = 'desconto_padrao_modo'
  ) THEN
    ALTER TABLE "clientes" ADD COLUMN "desconto_padrao_modo" text;
  END IF;
END $$;
`));
  await db.execute(sql.raw(`
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = current_schema()
      AND c.table_name = 'clientes' AND c.column_name = 'observacoes'
  ) THEN
    ALTER TABLE "clientes" DROP COLUMN "observacoes";
  END IF;
END $$;
`));
  /** Endereço e redes (`0030_clientes_endereco_redes`). */
  for (const col of [
    'cep',
    'logradouro',
    'endereco_numero',
    'complemento',
    'bairro',
    'estado',
    'cidade',
    'instagram',
    'facebook',
  ]) {
    await db.execute(sql.raw(`
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = current_schema()
      AND c.table_name = 'clientes' AND c.column_name = '${col}'
  ) THEN
    ALTER TABLE "clientes" ADD COLUMN "${col}" text;
  END IF;
END $$;
`));
  }
  /** Alinha com `0032_cliente_credito_movimentos` quando `db:migrate` ainda não correu. */
  await db.execute(sql.raw(`
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables t
    WHERE t.table_schema = current_schema()
      AND t.table_name = 'cliente_credito_movimentos'
  ) THEN
    CREATE TABLE "cliente_credito_movimentos" (
      "id" serial PRIMARY KEY NOT NULL,
      "cliente_id" text NOT NULL,
      "id_atendimento" text,
      "data_mov" date NOT NULL,
      "valor" numeric(14, 2) NOT NULL,
      "tipo" text NOT NULL,
      "motivo" text NOT NULL,
      "created_at" timestamptz DEFAULT now() NOT NULL,
      CONSTRAINT "cliente_credito_movimentos_cliente_id_clientes_id_cliente_fk"
        FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id_cliente") ON DELETE CASCADE,
      CONSTRAINT "cliente_credito_movimentos_tipo_chk"
        CHECK ("tipo" IN ('entrada', 'saida'))
    );
  END IF;
END $$;
`));
  await db.execute(sql.raw(`
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes i
    WHERE i.schemaname = current_schema()
      AND i.tablename = 'cliente_credito_movimentos'
      AND i.indexname = 'cliente_credito_movimentos_cliente_idx'
  ) THEN
    CREATE INDEX "cliente_credito_movimentos_cliente_idx"
      ON "cliente_credito_movimentos" ("cliente_id");
  END IF;
END $$;
`));
  await db.execute(sql.raw(`
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes i
    WHERE i.schemaname = current_schema()
      AND i.tablename = 'cliente_credito_movimentos'
      AND i.indexname = 'cliente_credito_movimentos_cliente_data_idx'
  ) THEN
    CREATE INDEX "cliente_credito_movimentos_cliente_data_idx"
      ON "cliente_credito_movimentos" ("cliente_id", "data_mov" DESC, "id" DESC);
  END IF;
END $$;
`));
  /** Alinha com `0033_comissao_paga_transacoes` quando `db:migrate` ainda não correu. */
  await db.execute(sql.raw(`
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = current_schema()
      AND c.table_name = 'atendimentos' AND c.column_name = 'comissao_paga_em'
  ) THEN
    ALTER TABLE "atendimentos" ADD COLUMN "comissao_paga_em" date;
  END IF;
END $$;
`));
  await db.execute(sql.raw(`
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes i
    WHERE i.schemaname = current_schema()
      AND i.tablename = 'atendimentos'
      AND i.indexname = 'atendimentos_comissao_paga_em_idx'
  ) THEN
    CREATE INDEX "atendimentos_comissao_paga_em_idx"
      ON "atendimentos" ("comissao_paga_em")
      WHERE "comissao_paga_em" IS NOT NULL;
  END IF;
END $$;
`));
  await db.execute(sql.raw(`
INSERT INTO "categorias_financeiras" ("nome", "natureza", "slug", "ordem", "ativo")
SELECT 'Comissão', 'despesa', 'despesa_comissao', 125, true
WHERE NOT EXISTS (
  SELECT 1 FROM "categorias_financeiras" WHERE "slug" = 'despesa_comissao'
);
`));
  /** Alinha com `0034_movimentacoes_pago_em` quando `db:migrate` ainda não correu. */
  await db.execute(sql.raw(`
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = current_schema()
      AND c.table_name = 'movimentacoes' AND c.column_name = 'pago_em'
  ) THEN
    ALTER TABLE "movimentacoes" ADD COLUMN "pago_em" date;
  END IF;
END $$;
`));
  await db.execute(sql.raw(`
UPDATE "movimentacoes"
SET "pago_em" = "data_mov"
WHERE "pago_em" IS NULL;
`));
  await db.execute(sql.raw(`
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes i
    WHERE i.schemaname = current_schema()
      AND i.tablename = 'movimentacoes'
      AND i.indexname = 'movimentacoes_pago_em_idx'
  ) THEN
    CREATE INDEX "movimentacoes_pago_em_idx"
      ON "movimentacoes" ("pago_em");
  END IF;
END $$;
`));
  /** Alinha com `0035_formas_pagamento_financeiras` quando `db:migrate` ainda não correu. */
  await db.execute(sql.raw(`
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables t
    WHERE t.table_schema = current_schema()
      AND t.table_name = 'formas_pagamento_financeiras'
  ) THEN
    CREATE TABLE "formas_pagamento_financeiras" (
      "id" serial PRIMARY KEY NOT NULL,
      "nome" text NOT NULL,
      "codigo_interno" text NOT NULL,
      "baixa_automatica" boolean DEFAULT false NOT NULL,
      "ordem" integer DEFAULT 0 NOT NULL,
      "ativo" boolean DEFAULT true NOT NULL,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL,
      CONSTRAINT "formas_pagamento_financeiras_codigo_interno_unique" UNIQUE ("codigo_interno")
    );
  END IF;
END $$;
`));
  await db.execute(sql.raw(`
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes i
    WHERE i.schemaname = current_schema()
      AND i.tablename = 'formas_pagamento_financeiras'
      AND i.indexname = 'formas_pagamento_financeiras_ativo_ordem_idx'
  ) THEN
    CREATE INDEX "formas_pagamento_financeiras_ativo_ordem_idx"
      ON "formas_pagamento_financeiras" ("ativo", "ordem", "id");
  END IF;
END $$;
`));
  await db.execute(sql.raw(`
INSERT INTO "formas_pagamento_financeiras" ("nome", "codigo_interno", "baixa_automatica", "ordem", "ativo")
SELECT v.nome, v.codigo, v.baixa, v.ordem, true
FROM (VALUES
  ('Pix', 'pix', true, 10),
  ('Dinheiro', 'dinheiro', true, 20),
  ('Cartão de Crédito', 'cartao_credito', false, 30),
  ('Cartão de Débito', 'cartao_debito', true, 40),
  ('Transferência', 'transferencia', false, 50),
  ('Boleto', 'boleto', false, 60),
  ('Cheque à Vista', 'cheque_vista', false, 70),
  ('Cheque Pré', 'cheque_pre', false, 80),
  ('Convênio', 'convenio', false, 90),
  ('Depósito', 'deposito', false, 100),
  ('Pendente', 'pendente', false, 110),
  ('Outros', 'outros', false, 120)
) AS v(nome, codigo, baixa, ordem)
WHERE NOT EXISTS (
  SELECT 1 FROM "formas_pagamento_financeiras" LIMIT 1
);
`));
  /** Alinha com `0036_formas_pagamento_cenario_salao`. */
  await db.execute(sql.raw(`
UPDATE "formas_pagamento_financeiras"
SET "baixa_automatica" = true
WHERE "codigo_interno" IN ('pix', 'dinheiro', 'cartao_debito');
`));
  await db.execute(sql.raw(`
UPDATE "formas_pagamento_financeiras"
SET "baixa_automatica" = false
WHERE "codigo_interno" NOT IN ('pix', 'dinheiro', 'cartao_debito');
`));
  await db.execute(sql.raw(`
UPDATE "formas_pagamento_financeiras"
SET "ativo" = false
WHERE "codigo_interno" IN (
  'boleto', 'cheque_vista', 'cheque_pre', 'convenio', 'deposito'
);
`));
  /** Alinha com `0037_formas_pagamento_taxas`. */
  await db.execute(sql.raw(`
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = current_schema()
      AND c.table_name = 'formas_pagamento_financeiras'
      AND c.column_name = 'taxa_percentual'
  ) THEN
    ALTER TABLE "formas_pagamento_financeiras"
      ADD COLUMN "taxa_percentual" numeric(6, 3) DEFAULT 0 NOT NULL,
      ADD COLUMN "taxa_fixa" numeric(14, 2) DEFAULT 0 NOT NULL;
  END IF;
END $$;
`));
  await db.execute(sql.raw(`
UPDATE "formas_pagamento_financeiras"
SET "taxa_percentual" = 3.000
WHERE "codigo_interno" = 'cartao_credito'
  AND "taxa_percentual" = 0;
`));
  await db.execute(sql.raw(`
UPDATE "formas_pagamento_financeiras"
SET "taxa_percentual" = 1.500
WHERE "codigo_interno" = 'cartao_debito'
  AND "taxa_percentual" = 0;
`));
  /** Alinha com `0038_formas_pagamento_prazo`. */
  await db.execute(sql.raw(`
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = current_schema()
      AND c.table_name = 'formas_pagamento_financeiras'
      AND c.column_name = 'prazo_recebimento'
  ) THEN
    ALTER TABLE "formas_pagamento_financeiras"
      ADD COLUMN "prazo_recebimento" integer DEFAULT 0 NOT NULL;
  END IF;
END $$;
`));
  await db.execute(sql.raw(`
UPDATE "formas_pagamento_financeiras"
SET "prazo_recebimento" = 30
WHERE "codigo_interno" IN ('cartao_credito', 'boleto', 'cheque_pre')
  AND "prazo_recebimento" = 0;
`));
  await db.execute(sql.raw(`
UPDATE "formas_pagamento_financeiras"
SET "prazo_recebimento" = 1
WHERE "codigo_interno" = 'transferencia'
  AND "prazo_recebimento" = 0;
`));
  /** Serviços sem tipo não apareciam no agendamento (filtro Fixo/Tamanho). */
  await db.execute(sql.raw(`
UPDATE "servicos"
SET "tipo" = 'Fixo'
WHERE ("tipo" IS NULL OR trim("tipo") = '')
  AND "valor_base" IS NOT NULL
  AND trim("valor_base"::text) <> ''
  AND ("preco_curto" IS NULL OR trim("preco_curto"::text) = '');
`));
  await db.execute(sql.raw(`
UPDATE "servicos"
SET "tipo" = 'Tamanho'
WHERE ("tipo" IS NULL OR trim("tipo") = '')
  AND "preco_curto" IS NOT NULL
  AND trim("preco_curto"::text) <> '';
`));
  await db.execute(sql.raw(`
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = current_schema()
      AND c.table_name = 'servicos' AND c.column_name = 'categoria'
  ) THEN
    ALTER TABLE "servicos" ADD COLUMN "categoria" text;
  END IF;
END $$;
`));
  await db.execute(sql.raw(`
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = current_schema()
      AND c.table_name = 'servicos' AND c.column_name = 'mostra_no_site'
  ) THEN
    ALTER TABLE "servicos" ADD COLUMN "mostra_no_site" boolean DEFAULT true NOT NULL;
  END IF;
END $$;
`));
  await db.execute(sql.raw(`
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = current_schema()
      AND c.table_name = 'servicos' AND c.column_name = 'descricao'
  ) THEN
    ALTER TABLE "servicos" ADD COLUMN "descricao" text;
  END IF;
END $$;
`));
  await db.execute(sql.raw(`
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = current_schema()
      AND c.table_name = 'servicos' AND c.column_name = 'foto_url'
  ) THEN
    ALTER TABLE "servicos" ADD COLUMN "foto_url" text;
  END IF;
END $$;
`));
  await db.execute(sql.raw(`
DO $$ BEGIN
  CREATE TYPE "pedido_modo" AS ENUM ('producao', 'orcamento');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
`));
  await db.execute(sql.raw(`
DO $$ BEGIN
  CREATE TYPE "orcamento_status" AS ENUM ('rascunho', 'enviado', 'aceito', 'arquivado');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
`));
  await db.execute(sql.raw(`
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = current_schema()
      AND c.table_name = 'atendimentos_pedido' AND c.column_name = 'modo'
  ) THEN
    ALTER TABLE "atendimentos_pedido"
      ADD COLUMN "modo" "pedido_modo" NOT NULL DEFAULT 'producao';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = current_schema()
      AND c.table_name = 'atendimentos_pedido' AND c.column_name = 'orcamento_status'
  ) THEN
    ALTER TABLE "atendimentos_pedido" ADD COLUMN "orcamento_status" "orcamento_status";
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = current_schema()
      AND c.table_name = 'atendimentos_pedido' AND c.column_name = 'orcamento_enviado_em'
  ) THEN
    ALTER TABLE "atendimentos_pedido" ADD COLUMN "orcamento_enviado_em" timestamptz;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = current_schema()
      AND c.table_name = 'atendimentos_pedido' AND c.column_name = 'orcamento_convertido_em'
  ) THEN
    ALTER TABLE "atendimentos_pedido" ADD COLUMN "orcamento_convertido_em" timestamptz;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = current_schema()
      AND c.table_name = 'atendimentos_pedido' AND c.column_name = 'orcamento_convertido_de'
  ) THEN
    ALTER TABLE "atendimentos_pedido" ADD COLUMN "orcamento_convertido_de" text;
  END IF;
END $$;
`));
  await db.execute(sql.raw(`
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_type t
    WHERE t.typname = 'whatsapp_message_tipo'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'whatsapp_message_tipo'
      AND e.enumlabel = 'orcamento'
  ) THEN
    ALTER TYPE "whatsapp_message_tipo" ADD VALUE 'orcamento';
  END IF;
END $$;
`));
  await db.execute(sql.raw(`
INSERT INTO "whatsapp_templates" ("codigo", "nome", "corpo", "ativo", "ordem")
SELECT
  'orcamento',
  'Orçamento',
  'Olá {{cliente}}! Segue o orçamento #{{numero_comanda}} da {{empresa}}:' || E'\n\n' || '{{resumo}}' || E'\n\n' || 'Total: {{valor}}' || E'\n\n' || 'Qualquer dúvida, estamos à disposição.',
  true,
  50
WHERE NOT EXISTS (
  SELECT 1 FROM "whatsapp_templates" WHERE "codigo" = 'orcamento'
);
`));
  /** Catálogo Pacote Adesivo+Queratina (PROD pode ter tabelas vazias se só correu migrate sem seed). */
  await db.execute(sql.raw(`
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables t
    WHERE t.table_schema = current_schema() AND t.table_name = 'pacotes_queratina'
  ) AND NOT EXISTS (SELECT 1 FROM "pacotes_queratina" LIMIT 1) THEN
    INSERT INTO "pacotes_queratina" ("pacote", "preco_pacote") VALUES
      ('2 mechas', 'R$ 400,00'),
      ('5 mechas', 'R$ 500,00');
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.tables t
    WHERE t.table_schema = current_schema() AND t.table_name = 'regras_mega_queratina'
  ) AND NOT EXISTS (SELECT 1 FROM "regras_mega_queratina" LIMIT 1) THEN
    INSERT INTO "regras_mega_queratina" ("pacote", "etapa", "valor", "comissao", "duracao_minutos") VALUES
      ('2 mechas', 'Retirada', 'R$ 20,00', 'R$ 20,00', 30),
      ('2 mechas', 'Preparo', 'R$ 20,00', 'R$ 20,00', 30),
      ('2 mechas', 'Escova', 'R$ 25,00', 'R$ 25,00', 30),
      ('2 mechas', 'Colocação', 'R$ 35,00', 'R$ 35,00', 30),
      ('5 mechas', 'Retirada', 'R$ 30,00', 'R$ 30,00', 30),
      ('5 mechas', 'Preparo', 'R$ 30,00', 'R$ 30,00', 30),
      ('5 mechas', 'Escova', 'R$ 25,00', 'R$ 25,00', 30),
      ('5 mechas', 'Colocação', 'R$ 40,00', 'R$ 40,00', 30);
  END IF;
END $$;
`));
  /** Rótulo em `atendimentos.tipo` (enum do pivot permanece `pacote_queratina`). */
  await db.execute(sql.raw(`
UPDATE "atendimentos"
SET "tipo" = 'Pacote Adesivo+Queratina'
WHERE "tipo" = 'Pacote Queratina';
`));
  /** Desconto da comanda em `atendimentos_pedido` (separado do desconto por item). */
  await db.execute(sql.raw(`
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = current_schema()
      AND c.table_name = 'atendimentos_pedido' AND c.column_name = 'desconto_comanda'
  ) THEN
    ALTER TABLE "atendimentos_pedido" ADD COLUMN "desconto_comanda" text;
  END IF;
END $$;
`));
  /**
   * Contaminação pré-separação: desconto da comanda na descrição / coluna legado
   * de `atendimentos`. Nunca limpar `atendimento_itens.desconto` — é desconto por item.
   */
  await db.execute(sql.raw(`
UPDATE "atendimentos" a
SET
  "desconto" = '',
  "descricao" = trim(both ' —' from regexp_replace(
    regexp_replace(
      coalesce(a."descricao", ''),
      '\\s*—\\s*Desconto:\\s*R\\$\\s*[\\d.,]+',
      '',
      'i'
    ),
    'Desconto:\\s*R\\$\\s*[\\d.,]+',
    '',
    'i'
  ))
WHERE coalesce(a."descricao", '') ILIKE '%Desconto:%';
`));
  await db.execute(sql.raw(`
UPDATE "atendimentos" a
SET "desconto" = ''
FROM "atendimentos_pedido" p
WHERE a."id_atendimento" = p."id_atendimento"
  AND coalesce(trim(p."desconto_comanda"), '') <> ''
  AND coalesce(trim(a."desconto"), '') <> ''
  AND regexp_replace(coalesce(a."desconto", ''), '[^\\d,]', '', 'g')
    = regexp_replace(p."desconto_comanda", '[^\\d,]', '', 'g');
`));
}
