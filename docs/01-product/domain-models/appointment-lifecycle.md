# Domain Model — Appointment Lifecycle

**Status:** Draft

**Owner:** Product Team

**Domain:** Beauty

---

# Purpose

This document defines the lifecycle of an appointment inside the Nexa platform.

Every module interacting with appointments must respect this lifecycle.

This model is independent of implementation details.

---

# Philosophy

An appointment is not just a calendar event.

It represents the complete operational journey of a customer visit.

Every appointment moves through predefined states.

Transitions must remain predictable and controlled.

---

# Lifecycle

```text
Scheduled
    │
    ├──────────────► Cancelled
    │
    ├──────────────► Rescheduled
    │
    ▼
Confirmed
    │
    ▼
Customer Arrived
    │
    ▼
In Progress
    │
    ▼
Service Completed
    │
    ▼
Payment Pending
    │
    ▼
Paid
    │
    ▼
Closed
```

Alternative flow:

```text
Scheduled
      │
      ▼
No Show
```

---

# States

## Scheduled

Appointment has been created.

Allowed actions:

- Edit
- Cancel
- Reschedule
- Confirm

---

## Confirmed

Customer confirmed attendance.

Allowed actions:

- Check In
- Cancel
- Reschedule

---

## Customer Arrived

Customer is physically present.

Allowed actions:

- Start Service

---

## In Progress

Service is currently being performed.

Allowed actions:

- Add Notes
- Add Products
- Add Photos
- Pause (future)
- Finish Service

---

## Service Completed

Operational work finished.

Financial process may still be pending.

Allowed actions:

- Register Payment
- Add Final Notes

---

## Payment Pending

Service completed but payment not finalized.

Allowed actions:

- Register Payment

---

## Paid

Payment successfully registered.

Allowed actions:

- Generate Receipt
- Schedule Maintenance

---

## Closed

Appointment fully completed.

No operational actions remain.

Historical information becomes read-only.

---

## Cancelled

Appointment cancelled before service.

Reason should be recorded.

---

## Rescheduled

Appointment moved to another date.

History should preserve previous schedule.

---

## No Show

Customer did not attend.

Reason may be recorded.

Future analytics may use this information.

---

# Transition Rules

Only valid transitions are allowed.

Backward transitions require explicit administrative action.

Invalid transitions must be blocked.

---

# Business Rules

- Closed appointments cannot be edited.
- Cancelled appointments cannot become In Progress.
- Payment cannot occur before Service Completed.
- Customer Arrived requires confirmation of attendance.
- Every appointment must finish in one terminal state.

Terminal states:

- Closed
- Cancelled
- No Show

---

# Future Integrations

This lifecycle supports:

- Smart Booking
- Customer Portal
- AI Assistant
- Financial Module
- Commission Module
- Analytics
- Notifications
- Loyalty Programs