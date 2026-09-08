# Domain Model — Commissions Payroll

**Status:** Living Document

**Owner:** Product Team

**Domain:** Beauty

**Related:**

- [Commission Rules](./commissions-rules.md)
- [Commission Lifecycle](./commission-lifecycle.md)

---

# Purpose

This document explains how commission amounts on attendance lines are **liquidated**: monthly payroll summary (`folha`), payments to professionals, reversals, synchronization, and the financial APIs involved.

Configuration and eligibility rules live in [commissions-rules.md](./commissions-rules.md).

Lifecycle states live in [commission-lifecycle.md](./commission-lifecycle.md).

---

# Table roles

| Table | Role |
|-------|------|
| **`atendimentos`** | Source of truth **per service line**: `profissional_id`, `valor`, `comissao` (snapshot), `data`, `cobranca_status`, `comissao_paga_em` (when the professional was paid). |
| **`folha`** | **Monthly summary per professional** (competence `periodo_referencia` = `YYYY-MM` from attendance `data`). Synced fields: `total_comissao`, `total_pago`, `saldo`, `status`. |
| **`pagamentos`** | Payment made to the professional. Commission flow stores `folha_id`, `mes_ref`, and observation `mov:{id};atend:{ids}`. |
| **`movimentacoes`** | Financial expense (`origem = comissao_pagamento`) mirroring the payment. |
| **`comanda_pagamentos`** | Client comanda payment status used when listing policy is `pagamento_cliente`. |

---

# Operational flow (daily use)

1. **Comanda / agenda** — service finalized → attendance line with `comissao` snapshot and `cobranca_status = finalizada`. Folha for that month is recalculated.
2. **Client pays the comanda** — `comanda_pagamentos` updated. Under default listing policy, **Detalhadas** only shows commissions whose comanda is **paid by the client**.
3. **Pay commission to the professional** — Financeiro → Comissões → select lines → `POST /api/financeiro/comissoes/pagar`:
   - sets `atendimentos.comissao_paga_em`
   - creates `movimentacoes` + `pagamentos` (with `folha_id` for the main month of the batch)
   - recalculates `folha` for affected competence months
4. **History** — **Pagas** tab (`GET /api/financeiro/comissoes/pagas`).
5. **Reversal (estorno)** — Actions on Pagas → `POST /api/financeiro/comissoes/estornar` → clears `comissao_paga_em` and recalculates folha.

---

# Folha synchronization

`recalcularTotaisComissaoFolhaPorPeriodo(periodo YYYY-MM)`:

| Field | Source |
|-------|--------|
| `total_comissao` | Sum of `atendimentos.comissao` for **finalized** lines with commission &gt; 0 in the month |
| `total_pago` | Sum of the same lines that have `comissao_paga_em` set |
| `saldo` | `total_comissao − total_pago` (min 0) |
| `status` | `pendente` · `parcial` · `quitado` · `sem_comissao` |

Triggered automatically after pay/reverse commissions, when a comanda is finalized, and via `POST /api/folha/recalcular-comissoes`.

**Business note:** Folha totals include **all** finalized commissions in the month, **independent** of whether the client has paid. That differs from Detalhadas under `pagamento_cliente` policy (see rules document).

---

# Detalhadas vs Folha (operational effect)

| View | Behavior |
|------|----------|
| **Folha** | All finalized commissions in the month (client payment not required). |
| **Detalhadas** (default policy) | Requires client-paid comanda and empty `comissao_paga_em`. |
| **Detalhadas** + “Mostrar comissões anteriores” | Can include finalized commissions whose client comanda is not yet paid (when policy would otherwise hide them). |
| **Detalhadas** (`competencia` policy) | Finalized in period by attendance date; client payment not required. |

Policy definition: [commissions-rules.md](./commissions-rules.md) (`comissao_listagem_modo`).

---

# Financial APIs (liquidation)

| Method | Route | Use |
|--------|-------|-----|
| GET | `/api/financeiro/comissoes/detalhadas` | Lines to pay (Detalhadas) |
| GET | `/api/financeiro/comissoes/pagas` | Paid batches (Pagas) |
| GET | `/api/financeiro/comissoes/resumidas` | Folha summary for period |
| POST | `/api/financeiro/comissoes/pagar` | Register payment to professional |
| POST | `/api/financeiro/comissoes/estornar` | Reverse a paid batch |
| POST | `/api/folha/recalcular-comissoes` | Force month recalculation |

---

# Configuration APIs (used by liquidation screens)

Override and listing policy are business configuration (see rules). Technical routes:

| Method | Route |
|--------|-------|
| GET / PUT | `/api/profissionais/:id/comissoes-servicos` |
| POST | `/api/profissionais/:id/comissoes-servicos/importar-catalogo` |

Listing/eligibility flags also appear on `GET/PATCH /api/profissionais/:id` (`comissao_listagem_modo`, `recebe_comissao`).

---

# First use / existing data

To align existing `folha` rows after import or migration:

```http
POST /api/folha/recalcular-comissoes
Content-Type: application/json

{ "periodo": "2026-05" }
```

Repeat for each month in use.

---

# Ownership

Owner: Product Team

Review when liquidation APIs or folha sync behavior change.
