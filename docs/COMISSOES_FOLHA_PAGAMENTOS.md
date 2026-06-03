# Comissões: `atendimentos`, `folha` e `pagamentos`

Regras de configuração (override por profissional/serviço, modos de listagem): ver [COMISSOES_REGRAS_NEGOCIO.md](./COMISSOES_REGRAS_NEGOCIO.md).

## Papéis

| Tabela | Papel |
|--------|--------|
| **`atendimentos`** | Fonte de verdade **por linha de serviço**: `profissional_id`, `valor`, `comissao`, `data`, `cobranca_status`, `comissao_paga_em` (quando a profissional já recebeu). |
| **`folha`** | **Resumo mensal por profissional** (competência `periodo_referencia` = `YYYY-MM` da `data` do atendimento). Sincronizado automaticamente: `total_comissao`, `total_pago`, `saldo`, `status`. |
| **`pagamentos`** | Pagamento efetuado à profissional. No fluxo de Comissões: `folha_id`, `mes_ref`, observação `mov:{id};atend:{ids}`. |
| **`movimentacoes`** | Despesa financeira (`origem = comissao_pagamento`) espelhando o pagamento. |

## Fluxo operacional (uso diário)

1. **Comanda / agenda** — serviço finalizado → linha em `atendimentos` com `comissao` e `cobranca_status = finalizada`. Folha do mês é recalculada.
2. **Cliente paga a comanda** — `comanda_pagamentos` atualizado. A aba **Detalhadas** (padrão) só lista comissões de comandas **pagas pelo cliente**.
3. **Pagar comissão à profissional** — tela Comissões → selecionar linhas → `POST /api/financeiro/comissoes/pagar`:
   - Preenche `atendimentos.comissao_paga_em`
   - Cria `movimentacoes` + `pagamentos` (com `folha_id` do mês principal do lote)
   - Recalcula `folha` nos meses de competência afetados
4. **Histórico** — aba **Pagas** (`GET /api/financeiro/comissoes/pagas`).
5. **Estorno** — menu Ações na aba Pagas → `POST /api/financeiro/comissoes/estornar` → limpa `comissao_paga_em` e recalcula folha.

## Sincronização da folha

`recalcularTotaisComissaoFolhaPorPeriodo(periodo YYYY-MM)`:

| Campo | Origem |
|-------|--------|
| `total_comissao` | Soma `atendimentos.comissao` (finalizadas, comissão > 0) no mês |
| `total_pago` | Soma das mesmas linhas com `comissao_paga_em` preenchido |
| `saldo` | `total_comissao − total_pago` (mín. 0) |
| `status` | `pendente` · `parcial` · `quitado` · `sem_comissao` |

Chamado automaticamente após pagar/estornar comissões, finalizar comanda e via `POST /api/folha/recalcular-comissoes`.

## APIs de Comissões

| Método | Rota | Uso |
|--------|------|-----|
| GET | `/api/financeiro/comissoes/detalhadas` | Linhas a pagar (aba Detalhadas) |
| GET | `/api/financeiro/comissoes/pagas` | Lotes pagos (aba Pagas) |
| GET | `/api/financeiro/comissoes/resumidas` | Resumo folha no período (sidebar) |
| POST | `/api/financeiro/comissoes/pagar` | Registrar pagamento |
| POST | `/api/financeiro/comissoes/estornar` | Estornar lote |
| POST | `/api/folha/recalcular-comissoes` | Forçar recálculo de um mês |

## Diferença folha vs Detalhadas

- **Folha** inclui **todas** as comissões de serviços finalizados no mês (independente do cliente ter pago).
- **Detalhadas** (padrão) exige comanda **paga pelo cliente** e `comissao_paga_em` vazio.
- Checkbox **Mostrar comissões anteriores** inclui comissões de comandas ainda não pagas pelo cliente.

## Primeira utilização / dados existentes

Para alinhar linhas de `folha` já existentes:

```http
POST /api/folha/recalcular-comissoes
Content-Type: application/json

{ "periodo": "2026-05" }
```

Repita para cada mês em uso ou chame após importação de planilha.
