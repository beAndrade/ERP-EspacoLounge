---
name: API adaptação relacionamentos BD
overview: Alterações na API Elysia e no domínio exposto ao cliente para suportar profissionais, pivot `atendimento_itens`, `servicos.id` e exclusão coerente — com opção de compatibilidade com payloads legados.
todos:
  - id: api-profissionais-servicos-catalog
    content: "Ajustar `listProfissionaisApi` e `listServicosForApi` (queries + resposta); mensagens de erro no domínio (Folha → profissionais)."
    status: completed
  - id: api-post-atendimentos-payload
    content: "Evoluir `CreateAtendimentoPayload` e `createAtendimento`: arrays de itens com `quantidade`; inserção na pivot; manter ou deprecar campos únicos."
    status: completed
  - id: api-get-atendimentos-resposta
    content: "`listAtendimentosRaw` (ou camada fina): incluir `itens` agregados por `id_atendimento` ou por linha conforme contrato acordado."
    status: completed
  - id: api-index-validacao
    content: "`index.ts`: substituir `body as never` por tipos Elysia (`t`) alinhados ao novo corpo; documentar query/body em comentário curto."
    status: completed
  - id: api-excluir-cascata
    content: "`excluirAtendimentoPorIdAtendimento`: apagar também `atendimento_itens` do mesmo `id_atendimento` (transação)."
    status: completed
  - id: api-finance-compat
    content: "Rever `finance-domain` / `slugCategoriaReceitaPredominante` se passarem a usar itens da pivot para tipo predominante (só se necessário)."
    status: completed
isProject: true
---

# Plano: API para adaptar à nova lógica do banco

Este documento complementa o plano de modelo relacional (profissionais, folha, `servicos.id`, `atendimento_itens`). Foca na **camada HTTP** ([`api/src/index.ts`](c:\Users\BernardoAndrade\Documents\Code\EspacoLounge\api\src\index.ts)), **consultas** ([`api/src/services/queries.ts`](c:\Users\BernardoAndrade\Documents\Code\EspacoLounge\api\src\services\queries.ts)) e **domínio** ([`api/src/services/atendimentos-domain.ts`](c:\Users\BernardoAndrade\Documents\Code\EspacoLounge\api\src\services\atendimentos-domain.ts)).

## Endpoints hoje e impacto

| Método / rota | Comportamento atual | Mudança prevista |
|----------------|---------------------|------------------|
| `GET /api/profissionais` | `listProfissionaisApi` — IDs vindos de `folha` | Passar a listar **`profissionais`** (`id`, `nome`). O JSON pode manter `{ items: [{ id, nome }] }` para o Angular continuar a consumir com mudança só de **significado do `id`**. |
| `GET /api/servicos` | `id` stringificado a partir de `servicos.linha` | `id` a partir de **`servicos.id`** (mesmo valor numérico; só muda o nome da coluna no BD). |
| `POST /api/atendimentos` | Corpo livre → `createAtendimento(db, body as never)` | Tipagem Elysia + payload alinhado à pivot: **vários** serviços/produtos com **`quantidade`**; validação explícita. |
| `GET /api/atendimentos` | `listAtendimentosRaw` — uma linha por registo em `atendimentos` | Incluir **`itens`** (catálogo do pedido) por `id_atendimento`, obtidos de **`atendimento_itens`** (join/subquery ou segunda passagem em memória). Definir se `itens` vêm **só no primeiro** registo do grupo ou **repetidos** (recomendação: **uma vez por grupo** ou campo `itens` apenas num objeto agregado — ver secção contrato). |
| `POST ... acao=excluir` | Apaga linhas `atendimentos` | **Transação:** apagar também **`atendimento_itens`** com o mesmo `id_atendimento`. |
| `POST ... finalizar` / confirmar pagamento | Só tocam `atendimentos` | Sem alteração de contrato na superfície; internamente podem continuar a usar linhas `atendimentos` até a cobrança ler a pivot. |

Rotas **sem** mudança de path: `/api/clientes`, `/api/regras-mega`, `/api/pacotes`, `/api/produtos`, `/api/cabelos`, financeiro, etc., salvo ajustes pontuais de texto ou tipos partilhados.

