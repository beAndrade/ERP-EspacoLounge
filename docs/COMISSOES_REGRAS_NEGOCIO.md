# Regras de comissão — Espaço Lounge vs Belasis

Documento de validação para o negócio: o que **já está no sistema**, o que **passou a ser configurável** e o que **fica para fases futuras** (Belasis completo).

## Implementado neste ciclo

| Recurso | Onde | Comportamento |
|---------|------|----------------|
| % / valor fixo por serviço (catálogo global) | `servicos.comissao_pct`, `comissao_fixa` | Padrão quando não há override por profissional |
| Override por profissional + serviço | `profissional_servico_comissao` + aba **Comissões e Auxiliares** | Só **novas** linhas em `atendimentos`; histórico não recalcula |
| Profissional não recebe comissão | `profissionais.recebe_comissao` | Linha gravada com comissão vazia |
| Modo de listagem (Detalhadas) | `profissionais.comissao_listagem_modo` + aba **Configurar comissões** | `pagamento_cliente` (padrão) ou `competencia` |
| Snapshot por linha | `atendimentos.comissao` | Valor congelado na criação do atendimento |
| Folha / pagar / estornar | `folha`, `pagamentos`, APIs existentes | Sem mudança de motor |

## Modos de listagem (`comissao_listagem_modo`)

- **`pagamento_cliente`** (padrão, alinhado ao fluxo anterior): na aba Detalhadas, só entram comissões de comandas **pagas pelo cliente** (salvo checkbox «Mostrar comissões anteriores»).
- **`competencia`**: na aba Detalhadas, entram comissões **finalizadas** no período pela `data` do atendimento, **sem** exigir pagamento do cliente (próximo da visão da folha).

## Belasis — referência vs prioridade

| Opção Belasis | Prioridade Espaço Lounge | Estado |
|---------------|-------------------------|--------|
| Comissão % / fixo por serviço (por profissional) | Alta | Implementado (override + catálogo) |
| Comissão como auxiliar / split | Baixa | Fase 3 — não implementado |
| Importar serviços | Média | Botão na aba importa defaults do catálogo |
| Filtro data competência vs disponibilidade | Média | `comissao_listagem_modo` |
| Taxas (proporcional / estabelecimento / profissional) | Baixa | Taxas já existem em **formas de pagamento**; impacto na comissão = Fase 3 |
| Descontos na base da comissão | Baixa | Fase 3 |
| Produtos consumidos | Baixa | Fase 3 |
| Tipo comanda (todas vs só finalizadas) | Coberto | API já exige `cobranca_status = finalizada` |
| Texto recibo comissão | Baixa | Fase 3 |
| Recálculo retroativo ao mudar regra | Evitar | Não implementado de propósito |

## Pergunta para o negócio (checklist)

Confirmar com a recepção/gestão:

1. Cada profissional pode ter **% diferente** do catálogo por serviço? (sim → usar aba Comissões e Auxiliares)
2. Na tela de pagar comissões, o padrão deve ser **só após cliente pagar** ou **todas finalizadas do mês**? (define `comissao_listagem_modo` por profissional)
3. Alguma profissional **não recebe comissão** em nenhum serviço? (`recebe_comissao` na aba **Configurar comissões**)
4. Precisam de regras de **desconto/taxa de cartão** na comissão neste ano? (se não, manter Fase 3)

## Onde configurar o quê

| O quê | Onde hoje | Notas |
|-------|-----------|-------|
| % ou valor fixo **padrão** por serviço | `servicos` (seed/planilha) | Sem UI de edição ainda; ver roadmap abaixo |
| Profissional **não recebe** comissão | Drawer → **Configurar comissões** | `profissionais.recebe_comissao` |
| **Quando listar** comissões a pagar | Drawer → **Configurar comissões** | `comissao_listagem_modo` |
| **Override** %/fixo por profissional + serviço | API `profissional_servico_comissao` | UI removida do drawer; import via API |
| **Pagar / estornar** comissões | **Financeiro → Comissões** | Não fica no drawer do profissional |

## Drawer profissional — abas MVP

Abas visíveis: **Cadastro**, **Endereço**, **Usuário**, **Configurar comissões**, **Pagar salário/comissão** (drawer empilhado), **Vales e Bonificações** (drawer empilhado).

Override por serviço (`Comissões e Auxiliares`) permanece na API; UI removida do drawer — usar import/API ou fase futura.

Abas Belasis previstas: Assinatura digital, Expediente, Personalizar serviços, Permissões, Contas de banco.

## Roadmap (pós-entrega)

1. **UI catálogo de serviços** — editar `comissao_pct` / `comissao_fixa` no app (Serviços ou Financeiro → Cadastros), para cada instalação configurar sem seed manual.
2. **Multi-salão** — tenant + config por estabelecimento; as abas actuais do drawer mantêm-se; muda apenas a origem do catálogo default.

## APIs novas

| Método | Rota |
|--------|------|
| GET | `/api/profissionais/:id/comissoes-servicos` |
| PUT | `/api/profissionais/:id/comissoes-servicos` |
| POST | `/api/profissionais/:id/comissoes-servicos/importar-catalogo` |

Política de comissão: campos em `GET/PATCH /api/profissionais/:id` (`comissao_listagem_modo`, `recebe_comissao`).
