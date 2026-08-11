# Domain Model — Commission Lifecycle

**Status:** Draft

**Owner:** Product Team

**Domain:** Beauty

**Related:**

- [Commission Rules](./commissions-rules.md)
- [Commissions Payroll](./commissions-payroll.md)

---

# Purpose

This document defines the **lifecycle of a commission on an attendance service line** as implemented today.

States below are derived from verified product behavior (`atendimentos.comissao`, `cobranca_status`, listing, `comissao_paga_em`, estorno). They are **not** aspirational approval workflows.

---

# Philosophy

A commission is born as a **snapshot amount** on a service line.

Liquidation (folha / pay / reverse) does not invent a separate commission entity table; the line on `atendimentos` remains the source of truth.

---

# Lifecycle

```text
Calculated (snapshot on attendance line)
    │
    ▼
Finalized (cobranca_status = finalizada)
    │
    ├──────────────► Accrued on Folha
    │                (monthly totals; client payment not required)
    │
    ▼
Eligible for Detalhadas listing
    │  (policy: pagamento_cliente | competencia)
    │
    ▼
Paid to professional (comissao_paga_em set)
    │
    └──────────────► Reversed (estorno)
                     (comissao_paga_em cleared → back to Eligible)
```

If the professional does not receive commission (`recebe_comissao = false`), the line is stored with an **empty** commission snapshot and **does not** enter payable / folha commission totals as a positive commission.

---

# States

## Calculated

Commission amount written on `atendimentos.comissao` when the service line is created.

Allowed implications:

- Amount is frozen (snapshot).
- Rule or override changes later do not rewrite this line.

---

## Finalized

Attendance billing status is `cobranca_status = finalizada`.

Allowed implications:

- Line may enter **folha** competence totals for the month of `data` (when commission &gt; 0).
- Line may become listable in Detalhadas once listing policy filters are satisfied and `comissao_paga_em` is empty.

---

## Accrued on Folha

Not a separate column on the attendance line.

Meaning: the line contributes to `folha.total_comissao` for its competence month via `recalcularTotaisComissaoFolhaPorPeriodo`.

Folha accrual does **not** wait for client payment.

---

## Eligible for Detalhadas listing

Line appears (or can appear) on the to-pay list when:

- `cobranca_status = finalizada`;
- `comissao_paga_em` is empty;
- listing policy for the professional is satisfied (`pagamento_cliente` vs `competencia`; optional “Mostrar comissões anteriores”).

This is a **view eligibility** state, not a stored enum.

---

## Paid to professional

`atendimentos.comissao_paga_em` is set (payment batch recorded; see payroll document).

Allowed implications:

- Line counts toward `folha.total_pago`.
- Line leaves Detalhadas to-pay list.
- Visible under Pagas history.

---

## Reversed (estorno)

Professional payment batch is reversed: `comissao_paga_em` cleared and folha recalculated.

The line returns to **Eligible for Detalhadas listing** (subject to the same filters).

---

# Transition rules

| From | To | How |
|------|----|-----|
| Calculated | Finalized | Attendance/comanda finalized (`cobranca_status = finalizada`) |
| Finalized | Accrued on Folha | Automatic folha recalculation for the competence month |
| Finalized | Eligible for Detalhadas | Listing query + professional policy |
| Eligible | Paid to professional | `POST /api/financeiro/comissoes/pagar` |
| Paid | Reversed → Eligible | `POST /api/financeiro/comissoes/estornar` |

There is **no** confirmed product state today for:

- Pending Approval
- Approved
- Ready for Payroll (as a distinct stored state)

Those names must not be used as current lifecycle states.

---

# Business rules (lifecycle)

- Snapshot amounts are not rewritten when catalog/override rules change.
- Only **finalized** lines participate in Detalhadas and folha commission sums.
- Paying the professional sets `comissao_paga_em`; reversing clears it.
- Folha totals and Detalhadas eligibility can diverge under `pagamento_cliente` policy (client unpaid vs folha still accrued) — see rules + payroll docs.

---

# Ownership

Owner: Product Team

Review when attendance commission fields or pay/reverse behavior change.
