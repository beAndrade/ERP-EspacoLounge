# Versioning Strategy

## Purpose

This document defines the official versioning strategy for the Nexa platform.

Version numbers communicate the maturity of the product and the impact of each release.

Nexa follows Semantic Versioning (SemVer).

---

# Version Format

MAJOR.MINOR.PATCH

Example:

1.4.2

---

# MAJOR

Increment when incompatible or significant platform changes occur.

Examples:

- Architecture redesign
- Major Product EPIC completed
- Breaking API changes
- Major platform capabilities

Example:

1.0.0 → 2.0.0

---

# MINOR

Increment when new functionality is introduced without breaking compatibility.

Examples:

- New modules
- New reports
- New dashboard
- Smart Booking
- AI Assistant

Example:

1.2.0 → 1.3.0

---

# PATCH

Increment when fixing defects without changing product behavior.

Examples:

- Bug fixes
- UI fixes
- Performance improvements
- Small refactors

Example:

1.3.4 → 1.3.5

---

# Current Version

Current Development Version:

0.2.0

Product Status:

Pre-release

---

# Planned Evolution

0.1.x

Architecture Foundation

---

0.2.x

Mobile Foundation

---

0.3.x

Smart Booking Platform

---

0.4.x

Beauty Excellence

---

0.5.x

SaaS Runtime

---

0.6.x

Growth Platform

---

0.7.x

AI Assistant

---

1.0.0

First Production Release

Commercial SaaS Launch

---

# Version Rules

A release should never skip version numbers.

Every released version must have:

- Changelog
- Release Notes
- Validation completed
- Documentation updated

---

# Git Tag Convention

Every production release should create a Git tag.

Examples:

v0.2.0

v0.3.0

v1.0.0

---

# Branch Relationship

Development occurs in feature branches.

Approved work is merged into the main development branch.

Production releases are tagged according to this versioning strategy.

---

# Release Approval

Before releasing a new version verify:

- Product Validation completed.
- Architecture Review completed.
- Documentation updated.
- Changelog updated.
- Release Notes prepared.
- Critical issues resolved.

Only approved releases receive an official version number.

---

# Long-Term Goal

The first stable commercial release of Nexa will be:

v1.0.0

This milestone represents the completion of the initial product vision and readiness for commercial SaaS operation.