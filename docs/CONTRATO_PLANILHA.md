# Contrato da planilha — ERP Espaço Lounge

Documento alinhado à exportação `**ERP Espaço Lounge.xlsx**` (estrutura real de abas e cabeçalhos da **linha 1**).  
Nomes de abas e colunas devem coincidir **exatamente** com o Google Sheets (incluindo acentos: **Serviços**, **Observações**, etc.).

## Visão geral das abas


| Aba                     | Papel                           | Uso no app / API (MVP)                                     |
| ----------------------- | ------------------------------- | ---------------------------------------------------------- |
| **Atendimentos**        | Transacional                    | Lista filtrada por data; inclusão de novo atendimento      |
| **Clientes**            | Cadastro                        | Lista, busca, novo cliente                                 |
| **Serviços**            | Catálogo                        | Lista para seleção; preço conforme **Tamanho**             |
| **Pacotes**             | Referência                      | Catálogo no app: preço do pacote (cobrança única)          |
| **Produtos**            | Estoque / venda                 | Catálogo no app: preço × quantidade                        |
| **Pagamentos**          | Financeiro profissionais        | Não exposto no MVP                                         |
| **Folha**               | Resumo folha pagamento          | **`folha.id`** + coluna **Profissional** (nome); origem de **`atendimentos.profissional_id`** (FK) e de **GET /api/profissionais** |
| **Despesas**            | Despesas                        | Não exposto no MVP                                         |
| **Regras Mega**         | Regras Mega / etapas            | Catálogo no app: `Pacote` + `Etapa` → `Valor` e `Comissão` |
| **Cabelos**             | Referência (cor, método, valor) | Lista opcional no app; valor do atendimento é manual (MVP) |
| **Recibo**              | Layout / impressão              | Não é tabela de API                                        |
| **Recibo Funcionárias** | Layout                          | Não é tabela de API                                        |
| **Dashboard**           | Painel / fórmulas               | Não é tabela de API                                        |
| **Config**              | Configurações                   | Não exposto no MVP                                         |


---

## De/para: colunas da planilha ↔ API / front

### `Clientes` (linha 1 = cabeçalho)


| Coluna na planilha | Obrigatório na inclusão via app    | Observação                  |
| ------------------ | ---------------------------------- | --------------------------- |
| `ID Cliente`       | Preenchido pelo Apps Script (UUID) | Chave usada em atendimentos |
| `Nome Exibido`     | Sim (payload `nome`)               |                             |
| `Telefone`         | Não                                |                             |
| `Observações`      | Não (payload `notas`)              |                             |


Colunas extras vazias na linha 1 são ignoradas pelo script.

**Resposta normalizada `listClientes`:** `id`, `nome`, `telefone`, `observacoes` (mapeiam de `ID Cliente`, `Nome Exibido`, `Telefone`, `Observações`). **Linhas sem `Nome Exibido` preenchido ou sem `ID Cliente` são omitidas** (evita opções vazias no select).

---

### `Serviços` (aba com acento **Serviços**)


| Coluna na planilha                                               | Uso                                                                                                                                     |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `Serviço`                                                        | Nome do serviço (texto exibido em **Atendimentos.Serviços**)                                                                            |
| `Tipo`                                                           | `**Fixo`** ou `**Tamanho**` (no atendimento o tipo de linha continua **Serviço**); legado: `Serviço`/`Servico` tratado como **Tamanho** |
| `Valor Base`                                                     | **Fixo:** preço cobrado; **Tamanho:** fallback se coluna de tamanho vazia                                                               |
| `Comissão Fixa`                                                  | **Fixo:** valor gravado em **Atendimentos.Comissão** (aceita `Comissao Fixa`)                                                           |
| `Comissão %`                                                     | **Tamanho:** comissão = `Valor` da linha × percentual (célula 0,4 ou 40 ou 40%; aceita `Comissao %`)                                    |
| `Preço Curto`, `Preço Médio`, `Preço Médio/Longo`, `Preço Longo` | **Tamanho:** preço conforme tamanho escolhido no app                                                                                    |
| `Custo Fixo`, `Curto`, `Médio`, `M/L`, `Longo`                   | Custos / dimensões (planilha)                                                                                                           |


