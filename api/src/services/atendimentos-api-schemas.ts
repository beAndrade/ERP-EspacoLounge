import { t } from 'elysia';

/**
 * Corpo de `POST /api/atendimentos` (criação, finalizar, confirmar pagamento, excluir).
 * Campos extra são permitidos para compatibilidade com o cliente Angular e payloads legados.
 */
export const postAtendimentoMutationBody = t.Object(
  {
    acao: t.Optional(t.String()),
    id_atendimento: t.Optional(t.String()),
    idAtendimento: t.Optional(t.String()),
    tipo: t.Optional(t.String()),
    cliente_id: t.Optional(t.String()),
    data: t.Optional(t.String()),
    profissional_id: t.Optional(t.Union([t.Number(), t.Null()])),
    profissional: t.Optional(t.String()),
    servico_id: t.Optional(t.String()),
    tamanho: t.Optional(t.String()),
    observacao: t.Optional(t.String()),
    itens_servicos: t.Optional(t.Array(t.Any())),
    itens_produtos: t.Optional(t.Array(t.Any())),
    desconto: t.Optional(t.String()),
    metodo: t.Optional(t.String()),
    pacote: t.Optional(t.String()),
    etapas: t.Optional(t.Array(t.Any())),
    produto: t.Optional(t.String()),
    quantidade: t.Optional(t.Number()),
    valor: t.Optional(t.Number()),
    detalhes_cabelo: t.Optional(t.String()),
    inicio: t.Optional(t.String()),
    fim: t.Optional(t.String()),
  },
  { additionalProperties: true },
);
