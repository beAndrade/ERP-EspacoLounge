# EPIC-02 — Smart Booking

## Planning Status

Planned

## Goal

Reduce friction in scheduling: faster booking for staff, clearer availability, and stronger public / WhatsApp-assisted booking where it already exists.

## Why it matters

Agenda is the heartbeat of a salon. Smart booking is a differentiation theme already called out in competitive notes (Sales Playbook).

## Outcomes

- Fewer double-bookings and ambiguous slots
- Faster create/edit of appointments for common Beauty services (including packages / mega flows where applicable)
- Public booking and internal agenda stay consistent with the same rules

## In scope

- Hardening of current agenda + public booking domain
- Clearer availability rules and conflict messaging
- WhatsApp notification / reminder improvements that support booking (not a full CRM rewrite)
- Instrumentation of booking drop-off points (when analytics exist)

## Out of scope

- Full marketplace of salons
- AI auto-scheduling (belongs to EPIC-06 later)
- Multi-location routing before SaaS Runtime (EPIC-04)

## Dependencies

- Beauty catalog / attendance domain stability
- WhatsApp integration current state
- EPIC-01 for mobile booking UX
- BUSINESS-EPIC-01 validation of booking pains

## Success metrics

- Time to create a standard appointment
- No-show / late cancel rate (if measurable)
- Public booking conversion (start → confirmed)
- Support volume on agenda conflicts

## Related docs

- [Product roadmap](../roadmap/product-roadmap.md)
- `docs/02-architecture/integrations/integrations.md`
- Lifecycle: not created yet under `docs/01-product/epics/`
