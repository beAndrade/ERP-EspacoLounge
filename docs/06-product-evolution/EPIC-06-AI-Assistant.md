# EPIC-06 — AI Assistant

## Status

Planned (later)

## Goal

Assist salon operators with insights and safe actions (summaries, suggestions, drafting messages) on top of clean operational data — without replacing core workflows.

## Why it matters

AI is a multiplier, not a foundation. It becomes valuable after booking, Beauty ops and tenant boundaries are solid.

## Outcomes

- Assistive experiences that save time (e.g. draft WhatsApp follow-ups, summarize day/agenda)
- Clear human confirmation before any mutating action
- No leakage of data across companies

## In scope (future slices)

- Read-only copilots first (summaries, explanations)
- Draft generation for known templates
- Optional action proposals with explicit confirm
- Observability and cost controls

## Out of scope (for early AI)

- Fully autonomous booking changes
- Training on other tenants’ data
- Replacing commission business rules with opaque models
- Shipping AI before EPIC-04 isolation is trustworthy

## Dependencies

- EPIC-02 / EPIC-03 data quality
- EPIC-04 company isolation
- Integration and privacy policies
- Design System for assistant UI patterns

## Success metrics

- Time saved on assisted tasks (qualitative then quantitative)
- Acceptance rate of suggestions
- Zero cross-tenant incidents
- Cost per assisted action within budget

## Related docs

- Product-Roadmap.md
- `docs/02-architecture/Integrations.md`
- Platform / Company docs

## Principle

AI suggests. The operator decides. The Platform enforces tenant boundaries.
