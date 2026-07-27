-- Padroniza textos de moeda (R$ X.XXX,XX) e percentual (N%) no catálogo.
-- Idempotente: pode reaplicar sem estragar valores já canónicos.

-- ---------------------------------------------------------------------------
-- Percentual: servicos.comissao_pct / produtos.comissao_padrao → "40%"
-- ---------------------------------------------------------------------------
UPDATE "servicos"
SET "comissao_pct" = (
  regexp_replace(
    regexp_replace(trim("comissao_pct"), '\s*%\s*', '', 'g'),
    '\s+',
    '',
    'g'
  ) || '%'
)
WHERE "comissao_pct" IS NOT NULL
  AND trim("comissao_pct") <> ''
  AND regexp_replace(
    regexp_replace(trim("comissao_pct"), '\s*%\s*', '', 'g'),
    '\s+',
    '',
    'g'
  ) ~ '^[0-9]+([.,][0-9]+)?$';

UPDATE "produtos"
SET "comissao_padrao" = (
  regexp_replace(
    regexp_replace(trim("comissao_padrao"), '\s*%\s*', '', 'g'),
    '\s+',
    '',
    'g'
  ) || '%'
)
WHERE "comissao_padrao" IS NOT NULL
  AND trim("comissao_padrao") <> ''
  AND regexp_replace(
    regexp_replace(trim("comissao_padrao"), '\s*%\s*', '', 'g'),
    '\s+',
    '',
    'g'
  ) ~ '^[0-9]+([.,][0-9]+)?$';

-- ---------------------------------------------------------------------------
-- Moeda: zera "R$ 0,00" / "0.00" → NULL (igual à gravação atual da API)
-- ---------------------------------------------------------------------------
UPDATE "servicos" SET "valor_base" = NULL
WHERE "valor_base" IS NOT NULL
  AND trim("valor_base") ~* '^(R\$\s*)?0([.,]0+)?$';
UPDATE "servicos" SET "comissao_fixa" = NULL
WHERE "comissao_fixa" IS NOT NULL
  AND trim("comissao_fixa") ~* '^(R\$\s*)?0([.,]0+)?$';
UPDATE "servicos" SET "custo_fixo" = NULL
WHERE "custo_fixo" IS NOT NULL
  AND trim("custo_fixo") ~* '^(R\$\s*)?0([.,]0+)?$';
UPDATE "servicos" SET "preco_curto" = NULL
WHERE "preco_curto" IS NOT NULL
  AND trim("preco_curto") ~* '^(R\$\s*)?0([.,]0+)?$';
UPDATE "servicos" SET "preco_medio" = NULL
WHERE "preco_medio" IS NOT NULL
  AND trim("preco_medio") ~* '^(R\$\s*)?0([.,]0+)?$';
UPDATE "servicos" SET "preco_medio_longo" = NULL
WHERE "preco_medio_longo" IS NOT NULL
  AND trim("preco_medio_longo") ~* '^(R\$\s*)?0([.,]0+)?$';
UPDATE "servicos" SET "preco_longo" = NULL
WHERE "preco_longo" IS NOT NULL
  AND trim("preco_longo") ~* '^(R\$\s*)?0([.,]0+)?$';
UPDATE "servicos" SET "curto" = NULL
WHERE "curto" IS NOT NULL
  AND trim("curto") ~* '^(R\$\s*)?0([.,]0+)?$';
UPDATE "servicos" SET "medio" = NULL
WHERE "medio" IS NOT NULL
  AND trim("medio") ~* '^(R\$\s*)?0([.,]0+)?$';
UPDATE "servicos" SET "m_l" = NULL
WHERE "m_l" IS NOT NULL
  AND trim("m_l") ~* '^(R\$\s*)?0([.,]0+)?$';
UPDATE "servicos" SET "longo" = NULL
WHERE "longo" IS NOT NULL
  AND trim("longo") ~* '^(R\$\s*)?0([.,]0+)?$';

UPDATE "produtos" SET "preco" = NULL
WHERE "preco" IS NOT NULL
  AND trim("preco") ~* '^(R\$\s*)?0([.,]0+)?$';
UPDATE "produtos" SET "custo" = NULL
WHERE "custo" IS NOT NULL
  AND trim("custo") ~* '^(R\$\s*)?0([.,]0+)?$';
UPDATE "produtos" SET "preco_profissional" = NULL
WHERE "preco_profissional" IS NOT NULL
  AND trim("preco_profissional") ~* '^(R\$\s*)?0([.,]0+)?$';
UPDATE "produtos" SET "custo_adicional" = NULL
WHERE "custo_adicional" IS NOT NULL
  AND trim("custo_adicional") ~* '^(R\$\s*)?0([.,]0+)?$';