**Identificador na API:** `id` = **número da linha** na aba (2 = primeira linha de dados). O front envia esse valor em `servico_id` ao criar atendimento do tipo **Serviço**.

**Filtro no front (Novo atendimento):** linhas com `**Tipo`** = `Fixo`, `Tamanho` ou legado `Serviço`/`Servico`.

### `Folha`


| Coluna / chave | Uso na API / BD                                                                                  |
| -------------- | ------------------------------------------------------------------------------------------------ |
| `id` (PK)     | **Identificador estável** usado em **`atendimentos.profissional_id`** (FK `folha.id`).          |
| `Profissional` | Nome exibido; join na listagem de atendimentos; dropdown no app usa **id + nome**.              |


**GET `/api/profissionais` (API Node / Postgres):** `{ items: [ { "id": 1, "nome": "Jorge" }, … ] }` — uma entrada por **nome** útil (heurística igual à antiga: ignora cabeçalho, datas, valores); o **`id`** é o da **primeira linha `folha`** encontrada para aquele nome (ordenado). Se a Folha tiver **várias linhas com o mesmo nome** (ex.: um mês por linha), convém que **`profissional_id`** nos atendimentos aponte sempre ao **mesmo** `id` que o dropdown usa, ou normalizar a Folha para uma linha canónica por pessoa (evita duas “colunas” lógicas no futuro calendário).

**Coluna na BD `atendimentos`:** `profissional_id` (integer, nullable em alguns tipos) → **`folha.id`**. O nome na resposta de listagem continua a chave **`Profissional`** (texto) para compatibilidade com a planilha, mais **`profissional_id`** (número) para o front e para a **agenda visual** (coluna = `profissional_id`).

#### Verificação rápida (PostgreSQL)

Confirma que a app e a base estão alinhadas com **`folha.id`**:

```sql
-- 1) FK de atendimentos -> folha existe?
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'atendimentos'::regclass
  AND contype = 'f';

-- 2) Linhas órfãs ou IDs que não existem em folha?
SELECT a.id, a.id_atendimento, a.profissional_id
FROM atendimentos a
WHERE a.profissional_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM folha f WHERE f.id = a.profissional_id);

-- 3) Amostra: id gravado vs nome resolvido (deve bater com o esperado)
SELECT a.id_atendimento, a.tipo, a.profissional_id, f.profissional AS nome_folha
FROM atendimentos a
LEFT JOIN folha f ON f.id = a.profissional_id
ORDER BY a.data DESC NULLS LAST, a.id
LIMIT 30;
```

Se (2) devolver linhas, a migração ou o seed não bate com **`folha.id`**. Se (3) mostrar `nome_folha` NULL com `profissional_id` preenchido, o inteiro **não** é um `id` válido de **`folha`**.

---

### `Regras Mega`

Usada para **Mega** e para **comissão por etapa** em **Pacote** (lookup `Pacote` + `Etapa`).


| Coluna     | Uso na API                                                 |
| ---------- | ---------------------------------------------------------- |
| `Pacote`   | Nome do pacote / mega                                      |
| `Etapa`    | Nome da etapa                                              |
| `Valor`    | Valor da etapa (**Mega**: cobrado por etapa)               |
| `Comissão` | Comissão da etapa (aceita cabeçalho `Comissao` sem acento) |


**GET `listRegrasMega`:** `{ items: [ { pacote, etapa, valor, comissao } ] }` — só linhas com `Pacote` e `Etapa` preenchidos.

---

### `Pacotes` (aba comercial)


| Coluna         | Uso na API                                                     |
| -------------- | -------------------------------------------------------------- |
| `Pacote`       | Nome (idealmente igual ao nome em **Regras Mega** para etapas) |
| `Preço pacote` | Preço total ao cliente (fallback: `Preço Pacote`, `Preço`)     |


**GET `listPacotes`:** `{ items: [ { pacote, preco } ] }`

---

### `Produtos`


