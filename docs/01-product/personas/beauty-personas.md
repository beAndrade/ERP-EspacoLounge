# Beauty Operational Personas

**Status:** Draft

**Owner:** Product Team

---

# Purpose

This document defines the primary operational personas for the Nexa platform.

These personas represent roles inside beauty businesses rather than fictional users.

Their purpose is to guide product decisions, UX flows and feature prioritization.

Every new feature should clearly identify which persona it primarily serves.

---

# Persona 01 — Salon Owner

## Description

Responsible for the overall business operation.

Usually manages:

- appointments
- professionals
- finances
- inventory
- customer relationships

May also perform beauty services.

---

## Primary Goals

- Understand business performance.
- Keep the schedule organized.
- Monitor revenue.
- Reduce operational problems.
- Grow the business.

---

## Pain Points

- Too many administrative tasks.
- Limited time.
- Frequent interruptions.
- Difficulty tracking business performance.
- Manual operational work.

---

## Device Usage

Primary:

- Smartphone

Secondary:

- Desktop

---

## Product Priorities

- Dashboard
- Financial overview
- Reports
- Team management
- Business configuration

---

# Persona 02 — Receptionist

## Description

Responsible for daily customer interaction and appointment management.

Usually performs the highest number of system interactions.

---

## Primary Goals

- Book appointments quickly.
- Reduce scheduling mistakes.
- Answer customer questions.
- Handle cancellations.
- Keep the agenda organized.

---

## Pain Points

- Constant interruptions.
- High interaction volume.
- Customer waiting time.
- Schedule conflicts.

---

## Device Usage

Primary:

- Smartphone

Secondary:

- Desktop

---

## Product Priorities

- Smart Booking
- Customer Search
- Quick Scheduling
- Payment Registration
- Daily Agenda

---

# Persona 03 — Beauty Professional

## Description

Performs beauty services and interacts with customers during appointments.

The system should never interrupt customer service.

---

## Primary Goals

- Start appointments quickly.
- View customer history.
- Register completed services.
- Access relevant information instantly.

---

## Pain Points

- Hands occupied during work.
- Limited attention.
- Frequent interruptions.
- Need for immediate information.

---

## Device Usage

Primary:

- Smartphone

---

## Product Priorities

- Today's Schedule
- Customer History
- Service Registration
- Quick Notes
- Before/After Photos (future)

---

# Persona 04 — Financial Manager

## Description

Responsible for financial control.

This role may be performed by the owner in small businesses.

---

## Primary Goals

- Monitor revenue.
- Track expenses.
- Manage cash flow.
- Generate reports.

---

## Device Usage

Primary:

- Desktop

Secondary:

- Smartphone

---

## Product Priorities

- Financial Dashboard
- Cash Flow
- Expenses
- Reports
- Payroll

---

# Persona 05 — System Administrator

## Description

Responsible for platform configuration.

Usually accessed infrequently.

---

## Primary Goals

- Configure business settings.
- Manage permissions.
- Maintain system integrity.

---

## Device Usage

Primary:

- Desktop

---

## Product Priorities

- Settings
- Users
- Permissions
- Integrations
- Billing

---

# Priority Matrix

| Persona | Usage Frequency | Mobile Priority | Product Priority |
|----------|----------------|----------------|-----------------|
| Beauty Professional | Very High | ⭐⭐⭐⭐⭐ | Critical |
| Receptionist | Very High | ⭐⭐⭐⭐⭐ | Critical |
| Salon Owner | High | ⭐⭐⭐⭐☆ | Critical |
| Financial Manager | Medium | ⭐⭐☆☆☆ | Medium |
| System Administrator | Low | ⭐☆☆☆☆ | Low |

---

# Product Principles

When product decisions create conflicts, priorities should follow this order:

1. Beauty Professional
2. Receptionist
3. Salon Owner
4. Financial Manager
5. System Administrator

The Nexa platform is designed primarily to optimize salon operations.

Administrative workflows should never compromise operational efficiency.

---

# Validation

Every feature proposal should explicitly answer:

- Which persona benefits?
- Which problem is solved?
- How often will this persona use the feature?
- Does the feature reduce operational effort?
- Does it improve the daily workflow?

If these questions cannot be answered clearly, the feature should be reconsidered.