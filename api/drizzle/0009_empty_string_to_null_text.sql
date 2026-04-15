-- Normaliza cadeias vazias para NULL em colunas de texto opcionais (dados legados / import).
UPDATE "atendimentos" SET "nome_cliente" = NULL WHERE "nome_cliente" = '';
UPDATE "atendimentos" SET "tipo" = NULL WHERE "tipo" = '';
UPDATE "atendimentos" SET "pacote" = NULL WHERE "pacote" = '';
UPDATE "atendimentos" SET "etapa" = NULL WHERE "etapa" = '';
UPDATE "atendimentos" SET "produto" = NULL WHERE "produto" = '';
UPDATE "atendimentos" SET "servicos" = NULL WHERE "servicos" = '';
UPDATE "atendimentos" SET "tamanho" = NULL WHERE "tamanho" = '';
UPDATE "atendimentos" SET "valor" = NULL WHERE "valor" = '';
UPDATE "atendimentos" SET "valor_manual" = NULL WHERE "valor_manual" = '';
UPDATE "atendimentos" SET "comissao" = NULL WHERE "comissao" = '';
UPDATE "atendimentos" SET "desconto" = NULL WHERE "desconto" = '';
UPDATE "atendimentos" SET "descricao" = NULL WHERE "descricao" = '';
UPDATE "atendimentos" SET "descricao_manual" = NULL WHERE "descricao_manual" = '';
UPDATE "atendimentos" SET "custo" = NULL WHERE "custo" = '';
UPDATE "atendimentos" SET "lucro" = NULL WHERE "lucro" = '';
UPDATE "atendimentos" SET "cobranca_status" = NULL WHERE "cobranca_status" = '';
UPDATE "atendimentos" SET "pagamento_status" = NULL WHERE "pagamento_status" = '';
UPDATE "atendimentos" SET "pagamento_metodo" = NULL WHERE "pagamento_metodo" = '';

UPDATE "atendimento_itens" SET "tamanho" = NULL WHERE "tamanho" = '';

UPDATE "clientes" SET "telefone" = NULL WHERE "telefone" = '';
UPDATE "clientes" SET "observacoes" = NULL WHERE "observacoes" = '';