-- ---------------------------------------------------------------------------
-- Moeda: "R$ 35.00" (ponto decimal US, sem milhar) → "R$ 35,00"
-- ---------------------------------------------------------------------------
UPDATE "servicos" SET "valor_base" = regexp_replace(trim("valor_base"), '^R\$\s*([0-9]+)\.([0-9]{2})$', 'R$ \1,\2')
WHERE "valor_base" ~ '^R\$\s*[0-9]+\.[0-9]{2}$';
UPDATE "servicos" SET "comissao_fixa" = regexp_replace(trim("comissao_fixa"), '^R\$\s*([0-9]+)\.([0-9]{2})$', 'R$ \1,\2')
WHERE "comissao_fixa" ~ '^R\$\s*[0-9]+\.[0-9]{2}$';
UPDATE "servicos" SET "custo_fixo" = regexp_replace(trim("custo_fixo"), '^R\$\s*([0-9]+)\.([0-9]{2})$', 'R$ \1,\2')
WHERE "custo_fixo" ~ '^R\$\s*[0-9]+\.[0-9]{2}$';
UPDATE "servicos" SET "preco_curto" = regexp_replace(trim("preco_curto"), '^R\$\s*([0-9]+)\.([0-9]{2})$', 'R$ \1,\2')
WHERE "preco_curto" ~ '^R\$\s*[0-9]+\.[0-9]{2}$';
UPDATE "servicos" SET "preco_medio" = regexp_replace(trim("preco_medio"), '^R\$\s*([0-9]+)\.([0-9]{2})$', 'R$ \1,\2')
WHERE "preco_medio" ~ '^R\$\s*[0-9]+\.[0-9]{2}$';
UPDATE "servicos" SET "preco_medio_longo" = regexp_replace(trim("preco_medio_longo"), '^R\$\s*([0-9]+)\.([0-9]{2})$', 'R$ \1,\2')
WHERE "preco_medio_longo" ~ '^R\$\s*[0-9]+\.[0-9]{2}$';
UPDATE "servicos" SET "preco_longo" = regexp_replace(trim("preco_longo"), '^R\$\s*([0-9]+)\.([0-9]{2})$', 'R$ \1,\2')
WHERE "preco_longo" ~ '^R\$\s*[0-9]+\.[0-9]{2}$';
UPDATE "servicos" SET "curto" = regexp_replace(trim("curto"), '^R\$\s*([0-9]+)\.([0-9]{2})$', 'R$ \1,\2')
WHERE "curto" ~ '^R\$\s*[0-9]+\.[0-9]{2}$';
UPDATE "servicos" SET "medio" = regexp_replace(trim("medio"), '^R\$\s*([0-9]+)\.([0-9]{2})$', 'R$ \1,\2')
WHERE "medio" ~ '^R\$\s*[0-9]+\.[0-9]{2}$';
UPDATE "servicos" SET "m_l" = regexp_replace(trim("m_l"), '^R\$\s*([0-9]+)\.([0-9]{2})$', 'R$ \1,\2')
WHERE "m_l" ~ '^R\$\s*[0-9]+\.[0-9]{2}$';
UPDATE "servicos" SET "longo" = regexp_replace(trim("longo"), '^R\$\s*([0-9]+)\.([0-9]{2})$', 'R$ \1,\2')
WHERE "longo" ~ '^R\$\s*[0-9]+\.[0-9]{2}$';

UPDATE "produtos" SET "preco" = regexp_replace(trim("preco"), '^R\$\s*([0-9]+)\.([0-9]{2})$', 'R$ \1,\2')
WHERE "preco" ~ '^R\$\s*[0-9]+\.[0-9]{2}$';
UPDATE "produtos" SET "custo" = regexp_replace(trim("custo"), '^R\$\s*([0-9]+)\.([0-9]{2})$', 'R$ \1,\2')
WHERE "custo" ~ '^R\$\s*[0-9]+\.[0-9]{2}$';
UPDATE "produtos" SET "preco_profissional" = regexp_replace(trim("preco_profissional"), '^R\$\s*([0-9]+)\.([0-9]{2})$', 'R$ \1,\2')
WHERE "preco_profissional" ~ '^R\$\s*[0-9]+\.[0-9]{2}$';
UPDATE "produtos" SET "custo_adicional" = regexp_replace(trim("custo_adicional"), '^R\$\s*([0-9]+)\.([0-9]{2})$', 'R$ \1,\2')
WHERE "custo_adicional" ~ '^R\$\s*[0-9]+\.[0-9]{2}$';

