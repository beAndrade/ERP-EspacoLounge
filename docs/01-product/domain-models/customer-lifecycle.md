# Domain Model — Customer Lifecycle

**Status:** Draft

---

# Purpose

Defines the evolution of customer relationships inside Nexa.

---

# Lifecycle

```text
Lead
    │
    ▼
First Appointment
    │
    ▼
Active Customer
    │
    ├────────► Inactive
    │
    ▼
VIP
```

---

# States

## Lead

Potential customer.

---

## First Appointment

First scheduled service.

---

## Active Customer

Recurring customer.

---

## VIP

High-value customer according to configurable rules.

---

## Inactive

No activity within a configurable period.

---

# Business Rules

- Every customer starts as Lead.
- First completed appointment promotes customer.
- VIP rules remain configurable.
- Inactive customers may become Active again.