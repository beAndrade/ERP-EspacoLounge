# Domain Model — Inventory Lifecycle

**Status:** Draft

---

# Lifecycle

```text
Purchased
    │
    ▼
In Stock
    │
    ├────────► Reserved
    │            │
    │            ▼
    │         Consumed
    │
    ▼
Adjusted
    │
    ▼
Archived
```

---

# Business Rules

- Products enter inventory through purchase.
- Reserved stock is unavailable.
- Consumed stock affects inventory levels.
- Adjustments require justification.
- Archived products remain in history.