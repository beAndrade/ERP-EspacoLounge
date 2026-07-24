-- Catálogo fixo Pacote Queratina (não vem do XLSX; só era preenchido no seed local).

INSERT INTO "pacotes_queratina" ("pacote", "preco_pacote")
SELECT v.pacote, v.preco
FROM (VALUES
  ('2 mechas', 'R$ 400,00'),
  ('5 mechas', 'R$ 500,00')
) AS v(pacote, preco)
WHERE NOT EXISTS (SELECT 1 FROM "pacotes_queratina" LIMIT 1);

INSERT INTO "regras_mega_queratina" ("pacote", "etapa", "valor", "comissao", "duracao_minutos")
SELECT v.pacote, v.etapa, v.valor, v.comissao, v.duracao
FROM (VALUES
  ('2 mechas', 'Retirada', 'R$ 20,00', 'R$ 20,00', 30),
  ('2 mechas', 'Preparo', 'R$ 20,00', 'R$ 20,00', 30),
  ('2 mechas', 'Escova', 'R$ 25,00', 'R$ 25,00', 30),
  ('2 mechas', 'Colocação', 'R$ 35,00', 'R$ 35,00', 30),
  ('5 mechas', 'Retirada', 'R$ 30,00', 'R$ 30,00', 30),
  ('5 mechas', 'Preparo', 'R$ 30,00', 'R$ 30,00', 30),
  ('5 mechas', 'Escova', 'R$ 25,00', 'R$ 25,00', 30),
  ('5 mechas', 'Colocação', 'R$ 40,00', 'R$ 40,00', 30)
) AS v(pacote, etapa, valor, comissao, duracao)
WHERE NOT EXISTS (SELECT 1 FROM "regras_mega_queratina" LIMIT 1);
