# Product EPIC 01 — Mobile Foundation

**Execution Status:** Draft

**Owner:** Product Team

**Related Documents:**

- Vision
- Business Rules
- Beauty Operational Personas
- PDR-001 — Smart Booking Philosophy

---

# Purpose

This document defines the primary operational user flows of the Nexa platform.

The objective is to optimize how beauty professionals interact with the system during their daily work.

These flows describe user behavior independently of UI implementation.

---

# UX Principles

Every flow should follow these principles:

- Mobile First
- Fewest possible interactions
- Predictable navigation
- Immediate feedback
- Context-aware decisions
- Operational efficiency over feature density

---

# Flow 01 — Open the App

## Goal

Allow users to understand today's operation within seconds.

## Entry

Application launched.

## Flow

1. User opens Nexa.
2. Authentication is restored automatically.
3. Dashboard loads immediately.
4. Today's schedule is displayed.
5. Current time indicator is visible.
6. Upcoming appointment is highlighted.
7. Primary actions remain immediately accessible.

## Success Criteria

The user understands today's workload in less than five seconds.

---

# Flow 02 — View Today's Schedule

## Goal

Quickly identify appointments.

## Flow

1. Open Agenda.
2. Current day opens by default.
3. Current time is highlighted.
4. Upcoming appointments appear first.
5. Appointment cards summarize key information.
6. Tap opens appointment details.

## Appointment Card

Must display:

- Customer
- Time
- Professional
- Service
- Status

Avoid unnecessary information.

---

# Flow 03 — Create Appointment

## Goal

Schedule a customer with minimal effort.

## Flow

1. Tap New Appointment.
2. Search customer.
3. Select service.
4. Select professional.
5. Suggested duration is displayed.
6. Available times appear.
7. User confirms.
8. Appointment created.

## Smart Behaviors

System should automatically suggest:

- preferred professional
- previous service
- expected duration
- recommended interval
- recent observations

---

# Flow 04 — Start Appointment

## Goal

Begin service without unnecessary navigation.

## Flow

1. Open appointment.
2. Review customer summary.
3. Tap Start Service.
4. Appointment status changes.
5. Timeline begins.

Displayed information:

- Customer
- Service
- Notes
- Previous visit
- Hair extension information (future)

---

# Flow 05 — Complete Appointment

## Goal

Finish service naturally.

## Flow

1. Tap Finish Service.
2. Review performed services.
3. Add observations.
4. Confirm completion.
5. Appointment closed.

Optional actions:

- Add photos
- Schedule maintenance
- Register payment

---

# Flow 06 — Register Payment

## Goal

Record payment in the shortest possible flow.

## Flow

1. Tap Register Payment.
2. Display appointment total.
3. Select payment method.
4. Confirm amount.
5. Payment recorded.
6. Receipt generated.

Preferred payment methods should appear first.

---

# Flow 07 — Customer Search

## Goal

Locate customer information instantly.

## Flow

1. Tap Search.
2. Type customer name.
3. Results appear immediately.
4. Select customer.
5. Customer profile opens.

Priority information:

- Contact
- Last appointment
- Service history
- Notes

---

# Flow 08 — Navigation Between Modules

## Goal

Move between operational areas naturally.

## Primary Modules

- Dashboard
- Agenda
- Customers
- Financial
- Inventory
- More

Navigation should always preserve context.

---

# Flow 09 — Error Recovery

## Goal

Allow recovery from mistakes.

Examples:

- Undo deletion.
- Cancel payment.
- Restore draft.
- Return to previous state.

Users should never lose work unexpectedly.

---

# Flow 10 — Empty States

When no data exists, the interface should explain:

- Why the screen is empty.
- What the user can do next.
- Which action is recommended.

Avoid blank screens.

---

# Flow 11 — Loading States

Every operation should communicate progress.

Examples:

- Skeleton loading
- Progress indicator
- Disabled actions during processing

Users should always understand that the system is working.

---

# Flow 12 — Offline Preparation

Although offline support is outside the scope of this EPIC, every flow should be designed considering future offline compatibility.

Interactions should minimize dependencies on constant connectivity.

---

# Cross-Flow Rules

All flows should:

- Minimize navigation.
- Preserve context.
- Avoid unnecessary confirmations.
- Reduce typing.
- Prioritize one-handed interaction.
- Display only relevant information.
- Provide immediate feedback.

---

# UX Quality Checklist

Every new flow should answer:

- Can the task be completed faster?
- Is the primary action obvious?
- Is unnecessary information hidden?
- Can a first-time user understand the flow?
- Does the system prevent mistakes?
- Is mobile interaction prioritized?
- Is the number of taps minimized?
- Does the flow reduce cognitive effort?

If any answer is "No", the flow should be redesigned before implementation.

---

# Exit Criteria

This document is complete when:

- All primary operational journeys are documented.
- Navigation is consistent.
- Mobile principles are respected.
- Flows remain implementation-independent.
- UX complexity is minimized.