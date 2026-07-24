-- Renomeia o rótulo gravado em atendimentos.tipo (enum pivot permanece pacote_queratina).

UPDATE "atendimentos"
SET "tipo" = 'Pacote Adesivo+Queratina'
WHERE "tipo" = 'Pacote Queratina';