| Coluna    | Uso na API                         |
| --------- | ---------------------------------- |
| `Produto` | Nome                               |
| `Preço`   | Preço unitário (fallback: `Preco`) |
| `Unidade` | Opcional (exibição)                |


**GET `listProdutos`:** `{ items: [ { produto, preco, unidade } ] }`

---

### `Cabelos`

Leitura flexível: `Cor`, `Tamanho (cm)` ou `Tamanho`, `Método` ou `Metodo`, `Valor Base`.

**GET `listCabelos`:** `{ items: [ { cor, tamanho_cm, metodo, valor_base } ] }` — se a aba não existir, `items: []`.

---

### `Atendimentos` (substitui o modelo antigo “Agendamentos”)

Cabeçalhos da linha 1 (conforme export; a lista evolui com o produto):

`ID Atendimento`, `Data`, **`Início`**, **`Fim`**, `ID Cliente`, `Nome Cliente`, `Tipo`, `Pacote`, `Etapa`, `Produto`, `Serviços`, `Tamanho`, **`Profissional`** (nome, derivado de `folha` via join), **`profissional_id`** (opcional na exportação; na BD é **`profissional_id` → `folha.id`**), `Valor`, `Valor Manual`, `Comissão`, `Desconto`, `Descrição`, `Descrição Manual`, `Custo`, `Lucro` (+ colunas vazias até o fim da linha).

Na **base Postgres** já existem também (podem ou não existir na planilha exportada, conforme versão do ficheiro): **`cobranca_status`**, **`pagamento_status`**, **`pagamento_metodo`**, mapeados para o fluxo receção/cobrança descrito mais abaixo.

**Várias linhas, mesmo `ID Atendimento`:** usado em **Mega** (1 linha por etapa) e **Pacote** (1 linha de cobrança + 1 por etapa).

`**ID Atendimento`:** gerado como `**aaaammdd` + `-` + `ID Cliente`** (ex.: `20260401-CL0001`), usando a **data do atendimento** do payload e o `**cliente_id`**. Todas as linhas do mesmo lançamento (Mega/Pacote) partilham o mesmo ID. *Dois atendimentos no mesmo dia para o mesmo cliente repetem o mesmo ID* — nesse caso trate na planilha ou peça sufixo no futuro.

**Inserção:** cada linha é gravada na **primeira linha em que a coluna `ID Atendimento` está vazia** (a partir da linha 2), em vez de `appendRow` no fim da grelha.

#### Esboço — horário na agenda (`Início` / `Fim`)

Objetivo: suportar **agenda em grelha** (eixo vertical = tempo, eixo horizontal = `profissional_id`) sem abandonar a coluna **`Data`** (dia civil do atendimento, filtro principal atual).

| Conceito | Planilha (cabeçalho sugerido) | Postgres (`atendimentos`) | Regras (esboço) |
| -------- | ----------------------------- | --------------------------- | ---------------- |
| Início do slot | `Início` | `inicio` (`timestamptz`, nullable) | Instante em que o serviço **começa** naquela linha. **Opcional** no MVP: células vazias = agenda só por dia, como hoje. |
| Fim do slot | `Fim` | `fim` (`timestamptz`, nullable) | Instante previsto de **término** (ou fim real, conforme política da app). Deve ser **>= `inicio`** quando ambos preenchidos. |
| Dia lógico | `Data` | `data` (`date`) | Continua a ser a referência para `listAgendamentos` / `GET /api/atendimentos` por intervalo de dias. Quando `inicio`/`fim` existirem, **`Data`** deve ser o **mesmo dia civil** que `inicio` (timezone da loja ou UTC acordado — fechar na implementação). |

**Mega / Pacote:** cada linha (etapa ou cobrança) pode ter **pares `Início`/`Fim` distintos** por profissional e horário.

**API (Node):** a listagem normalizada deve passar a expor, quando existirem, chaves estáveis em JSON (esboço: `inicio`, `fim` em **ISO 8601**, ex. `2026-05-15T11:00:00-03:00`), além de `data` em `YYYY-MM-DD`.

