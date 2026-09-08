# PDR-001 — Smart Booking Philosophy

**Status:** Accepted

**Date:** 2026-08-07

**Owners:** Product / Architecture

**Related EPIC:**
- Product EPIC 01 — Mobile Foundation
- Product EPIC 02 — Smart Booking Platform

---

# Context

Scheduling is the operational core of Nexa.

Unlike generic salon ERPs, Nexa is being designed for beauty professionals who work with long appointments, complex services, assistants, maintenance cycles, and highly personalized customer relationships.

The booking experience must therefore optimize operational speed rather than simply exposing calendar functionality.

This Product Decision Record establishes the philosophy that will guide every future scheduling feature.

---

# Decision

Nexa adopts a **Smart Booking** philosophy.

Scheduling is not considered a calendar feature.

Scheduling is considered an operational assistant.

Every interaction should help the professional make faster and better decisions while reducing cognitive load.

The system should proactively simplify operations instead of requiring users to manually configure every detail.

---

# Product Principles

## 1. Mobile First

Booking must be optimized for smartphones.

Desktop is a complementary interface.

---

## 2. Speed First

The most common scheduling operations should require the minimum possible number of interactions.

---

## 3. Context Over Configuration

The system should present contextual information instead of exposing excessive configuration options.

Examples:

- Previous visits
- Hair extension method
- Preferred professional
- Typical appointment duration
- Last service
- Maintenance history

---

## 4. Operational Intelligence

The system should assist decision making whenever possible.

Examples include:

- Suggested appointment duration
- Conflict detection
- Availability suggestions
- Customer reminders
- Scheduling recommendations

---

## 5. Progressive Complexity

Simple operations remain simple.

Advanced functionality is progressively revealed only when necessary.

---

## 6. Consistency

Every scheduling interaction should follow the same behavioral patterns across all modules.

---

## 7. Human-Centered Design

The booking experience should match how beauty professionals actually work rather than how software is traditionally designed.

---

# Non-Goals

This philosophy does not aim to:

- Build a generic calendar application
- Maximize configuration options
- Replicate Google Calendar
- Replicate Outlook
- Prioritize technical flexibility over operational simplicity

---

# Consequences

Future booking features should be evaluated against this philosophy.

Features that increase complexity without improving operational efficiency should be rejected.

Every future scheduling decision should answer:

> Does this reduce effort for the professional?

If the answer is no, the feature should be reconsidered.

---

# Success Criteria

The Smart Booking experience should eventually achieve:

- Faster appointment creation
- Lower scheduling error rate
- Reduced interaction count
- Better adoption by professionals
- Lower training requirements
- Higher perceived usability

---

# Future Evolution

This PDR will guide:

- Mobile Foundation
- Smart Booking Platform
- AI Assistant
- Customer Portal
- Online Booking
- Calendar Intelligence
- Predictive Scheduling