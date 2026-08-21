-- Durações de etapas Mega «1 mecha»: 60 min (altura dos cards / encadeamento).
UPDATE regras_mega
SET duracao_minutos = 60
WHERE trim(pacote) = '1 mecha';
