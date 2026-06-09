# Checklist de go-live — Espaço Lounge

Use este documento antes de operar no dia a dia (agenda + comissões).

## Base de dados

1. Na pasta `api`, com `DATABASE_URL` do ambiente correto:
   ```bash
   npm run db:migrate
   ```
2. Não depender apenas de `ensureSchemaPatches()` no arranque da API — migrações em `api/drizzle/` devem estar aplicadas em produção, staging e desenvolvimento.

## Segurança e acesso

1. Definir `JWT_SECRET` no `.env` da API (obrigatório em produção).
2. Definir `ADMIN_EMAIL` e `ADMIN_PASSWORD` para o primeiro login (criado automaticamente se `usuarios` estiver vazio).
3. Testar login em `/login` e uso da agenda no celular (4G).
4. Definir `ADMIN_PIN` no `.env` da API (área Financeiro no frontend).
5. Testar acesso a `/financeiro/comissoes` com o PIN.
6. Link público de agendamento: `/agendar` (clientes não precisam de conta).

Ver também [DEPLOY.md](./DEPLOY.md).

## Comissões por profissional

1. Em **Cadastros → Profissionais**, abrir cada profissional que recebe comissão.
2. Aba **Comissões**: modo de listagem (`pagamento_cliente` vs `competencia`), `recebe_comissao`, overrides por serviço se necessário.
3. Regras no catálogo (`servicos.comissao_pct` / `comissao_fixa`) vêm do seed/BD — alterações de preço/comissão base não retroagem em linhas antigas de `atendimentos`.

## Treino operacional (sua mãe / equipe)

| Tema | O que saber |
|------|-------------|
| Comissão “a pagar” (padrão) | Só linhas com comanda **finalizada** e **paga pelo cliente** (`comanda_pagamentos` em dia). |
| “Mostrar comissões anteriores” | Não é histórico antes da data — mostra linhas **ainda não pagas pelo cliente** no período. |
| Filtro “Assinadas digitalmente” | **Ignorar** — não há backend; qualquer opção além de “Todas” esvazia a lista. |
| Colunas Vales / Bonificações | Placeholder (sempre zero) até implementação futura. |
| Resumo folha na sidebar | Pode divergir da aba Detalhadas (competência vs pagamento cliente) — conferir totais na tabela antes de pagar. |
| Edição de agendamento | Sem `PATCH` por linha: editar via drawer de comanda ou excluir/recriar. |
| Catálogo (serviços, pacotes) | API só leitura — mudanças via seed ou BD. |

## Documentação relacionada

- [COMISSOES_FOLHA_PAGAMENTOS.md](./COMISSOES_FOLHA_PAGAMENTOS.md)
- [COMISSOES_REGRAS_NEGOCIO.md](./COMISSOES_REGRAS_NEGOCIO.md)

## Mobile (após deploy do sprint agenda)

- Entrada principal: **Agenda** (`/agenda`) — grelha com um profissional no telefone, FAB “Novo”, busca de cliente.
- Toggle **Dia / Semana** na faixa de dias.
- Comissões no telefone: usar aba Detalhadas em modo card; pagamento via drawer “Pagar”.
