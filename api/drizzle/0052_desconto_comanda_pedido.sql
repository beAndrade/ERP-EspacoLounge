-- Desconto da comanda (resumo) ≠ desconto por item em atendimentos/pivot.

ALTER TABLE "atendimentos_pedido" ADD COLUMN IF NOT EXISTS "desconto_comanda" text;

-- Migra valor contaminado: desconto da comanda gravado na 1.ª linha + sufixo na descrição.
UPDATE "atendimentos_pedido" p
SET "desconto_comanda" = sub.desconto
FROM (
  SELECT DISTINCT ON ("id_atendimento")
    "id_atendimento",
    "desconto"
  FROM "atendimentos"
  WHERE coalesce(trim("desconto"), '') <> ''
    AND coalesce("descricao", '') ILIKE '%Desconto:%'
  ORDER BY "id_atendimento", "id"
) sub
WHERE p."id_atendimento" = sub."id_atendimento"
  AND coalesce(trim(p."desconto_comanda"), '') = '';

UPDATE "atendimentos" a
SET
  "desconto" = '',
  "descricao" = trim(both ' —' from regexp_replace(
    regexp_replace(
      coalesce(a."descricao", ''),
      '\s*—\s*Desconto:\s*R\$\s*[\d.,]+',
      '',
      'i'
    ),
    'Desconto:\s*R\$\s*[\d.,]+',
    '',
    'i'
  ))
WHERE a."id" IN (
  SELECT DISTINCT ON ("id_atendimento") "id"
  FROM "atendimentos"
  ORDER BY "id_atendimento", "id"
)
AND coalesce(a."descricao", '') ILIKE '%Desconto:%'
AND coalesce(trim(a."desconto"), '') <> '';
