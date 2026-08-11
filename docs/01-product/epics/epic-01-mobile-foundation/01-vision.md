# Product EPIC 01 — Mobile Foundation

**Execution Status:** Draft

**Owner:** Product Team

**Portfolio (planning):** [EPIC-01 Mobile Foundation](../../../06-product-evolution/product-epics/epic-01-mobile-foundation.md)
Planning Status there: **Planned**

**Related PDRs:**
- PDR-001 — Smart Booking Philosophy

**Related ADRs:**
- Architecture Foundation (Phase 1)

---

# Vision

Build a truly mobile-first operational experience for beauty professionals.

Nexa should become the primary operational tool used throughout the working day, allowing professionals to manage appointments, customers, payments, services and daily operations directly from their smartphones with minimal friction.

Mobile is not a secondary interface.

Mobile is the primary platform.

Desktop exists to complement administrative workflows.

## Product Direction vs current delivery scope

- **Product Direction (North Star):** mobile-first / mobile as the primary operational platform (this document).
- **Current Delivery Scope (first slice):** browser-usable critical flows on phone/tablet without a native app — summarized in the [portfolio one-pager](../../../06-product-evolution/product-epics/epic-01-mobile-foundation.md).

The first slice advances the North Star; it does not replace it.

---

# Background

Traditional salon ERPs were originally designed for desktop environments and later adapted to mobile devices.

This usually creates poor usability:

- crowded interfaces
- excessive forms
- small touch targets
- multiple unnecessary interactions
- low adoption during customer service

Through Customer Discovery and direct observation of salon operations, Nexa identified that professionals spend most of their day away from a desk.

They require immediate access to operational information while interacting with customers.

The product should therefore adapt to the professional's workflow instead of forcing professionals to adapt to software limitations.

---

# Problem Statement

Beauty professionals lose time navigating complex interfaces while performing repetitive operational tasks.

The cognitive effort required to complete common actions reduces productivity and negatively impacts customer experience.

Existing ERPs prioritize feature quantity over operational simplicity.

Nexa aims to reverse this approach.

---

# Product Vision

Create the fastest operational experience available for beauty professionals.

Every frequent task should require fewer decisions, fewer interactions and less cognitive effort than traditional salon software.

The interface should feel natural, predictable and optimized for real-world salon environments.

---

# Business Goals

- Increase daily product adoption.
- Reduce operational friction.
- Reduce appointment management time.
- Improve staff onboarding.
- Increase perceived product quality.
- Create a competitive advantage through user experience.

---

# User Goals

Professionals should be able to:

- check today's schedule instantly;
- create appointments quickly;
- locate customer information in seconds;
- register payments with minimal effort;
- complete services without unnecessary navigation;
- switch between operational tasks naturally.

---

# Design Principles

## Mobile First

Every feature starts with the smartphone experience.

Desktop adaptations come afterwards.

---

## Speed Over Density

Display only information required for the current decision.

Avoid overwhelming users.

---

## Thumb-Friendly

Primary interactions must be comfortably reachable using one hand whenever possible.

---

## Progressive Disclosure

Advanced functionality should remain available without increasing interface complexity.

---

## Operational Context

Interfaces should prioritize information relevant to the current task.

Avoid exposing unnecessary controls.

---

## Consistency

Navigation patterns, terminology and interaction behavior should remain consistent across all modules.

---

## Feedback

Every user action should provide immediate visual feedback.

Users should never wonder whether an action has been executed.

---

# Out of Scope

This EPIC does not include:

- Offline mode implementation
- Push notifications
- AI features
- Online customer booking
- Marketing automation
- Customer portal
- Multi-tenant improvements
- Desktop redesign

Those initiatives belong to future EPICs.

---

# Success Metrics

The Mobile Foundation should contribute to measurable improvements such as:

- reduced interaction count for common tasks;
- reduced average appointment creation time;
- reduced payment registration time;
- increased mobile usage;
- reduced onboarding effort;
- lower operational error rate;
- higher user satisfaction.

Specific KPIs will be defined during validation.

---

# Risks

Potential risks include:

- Oversimplifying advanced workflows.
- Inconsistent interaction patterns.
- Feature creep during implementation.
- Desktop-first decisions affecting mobile usability.
- Increased complexity caused by excessive configuration.

These risks should be evaluated throughout the EPIC.

---

# Dependencies

This EPIC depends on:

- Design System Foundation
- Shared Components
- Platform Architecture
- Beauty Module
- PDR-001 — Smart Booking Philosophy

---

# Exit Criteria

This EPIC will be considered complete when:

- Mobile interaction principles are fully documented.
- Navigation patterns are standardized.
- UX flows are approved.
- Technical design is validated.
- Sprint planning is completed.
- Architecture review is approved.
- Mobile implementation guidelines are established.