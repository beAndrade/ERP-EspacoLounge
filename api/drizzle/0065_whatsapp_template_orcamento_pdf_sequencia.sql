-- Template WhatsApp «orcamento»: avisa que o PDF vai na mensagem seguinte.
UPDATE "whatsapp_templates"
SET
  "corpo" = 'Olá {{cliente}}! Segue o orçamento #{{numero_comanda}} do {{empresa}}. Envio o PDF na sequência — qualquer dúvida, estamos à disposição.'
WHERE "codigo" = 'orcamento';
