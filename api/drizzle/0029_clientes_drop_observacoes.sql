ALTER TABLE "clientes" ADD COLUMN IF NOT EXISTS "foto_url" text;
--> statement-breakpoint
ALTER TABLE "clientes" ADD COLUMN IF NOT EXISTS "notificacoes_ativo" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE "clientes" ADD COLUMN IF NOT EXISTS "desconto_padrao_texto" text;
--> statement-breakpoint
ALTER TABLE "clientes" ADD COLUMN IF NOT EXISTS "desconto_padrao_modo" text;
--> statement-breakpoint
UPDATE "clientes" c SET
  "apelido" = COALESCE(NULLIF(TRIM(c."apelido"), ''), NULLIF(TRIM(src.o->>'apelido'), '')),
  "email" = COALESCE(NULLIF(TRIM(c."email"), ''), NULLIF(TRIM(src.o->>'email'), '')),
  "celular" = COALESCE(NULLIF(TRIM(c."celular"), ''), NULLIF(TRIM(src.o->>'celular'), '')),
  "telefone_fixo" = COALESCE(NULLIF(TRIM(c."telefone_fixo"), ''), NULLIF(TRIM(src.o->>'telefoneFixo'), '')),
  "aniversario" = COALESCE(NULLIF(TRIM(c."aniversario"), ''), NULLIF(TRIM(src.o->>'aniversario'), '')),
  "cnpj" = COALESCE(NULLIF(TRIM(c."cnpj"), ''), NULLIF(TRIM(src.o->>'cnpj'), '')),
  "cpf" = COALESCE(NULLIF(TRIM(c."cpf"), ''), NULLIF(TRIM(src.o->>'cpf'), '')),
  "rg" = COALESCE(NULLIF(TRIM(c."rg"), ''), NULLIF(TRIM(src.o->>'rg'), '')),
  "foto_url" = COALESCE(NULLIF(TRIM(c."foto_url"), ''), NULLIF(TRIM(src.o->>'fotoUrl'), '')),
  "desconto_padrao_texto" = COALESCE(NULLIF(TRIM(c."desconto_padrao_texto"), ''), NULLIF(TRIM(src.o->>'descontoPadraoTexto'), '')),
  "desconto_padrao_modo" = COALESCE(NULLIF(TRIM(c."desconto_padrao_modo"), ''), NULLIF(TRIM(src.o->>'descontoPadraoModo'), '')),
  "notificacoes_ativo" = COALESCE(
    CASE
      WHEN jsonb_typeof(src.o->'notificacoesAtivo') = 'boolean' THEN (src.o->'notificacoesAtivo')::boolean
      WHEN src.o->>'notificacoesAtivo' = 'true' THEN true
      WHEN src.o->>'notificacoesAtivo' = 'false' THEN false
      ELSE NULL
    END,
    c."notificacoes_ativo"
  )
FROM (
  SELECT "id_cliente", "observacoes"::jsonb AS o
  FROM "clientes"
  WHERE "observacoes" IS NOT NULL
    AND TRIM("observacoes") LIKE '{%'
    AND ("observacoes"::jsonb->>'_elCli') IN ('1', '1.0')
) src
WHERE c."id_cliente" = src."id_cliente";
--> statement-breakpoint
ALTER TABLE "clientes" DROP COLUMN IF EXISTS "observacoes";
