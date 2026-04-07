# Fluxos por persona e telas mínimas (MVP)

Documento de apoio ao ERP do salão — interface em **PT-BR**, telas grandes e linguagem do negócio.

## Personas

### Recepção

- **Objetivo:** atender ligações e walk-in, agendar, confirmar presença, registrar chegada.
- **Fluxos principais:**
  1. **Agenda do dia** — ver horários livres e ocupados por profissional.
  2. **Novo atendimento** — cliente, linha do catálogo **Serviços**, **data**, **tamanho** (Curto/Médio/M/L/Longo → preço), profissional opcional; grava na aba **Atendimentos**.
  3. **Lista de clientes** — buscar por nome/telefone, abrir ficha resumida.
  4. **Check-in** — marcar que o cliente chegou (atualiza status do agendamento).

### Técnico (cabeleireiro, manicure, etc.)

- **Objetivo:** ver a própria fila do dia, status dos atendimentos.
- **Fluxos principais:**
  1. **Minha agenda** — só compromissos atribuídos a mim (filtro por profissional).
  2. **Iniciar / concluir** — marcar atendimento em andamento ou concluído (MVP pode ser só “concluído”).

### Dono / gestão

- **Objetivo:** visão geral, cadastros mestres, conferência básica.
- **Fluxos principais:**
  1. **Cadastro de serviços** — nome, duração, preço de referência.
  2. **Relatório simples** (fase posterior no app) — por ora pode usar a planilha; no app, tela “Resumo” com contagens se a API expuser.

## Mapa de telas MVP (Angular)

| Rota            | Persona principal | Descrição |
|-----------------|--------------------|-----------|
| `/`             | Todas              | Início: atalhos grandes para Agenda, Clientes, Serviços. |
| `/agenda`       | Recepção, Técnico  | Linhas da aba **Atendimentos** (filtro por **Data**). |
| `/agenda/novo`  | Recepção           | Cliente, linha **Serviços**, data, tamanho, profissional, descrição → coluna **Descrição**. |
| `/clientes`     | Recepção           | Lista + busca; botão “Novo cliente”. |
| `/clientes/novo`| Recepção           | Nome, telefone, e-mail, notas. |
| `/servicos`     | Dono               | Lista de serviços cadastrados na planilha (somente leitura no MVP ou inclusão via API se implementado). |

## Fora do escopo do MVP (backlog)

- Caixa / fechamento de dia.
- Estoque de produtos.
- Login por perfil (recepção vs técnico) — hoje o Web App do Apps Script pode restringir quem acessa a URL; evolução: OAuth Google no Angular.

## Critérios de usabilidade (operadores pouco técnicos)

- Botões e alvos de toque **≥ 44px** onde possível.
- Uma tarefa principal por tela; evitar grade “tipo Excel”.
- Mensagens de erro em português claro (“Não foi possível salvar. Verifique a internet e tente de novo.”).
- Estados de **carregando** e **vazio** sempre visíveis.