-- ---------------------------------------------------------------------------
-- Moeda: número puro sem R$ → "R$ …" (vírgula decimal se era ponto US)
-- ---------------------------------------------------------------------------
UPDATE "servicos" SET "valor_base" = 'R$ ' || replace(trim("valor_base"), '.', ',')
WHERE "valor_base" ~ '^[0-9]+\.[0-9]{2}$';
UPDATE "servicos" SET "valor_base" = 'R$ ' || trim("valor_base")
WHERE "valor_base" ~ '^[0-9]+,[0-9]{2}$';
UPDATE "servicos" SET "comissao_fixa" = 'R$ ' || replace(trim("comissao_fixa"), '.', ',')
WHERE "comissao_fixa" ~ '^[0-9]+\.[0-9]{2}$';
UPDATE "servicos" SET "comissao_fixa" = 'R$ ' || trim("comissao_fixa")
WHERE "comissao_fixa" ~ '^[0-9]+,[0-9]{2}$';
UPDATE "servicos" SET "custo_fixo" = 'R$ ' || replace(trim("custo_fixo"), '.', ',')
WHERE "custo_fixo" ~ '^[0-9]+\.[0-9]{2}$';
UPDATE "servicos" SET "custo_fixo" = 'R$ ' || trim("custo_fixo")
WHERE "custo_fixo" ~ '^[0-9]+,[0-9]{2}$';
UPDATE "servicos" SET "preco_curto" = 'R$ ' || replace(trim("preco_curto"), '.', ',')
WHERE "preco_curto" ~ '^[0-9]+\.[0-9]{2}$';
UPDATE "servicos" SET "preco_curto" = 'R$ ' || trim("preco_curto")
WHERE "preco_curto" ~ '^[0-9]+,[0-9]{2}$';
UPDATE "servicos" SET "preco_medio" = 'R$ ' || replace(trim("preco_medio"), '.', ',')
WHERE "preco_medio" ~ '^[0-9]+\.[0-9]{2}$';
UPDATE "servicos" SET "preco_medio" = 'R$ ' || trim("preco_medio")
WHERE "preco_medio" ~ '^[0-9]+,[0-9]{2}$';
UPDATE "servicos" SET "preco_medio_longo" = 'R$ ' || replace(trim("preco_medio_longo"), '.', ',')
WHERE "preco_medio_longo" ~ '^[0-9]+\.[0-9]{2}$';
UPDATE "servicos" SET "preco_medio_longo" = 'R$ ' || trim("preco_medio_longo")
WHERE "preco_medio_longo" ~ '^[0-9]+,[0-9]{2}$';
UPDATE "servicos" SET "preco_longo" = 'R$ ' || replace(trim("preco_longo"), '.', ',')
WHERE "preco_longo" ~ '^[0-9]+\.[0-9]{2}$';
UPDATE "servicos" SET "preco_longo" = 'R$ ' || trim("preco_longo")
WHERE "preco_longo" ~ '^[0-9]+,[0-9]{2}$';
UPDATE "servicos" SET "curto" = 'R$ ' || replace(trim("curto"), '.', ',')
WHERE "curto" ~ '^[0-9]+\.[0-9]{2}$';
UPDATE "servicos" SET "curto" = 'R$ ' || trim("curto")
WHERE "curto" ~ '^[0-9]+,[0-9]{2}$';
UPDATE "servicos" SET "medio" = 'R$ ' || replace(trim("medio"), '.', ',')
WHERE "medio" ~ '^[0-9]+\.[0-9]{2}$';
UPDATE "servicos" SET "medio" = 'R$ ' || trim("medio")
WHERE "medio" ~ '^[0-9]+,[0-9]{2}$';
UPDATE "servicos" SET "m_l" = 'R$ ' || replace(trim("m_l"), '.', ',')
WHERE "m_l" ~ '^[0-9]+\.[0-9]{2}$';
UPDATE "servicos" SET "m_l" = 'R$ ' || trim("m_l")
WHERE "m_l" ~ '^[0-9]+,[0-9]{2}$';
UPDATE "servicos" SET "longo" = 'R$ ' || replace(trim("longo"), '.', ',')
WHERE "longo" ~ '^[0-9]+\.[0-9]{2}$';
UPDATE "servicos" SET "longo" = 'R$ ' || trim("longo")
WHERE "longo" ~ '^[0-9]+,[0-9]{2}$';

UPDATE "produtos" SET "preco" = 'R$ ' || replace(trim("preco"), '.', ',')
WHERE "preco" ~ '^[0-9]+\.[0-9]{2}$';
UPDATE "produtos" SET "preco" = 'R$ ' || trim("preco")
WHERE "preco" ~ '^[0-9]+,[0-9]{2}$';
UPDATE "produtos" SET "custo" = 'R$ ' || replace(trim("custo"), '.', ',')
WHERE "custo" ~ '^[0-9]+\.[0-9]{2}$';
UPDATE "produtos" SET "custo" = 'R$ ' || trim("custo")
WHERE "custo" ~ '^[0-9]+,[0-9]{2}$';
UPDATE "produtos" SET "preco_profissional" = 'R$ ' || replace(trim("preco_profissional"), '.', ',')
WHERE "preco_profissional" ~ '^[0-9]+\.[0-9]{2}$';
UPDATE "produtos" SET "preco_profissional" = 'R$ ' || trim("preco_profissional")
WHERE "preco_profissional" ~ '^[0-9]+,[0-9]{2}$';
UPDATE "produtos" SET "custo_adicional" = 'R$ ' || replace(trim("custo_adicional"), '.', ',')
WHERE "custo_adicional" ~ '^[0-9]+\.[0-9]{2}$';
UPDATE "produtos" SET "custo_adicional" = 'R$ ' || trim("custo_adicional")
WHERE "custo_adicional" ~ '^[0-9]+,[0-9]{2}$';
