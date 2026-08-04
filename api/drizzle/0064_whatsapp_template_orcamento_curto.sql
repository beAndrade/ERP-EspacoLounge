-- Template WhatsApp «orcamento»: mensagem curta (PDF anexado na mensagem seguinte).
UPDATE "whatsapp_templates"
SET
  "corpo" = 'Olá {{cliente}}! Segue o orçamento #{{numero_comanda}} do {{empresa}}. Qualquer dúvida, estamos à disposição.'
WHERE "codigo" = 'orcamento'
  AND (
    "corpo" LIKE '%{{resumo}}%'
    OR "corpo" LIKE '%da {{empresa}}%'
  );
