# Architecture Decisions

---

## ADR-001

Date

2026-08-05

Title

Adopt Modular Architecture

Status

Accepted

---

Context

The platform was initially developed only for beauty salons.

The business vision evolved into a modular SaaS platform.

---

Decision

Adopt a Core + Shared + Features + Modules architecture.

---

Alternatives

Multiple repositories.

Copy-and-paste architecture.

---

Consequences

Positive

- Better scalability.
- Easier maintenance.
- Code reuse.

Negative

- Higher initial complexity.

---

## ADR-002

Date

2026-08-05

Title

Future Multi-Tenant Support

Status

Accepted

Decision

Every business will become a Company.

Every business record will eventually belong to a Company.

Migration postponed until Core architecture is completed.