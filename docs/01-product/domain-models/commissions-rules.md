# Domain Model — Commission Rules

**Status:** Living Document

**Owner:** Product Team

**Domain:** Beauty

**Related:**

- [Commission Lifecycle](./commission-lifecycle.md)
- [Commissions Payroll](./commissions-payroll.md)

---

# Purpose

This document defines the **business rules** that govern how commission amounts are determined and when they may appear as payable to a professional.

It does **not** describe payroll synchronization, payment/reversal endpoints, or financial table mechanics. Those belong in [commissions-payroll.md](./commissions-payroll.md).

---

# Core Rules

## Catalog default

Each service may define a default commission as:

- percentage (`servicos.comissao_pct`), and/or
- fixed amount (`servicos.comissao_fixa`).

This default applies when there is **no** professional-specific override for that service.

## Professional override

A professional may have a different % or fixed commission **per service** (`profissional_servico_comissao`).

Business rule:

- Overrides apply only to **new** attendance lines.
- Changing an override does **not** recalculate historical lines.

## Eligibility — professional does not receive commission

If `profissionais.recebe_comissao` is false:

- new service lines are stored with an empty commission;
- the professional is not owed commission for those lines.

## Snapshot on the attendance line

When a service line is created on an attendance (`atendimentos`):

- the commission amount is **frozen** on `atendimentos.comissao`;
- later catalog or override changes do not rewrite that snapshot.

## Retroactive recalculation

Changing commission rules must **not** recalculate past attendance lines.

This is intentional product policy (not a temporary limitation).

---

# Listing policy (`comissao_listagem_modo`)

This is a **business policy** per professional that controls which finalized commissions appear in the **Detalhadas** (to-pay) list.

| Mode | Rule |
|------|------|
| `pagamento_cliente` (default) | Detalhadas lists commissions only when the client comanda is **paid** (unless the operator enables “Mostrar comissões anteriores”). |
| `competencia` | Detalhadas lists commissions that are **finalized** in the period by attendance `data`, **without** requiring the client to have paid (closer to the payroll-period view). |

Notes:

- Listing policy does not change how the monthly **folha** totals are calculated (see payroll document).
- Both modes only consider lines with `cobranca_status = finalizada` and unpaid to the professional (`comissao_paga_em` empty) for the Detalhadas “to pay” list.

---

# Where to configure (business)

| What | Where today |
|------|-------------|
| Default % / fixed per service | Service catalog (`servicos`) — seed/spreadsheet; dedicated UI still on product roadmap |
| Professional does not receive commission | Professional drawer → **Configurar comissões** (`recebe_comissao`) |
| When to list commissions to pay | Professional drawer → **Configurar comissões** (`comissao_listagem_modo`) |
| Override % / fixed per professional + service | `profissional_servico_comissao` (API / import; dedicated override UI may return later) |
| Pay / reverse commissions to professionals | **Financeiro → Comissões** (operational flow documented in payroll) |

---

# Belasis reference vs current priority

| Belasis-style option | Priority | Current product stance |
|----------------------|----------|------------------------|
| % / fixed per service (per professional) | High | Implemented (catalog + override) |
| Assistant / split commission | Low | Not implemented (future phase) |
| Import services into override set | Medium | Supported via catalog import |
| Competency date vs client-paid availability | Medium | Covered by `comissao_listagem_modo` |
| Card fees in commission base | Low | Payment fees exist elsewhere; commission impact = future phase |
| Discounts in commission base | Low | Future phase |
| Consumed products in commission | Low | Future phase |
| Only finalized comandas | Covered | Listing/payroll require `cobranca_status = finalizada` |
| Commission receipt text | Low | Future phase |
| Retroactive recalc when rules change | Avoid | Not implemented on purpose |

---

# Business checklist

Confirm with reception / management:

1. May each professional have a **different %** than the catalog per service? (yes → overrides)
2. On the pay-commissions screen, should the default be **only after the client pays** or **all finalized in the month**? (sets `comissao_listagem_modo`)
3. Does any professional **never** receive commission? (`recebe_comissao`)
4. Are **discount / card-fee** effects on commission required this year? (if not, keep as future phase)

---

# Product roadmap (rules-related)

1. UI to edit catalog `comissao_pct` / `comissao_fixa` without manual seed.
2. Multi-location / company-scoped defaults when SaaS tenancy lands (policy source changes; rule shapes stay).

---

# Ownership

Owner: Product Team

Review when commission configuration or listing policy changes.