**Importação / ETL / Google Sheets:** aceitar texto ou datetime nas colunas `Início` e `Fim` com o mesmo espírito que **`Data`** (vários formatos legíveis); células vazias persistem como `NULL` na BD.

**Validação futura (não obrigatória no primeiro passo):** impedir sobreposição de intervalos no mesmo `profissional_id` é regra de **aplicação** ou *constraint* defensiva, não parte mínima deste contrato.


| `Tipo` (payload) | Linhas       | Preenchimento principal (script)                                                                                                                                                           |
| ---------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Serviço**      | 1            | **Fixo:** `Valor` = `Valor Base`, `Comissão` = `Comissão Fixa`, `Tamanho` vazio. **Tamanho:** `Valor` por coluna F–I, `Comissão` = valor × `Comissão %`. **`profissional_id`** obrigatório no app (→ `folha.id`) |
| **Mega**         | 1 por etapa  | `Pacote` + `Etapa` + `Valor` + `Comissão` via **Regras Mega**; **`profissional_id`** por etapa                                                                                            |
| **Pacote**       | 1 + N etapas | 1ª: `Valor` = **Pacotes**, `Etapa` vazio, `Comissão` vazio; demais: `Valor` = 0, `Comissão` = **Regras Mega**                                                                              |
| **Produto**      | 1            | `Produto` + `Valor` = preço × quantidade; `Comissão` vazio; `Descrição` com quantidade                                                                                                     |
| **Cabelo**       | 1            | `Valor` manual; `Comissão` vazio; `Descrição` = detalhes + observação                                                                                                                      |


**Filtro `listAgendamentos`:** compara a coluna **`Data`** com `dataInicio` / `dataFim` (`YYYY-MM-DD`), aceitando célula como data ou texto compatível. Filtros por intervalo de **hora** (quando `inicio`/`fim` estiverem preenchidos) ficam para extensão da API ou camada de apresentação.

**Resposta normalizada (Agenda / API):** objetos com `id`, `data`, `nomeCliente`, `servicos`, `tamanho`, **`profissional`** (nome), **`profissional_id`** (inteiro = `folha.id`, quando gravado), **`inicio`**, **`fim`** (opcionais; ISO 8601 quando existirem na BD), `valor`, estados de cobrança/pagamento, etc., para telas **Agenda**, **Atendimentos** e **agenda visual** (eixo horizontal = `profissional_id`, posição vertical = intervalo `inicio`–`fim`).

#### Confirmação de pagamento e razão financeira (API Postgres)

Na **API Node** (não no fluxo antigo do Apps Script), ao **confirmar pagamento** (`POST /api/atendimentos` com `acao=confirmar-pagamento` ou equivalente), o servidor:

1. Atualiza, na mesma transação, todas as linhas **`atendimentos`** com o mesmo `ID Atendimento` que já estão com cobrança **`finalizada`**, passando **`pagamento_status`** para **`confirmado`** e gravando **`pagamento_metodo`** (Dinheiro, Pix ou Cartão).
2. Calcula o **total líquido** do grupo (soma dos valores efetivos das linhas − desconto, alinhado à lógica de finalizar cobrança).
3. Insere **uma** linha em **`movimentacoes`** (receita, `origem = atendimento_confirmacao`) com esse total, **categoria** derivada do **tipo predominante** entre as linhas (Serviço → `receita_servicos`, Mega → `receita_mega`, Pacote → `receita_pacotes`, Produto → `receita_produtos`, Cabelo → `receita_cabelo`), **desempate** na ordem Pacote > Mega > Serviço > Produto > Cabelo.
4. A idempotência é garantida por **índice único parcial** em `id_atendimento` para receitas com essa origem: repetições da confirmação **não duplicam** a movimentação.

A resposta de sucesso inclui **`movimentacao_id`** quando foi criada ou reutilizada a receita de confirmação, ou **`null`** quando o total líquido é zero (confirmação de pagamento ainda assim é gravada nos atendimentos).

