# Product EPIC 01 — Mobile Foundation

**Execution Status:** Draft

**Owner:** Product Team

**Related EPIC:** Product EPIC 01 — Mobile Foundation

---

# Purpose

This document defines the business rules that govern the mobile experience of the Nexa platform.

These rules are platform-independent and should be respected regardless of future implementation details.

Every mobile feature must comply with these principles.

---

# Core Principle

Mobile is the primary operational environment.

Desktop is an administrative extension.

Every product decision must prioritize the mobile experience before considering desktop adaptations.

---

# Navigation Rules

## BR-001 — Single Primary Action

Every screen must expose only one clear primary action.

Secondary actions should never compete visually with the main task.

---

## BR-002 — Predictable Navigation

Users should always know:

- where they are;
- where they came from;
- how to return.

Navigation must remain consistent across every module.

---

## BR-003 — Maximum Navigation Depth

Frequently used operations should require no more than three navigation levels.

Deep navigation hierarchies should be avoided.

---

## BR-004 — Bottom Reachability

Primary actions should remain reachable with one hand whenever reasonably possible.

---

# Information Rules

## BR-005 — Context First

Only information necessary for the current decision should be displayed.

Additional information should be progressively revealed.

---

## BR-006 — Progressive Disclosure

Advanced functionality must remain available without increasing cognitive load for common users.

---

## BR-007 — Operational Priority

Operational information always has higher priority than administrative information.

Example:

Current appointment is more important than customer registration details.

---

# Interaction Rules

## BR-008 — Immediate Feedback

Every user interaction must provide immediate visual confirmation.

Examples:

- loading
- success
- failure
- disabled state
- progress

---

## BR-009 — Error Prevention

The interface should prevent mistakes whenever possible instead of relying on validation after submission.

---

## BR-010 — Minimize Typing

Typing should be avoided whenever alternatives exist.

Prefer:

- selection
- search
- suggestions
- recent values
- defaults

---

## BR-011 — Smart Defaults

Whenever possible, the system should automatically prefill information based on context.

Examples:

- current professional
- current date
- preferred payment method
- recent service

---

# Performance Rules

## BR-012 — Perceived Performance

The interface should always feel responsive.

Feedback is more important than raw execution speed.

---

## BR-013 — Fast Access

Frequently used information should require the fewest interactions.

---

# Visual Rules

## BR-014 — Comfortable Touch Targets

Interactive elements should remain easy to tap under real working conditions.

---

## BR-015 — Visual Hierarchy

The interface should clearly communicate:

1. primary action
2. current information
3. secondary actions

---

## BR-016 — Consistency

Buttons, drawers, lists, cards and dialogs should behave consistently throughout the platform.

---

# Data Rules

## BR-017 — Never Lose User Input

Accidental navigation should not silently discard user work.

---

## BR-018 — Context Preservation

When returning to a previous screen, user context should remain preserved whenever possible.

Examples:

- filters
- search terms
- selected tab
- scroll position

---

# Accessibility Rules

## BR-019 — Readability

Information should remain readable without requiring zoom.

---

## BR-020 — Contrast

Critical actions must remain visually distinguishable.

---

## BR-021 — Reachability

Important actions should not require uncomfortable finger movement whenever avoidable.

---

# Product Rules

## BR-022 — Simplicity Wins

When two solutions solve the same problem, the simpler operational experience should be preferred.

---

## BR-023 — Operational Efficiency

Every new feature should reduce operational effort.

Features that increase complexity without measurable value should be reconsidered.

---

## BR-024 — Mobile Before Desktop

Desktop improvements should never compromise the mobile experience.

---

## BR-025 — Product Consistency

Future modules must inherit the same interaction principles established by this EPIC.

---

# Decision Checklist

Every future feature should answer:

- Does this reduce user effort?
- Is it optimized for mobile?
- Can the task be completed faster?
- Is unnecessary information hidden?
- Is the primary action obvious?
- Does the interface prevent mistakes?
- Is navigation consistent?
- Would a first-time user understand what to do?

If any answer is "No", the design should be reconsidered before implementation.

---

# Exit Criteria

This document is complete when:

- All mobile interaction principles are defined.
- Product rules are implementation-independent.
- Rules are measurable.
- Future EPICs can reuse these principles without modification.