## Contrato `POST /api/atendimentos` (criação)

**Objetivo:** refletir N serviços e N produtos com quantidade, alinhado a `atendimento_itens`.

- **Opção A — Evolutiva (recomendada para não partir o app de uma vez):** manter tipos existentes (`Serviço` com um `servico_id`, `Produto` com `produto` + `quantidade`) e, em paralelo, aceitar:
  - `itens_servicos?: { servico_id: number \| string; quantidade: number; profissional_id?: number \| null; tamanho?: string }[]`
  - `itens_produtos?: { produto_id: number; quantidade: number; profissional_id?: number \| null }[]`  
  Quando `itens_*` estiver presente, o domínio grava a **pivot**; quando só o formato antigo, converte internamente num único item na pivot.

- **Opção B — Ruptura:** só aceitar arrays na pivot; atualizar Angular e qualquer cliente num único passo.

O domínio deve:

1. Resolver `profissional_id` contra **`profissionais`** (não `folha`).
2. Inserir linhas em **`atendimento_itens`** dentro da mesma transação que as linhas de **`atendimentos`** (se mantiver escrita dupla na fase 1).
3. Garantir `id_atendimento` coerente (gerado como hoje com `makeIdAtendimento`).

## Contrato `GET /api/atendimentos`

- **Mínimo:** cada item da lista continua com as chaves atuais (`ID Atendimento`, `Profissional`, `profissional_id`, etc.) para não quebrar [`sheets-api.service`](c:\Users\BernardoAndrade\Documents\Code\EspacoLounge\src\app\core\services\sheets-api.service.ts) e componentes.
- **Extensão:** adicionar chave **`itens`** (array) com objetos `{ tipo: 'servico' \| 'produto', servico_id?, produto_id?, quantidade, profissional_id?, tamanho? }` **por grupo** `id_atendimento`:
  - Implementação simples: após carregar `atendimentos`, carregar todos os `atendimento_itens` do intervalo de IDs e fazer `Map<id_atendimento, itens[]>`, depois anexar só na **primeira** linha de cada grupo ou em **todas** (documentar a escolha; primeira linha evita inflar payload).

## Validação na rota (`index.ts`)

- Trocar `createAtendimento(db, body as never)` por **schemas Elysia** (`t.Union`, `t.Object`, `t.Optional`) ou validação manual centralizada num módulo `atendimentos-api-schemas.ts` importado pela rota.
- Mensagens de validação em **PT-BR**, alinhadas às regras do domínio (quantidade inteira > 0, FKs existentes).

## Funções de domínio a estender

- **`createAtendimento` / `appendAtendimentoLinha`:** escrita na pivot + eventualmente linhas legado.
- **`listAtendimentosRaw`:** enriquecimento com itens (ou nova função `listAtendimentosComItensApi` chamada pela rota para manter `listAtendimentosRaw` “puro” para usos internos).
- **`excluirAtendimentoPorIdAtendimento`:** `DELETE` em `atendimento_itens` WHERE `id_atendimento = $1` antes ou junto com `atendimentos`.
- **`resolveProfissionalIdToInt` / asserts:** fonte **`profissionais`**; textos de erro atualizados (“não existe na Folha” → “não existe em profissionais” ou similar).

## Financeiro

- [`finance-domain.ts`](c:\Users\BernardoAndrade\Documents\Code\EspacoLounge\api\src\services\finance-domain.ts) usa tipos nas linhas `atendimentos` para slug de categoria. Só alterar se, após introduzir a pivot, a **fonte do “tipo predominante”** deixar de ser fiável nas linhas duplicadas; caso contrário **sem mudança** na API de confirmação.

## Dependências e ordem de trabalho

1. Migrações + `schema.ts` Drizzle (plano de BD).
2. Domínio + queries (este plano).
3. Angular / `api.models.ts` (consumo de `itens` e payloads com arrays).

## Referência cruzada

- Plano de dados: `relacionamentos_bd_atendimentos_00ea6e3d.plan.md` (na pasta de planos do Cursor do utilizador, se aplicável).