**Leitura e caixa (fase 1):** `GET /api/categorias-financeiras`, `GET /api/movimentacoes` (filtros opcionais `dataInicio`, `dataFim`, `natureza`), `GET /api/caixa/dia?data=YYYY-MM-DD` (agregação diária a partir de `movimentacoes`). **Lançamento manual:** `POST /api/movimentacoes` com `data_mov`, `natureza`, `valor`, `categoria_id` e campos opcionais.

---

## Ações HTTP (Web App)

### `GET`


| `action`            | Parâmetros                       | Descrição                                                |
| ------------------- | -------------------------------- | -------------------------------------------------------- |
| `health`            | —                                | Sanidade                                                 |
| `listClientes`      | —                                | Clientes normalizados                                    |
| `listServicos`      | —                                | Linhas de **Serviços** + `id` = linha                    |
| `listRegrasMega`    | —                                | Regras `pacote` + `etapa` + valores                      |
| `listPacotes`       | —                                | Catálogo `pacote` + `preco`                              |
| `listProdutos`      | —                                | Catálogo `produto` + `preco` + `unidade`                 |
| `listCabelos`       | —                                | Referência (pode ser vazio)                              |
| `listProfissionais` | —                                | Itens `{ id, nome }` com **`id` = `folha.id`** (uma entrada por nome útil) |
| `listAgendamentos`  | `dataInicio`, `dataFim` opcional | **Atendimentos** filtrados por **Data**                  |
| `listAtendamentos`  | (igual)                          | Alias de `listAgendamentos`                              |
| `getCliente`        | `cliente_id` ou `id` (query)     | Um registro normalizado (`item`)                         |


### `POST` (`Content-Type: text/plain`, corpo JSON)


| `action`                                  | `payload`                                                                                            |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `createCliente`                           | `{ "nome", "telefone?", "notas?" }`                                                                  |
| `updateCliente`                           | `{ "cliente_id", "nome", "telefone?", "notas?" }` — atualiza a linha na aba **Clientes**             |
| `createAgendamento` / `createAtendimento` | Objeto com `**tipo`** (ver tabela abaixo); legado: só `servico_id` + `cliente_id` + `data` = Serviço |


#### `createAgendamento` — por `tipo`


| `tipo`    | Obrigatórios                                                         | Notas                                                                                                            |
| --------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `Serviço` | `cliente_id`, `data`, **`profissional_id`**, `servico_id`, `tamanho?` | **`profissional_id`** = **`folha.id`**. Legado: aceita **`profissional`** (nome) e a API resolve para `folha.id`. |
| `Mega`    | `cliente_id`, `data`, `pacote`, `etapas[]`                           | `etapas`: `{ etapa, profissional_id }` (cada um = **`folha.id`**)                                                |
| `Pacote`  | `cliente_id`, `data`, `pacote`, `etapas[]`                          | Opcional na 1ª linha de cobrança: **`profissional_id`**. Etapas: `{ etapa, profissional_id }`.                   |
| `Produto` | `cliente_id`, `data`, `produto`, `quantidade`                       | **`profissional_id`** opcional                                                                                   |
| `Cabelo`  | `cliente_id`, `data`, **`profissional_id`**, `valor`                | `detalhes_cabelo?`, `observacao?`                                                                                |


**Legado:** sem `tipo` + `servico_id` → **Serviço**; **`profissional_id`** ou **`profissional`** (nome) opcional conforme regras antigas.

**Resposta:** `{ id, linhas?, data, cliente_id, nomeCliente }`.

`createAtendimento` é alias de `createAgendamento`.

---

## Referência rápida — outras abas (sem API dedicada neste MVP)

- **Pagamentos:** `Data`, `Profissional`, `Tipo`, `Valor`, `Mês Ref`, `Observação`
- **Folha:** `Profissional`, `Mês`, `Total Comissão`, `Total Pago`, `Saldo`, `Status`
- **Despesas:** `Data`, `Tipo`, `Categoria`, `Descrição`, `Valor`

---

## Fonte da estrutura

Gerado a partir do ficheiro na raiz do repositório: `ERP Espaço Lounge.xlsx`.  
Para atualizar este contrato após mudanças na planilha, volte a exportar e (opcional) execute `python scripts/dump_xlsx.py` após ajustar o caminho no script.