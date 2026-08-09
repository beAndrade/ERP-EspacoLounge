# Domain Model — Payment Lifecycle

**Status:** Draft

---

# Purpose

Defines how payments evolve within Nexa.

---

# Lifecycle

```text
Pending
    │
    ├────────► Cancelled
    │
    ▼
Processing
    │
    ▼
Paid
    │
    ▼
Reconciled
```

---

# States

## Pending

Payment expected.

---

## Processing

Payment is being processed.

---

## Paid

Payment successfully completed.

---

## Reconciled

Financial movement reconciled.

---

## Cancelled

Payment cancelled.

---

# Business Rules

- Payment starts as Pending.
- Only Paid payments affect revenue.
- Reconciled payments cannot be modified.
- Cancelled payments never affect financial reports.