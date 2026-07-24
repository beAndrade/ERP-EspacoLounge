-- Limpa contaminação: desconto da comanda ecoado em atendimentos / pivot.

-- 1) Sufixo «Desconto: R$ …» na descrição + coluna desconto da linha.
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
WHERE coalesce(a."descricao", '') ILIKE '%Desconto:%';

-- 2) Eco do valor de desconto_comanda em atendimentos.desconto (todas as linhas).
UPDATE "atendimentos" a
SET "desconto" = ''
FROM "atendimentos_pedido" p
WHERE a."id_atendimento" = p."id_atendimento"
  AND coalesce(trim(p."desconto_comanda"), '') <> ''
  AND coalesce(trim(a."desconto"), '') <> ''
  AND regexp_replace(coalesce(a."desconto", ''), '[^\d,]', '', 'g')
    = regexp_replace(p."desconto_comanda", '[^\d,]', '', 'g');

-- 3) Eco do valor de desconto_comanda na pivot (origem do «Desc.» no item).
UPDATE "atendimento_itens" i
SET "desconto" = NULL
FROM "atendimentos_pedido" p
WHERE i."id_atendimento" = p."id_atendimento"
  AND coalesce(trim(p."desconto_comanda"), '') <> ''
  AND i."desconto" IS NOT NULL
  AND round(i."desconto"::numeric, 2) = round(
    replace(regexp_replace(p."desconto_comanda", '[^\d,]', '', 'g'), ',', '.')::numeric,
    2
  );
