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
| **Folha**               | Resumo folha pagamento          | **listProfissionais** (coluna Profissional para dropdown)  |
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


| Coluna         | Uso na API                                                                                      |
| -------------- | ----------------------------------------------------------------------------------------------- |
| `Profissional` | **GET `listProfissionais`:** lista única de nomes (dropdown “Profissional” no Novo atendimento) |


**GET `listProfissionais`:** `{ items: [ "Nome1", "Nome2", … ] }` — se a aba não existir, `items: []`. O script procura o cabeçalho **Profissional** nas primeiras 50 linhas (tabelas com título na linha 1); ignora células que parecem data ou valor monetário.

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

Cabeçalhos da linha 1 (conforme export):

`ID Atendimento`, `Data`, `ID Cliente`, `Nome Cliente`, `Tipo`, `Pacote`, `Etapa`, `Produto`, `Serviços`, `Tamanho`, `Profissional`, `Valor`, `Valor Manual`, `Comissão`, `Desconto`, `Descrição`, `Descrição Manual`, `Custo`, `Lucro` (+ colunas vazias até o fim da linha).

**Várias linhas, mesmo `ID Atendimento`:** usado em **Mega** (1 linha por etapa) e **Pacote** (1 linha de cobrança + 1 por etapa).

`**ID Atendimento`:** gerado como `**aaaammdd` + `-` + `ID Cliente`** (ex.: `20260401-CL0001`), usando a **data do atendimento** do payload e o `**cliente_id`**. Todas as linhas do mesmo lançamento (Mega/Pacote) partilham o mesmo ID. *Dois atendimentos no mesmo dia para o mesmo cliente repetem o mesmo ID* — nesse caso trate na planilha ou peça sufixo no futuro.

**Inserção:** cada linha é gravada na **primeira linha em que a coluna `ID Atendimento` está vazia** (a partir da linha 2), em vez de `appendRow` no fim da grelha.


| `Tipo` (payload) | Linhas       | Preenchimento principal (script)                                                                                                                                                           |
| ---------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Serviço**      | 1            | **Fixo:** `Valor` = `Valor Base`, `Comissão` = `Comissão Fixa`, `Tamanho` vazio. **Tamanho:** `Valor` por coluna F–I, `Comissão` = valor × `Comissão %`. `Profissional` obrigatório no app |
| **Mega**         | 1 por etapa  | `Pacote` + `Etapa` + `Valor` + `Comissão` via **Regras Mega**; profissional por etapa                                                                                                      |
| **Pacote**       | 1 + N etapas | 1ª: `Valor` = **Pacotes**, `Etapa` vazio, `Comissão` vazio; demais: `Valor` = 0, `Comissão` = **Regras Mega**                                                                              |
| **Produto**      | 1            | `Produto` + `Valor` = preço × quantidade; `Comissão` vazio; `Descrição` com quantidade                                                                                                     |
| **Cabelo**       | 1            | `Valor` manual; `Comissão` vazio; `Descrição` = detalhes + observação                                                                                                                      |


**Filtro `listAgendamentos`:** compara a coluna `**Data*`* com `dataInicio` / `dataFim` (`YYYY-MM-DD`), aceitando célula como data ou texto compatível.

**Resposta normalizada (Agenda):** objetos com `id`, `data`, `nomeCliente`, `servicos`, `tamanho`, `profissional`, `valor` para a tela **Agenda**.

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
| `listProfissionais` | —                                | Nomes únicos da coluna **Profissional** na aba **Folha** |
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


| `tipo`    | Obrigatórios                                                   | Notas                                                                                             |
| --------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `Serviço` | `cliente_id`, `data`, `profissional`, `servico_id`, `tamanho?` | Linha **Serviços** com **Tipo** Fixo ou Tamanho; `tamanho` só para **Tamanho** (e legado Serviço) |
| `Mega`    | `cliente_id`, `data`, `pacote`, `etapas[]`                     | `etapas`: `{ etapa, profissional }`                                                               |
| `Pacote`  | `cliente_id`, `data`, `profissional`, `pacote`, `etapas[]`     | 1ª linha cobrança + etapas                                                                        |
| `Produto` | `cliente_id`, `data`, `profissional`, `produto`, `quantidade`  | Preço na aba **Produtos**                                                                         |
| `Cabelo`  | `cliente_id`, `data`, `profissional`, `valor`                  | `detalhes_cabelo?`, `observacao?`                                                                 |


**Legado:** sem `tipo` + `servico_id` → **Serviço**; `profissional` opcional.

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