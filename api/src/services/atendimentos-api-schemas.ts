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
    profissional_origem_id: t.Optional(t.Number()),
    profissional_destino_id: t.Optional(t.Number()),
    hora_inicio: t.Optional(t.String()),
    id_recorrencia: t.Optional(t.String()),
    ordem_recorrencia: t.Optional(t.Number()),
    /** Override do valor unitário (R$) — cabeça do pedido (single item). */
    valor_unitario: t.Optional(
      t.Union([t.Number(), t.String(), t.Null()]),
    ),
    /** Desconto aplicado no item — cabeça do pedido (single item). */
    desconto_item: t.Optional(
      t.Union([t.Number(), t.String(), t.Null()]),
    ),
    /** Preço unitário (legado, Produto). */
    preco_unitario: t.Optional(
      t.Union([t.Number(), t.String(), t.Null()]),
    ),
    /**
     * Só com `acao: excluir`: apaga linhas mas mantém `atendimentos_pedido`
     * (preserva `numero_comanda` antes de recriar o mesmo `id_atendimento`).
     * @deprecated Preferir `modo_exclusao`.
     */
    manter_cabecalho_pedido: t.Optional(t.Boolean()),
    /** `somente_comanda` | `completo` (exclusão da comanda na receção). */
    modo_exclusao: t.Optional(
      t.Union([t.Literal('somente_comanda'), t.Literal('completo')]),
    ),
  },
  { additionalProperties: true },
);
