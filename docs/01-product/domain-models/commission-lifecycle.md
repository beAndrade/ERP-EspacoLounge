# Domain Model — Commission Lifecycle

**Status:** Draft

---

# Lifecycle

```text
Calculated
    │
    ▼
Pending Approval
    │
    ▼
Approved
    │
    ▼
Ready for Payroll
    │
    ▼
Paid
```

---

# Business Rules

- Commissions are calculated after service completion.
- Approval may be automatic or manual.
- Paid commissions cannot be recalculated.
- Historical records remain immutable.