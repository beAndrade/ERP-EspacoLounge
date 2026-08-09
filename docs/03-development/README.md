# Development Documentation

## Purpose

This directory contains the engineering standards, development workflow and release management documentation for the Nexa platform.

Its purpose is to establish consistent development practices, improve code quality and ensure predictable software delivery.

Unlike Architecture documentation, this directory focuses on **how software is developed**, not **how the platform is designed**.

---

# Scope

Development documentation includes:

- Engineering Standards
- Coding Guidelines
- Git Workflow
- Branch Strategy
- Folder Conventions
- Development Process
- Release Management
- Versioning
- Go-Live Procedures

This documentation should evolve as the engineering process matures.

---

# Folder Structure

```text
03-development/

standards/
    coding-standards.md
    branch-strategy.md

release-management/
    changelog.md
    release-notes.md
    versioning.md

cursor-guidelines.md
development.md
development-workflow.md
folder-conventions.md
git-workflow.md
go-live-checklist.md
```

---

# Engineering Principles

Development should prioritize:

- Readability
- Maintainability
- Simplicity
- Consistency
- Reusability
- Testability
- Incremental Delivery

Code should be easy to understand before being clever.

---

# Development Workflow

Every feature should follow the official Product EPIC lifecycle:

1. Product Decision (PDR)
2. Vision
3. Business Rules
4. UX Flows
5. Technical Design
6. Sprint Planning
7. Architecture Review
8. Implementation
9. Validation
10. Documentation

Development should never begin before product documentation is approved.

---

# Relationship with Other Documentation

This directory works together with:

- `01-product/`
  - Product definition
  - Domain Models
  - UX documentation

- `02-architecture/`
  - Architecture principles
  - Platform design
  - Infrastructure

- `adr/`
  - Architecture decisions

Development transforms approved product documentation into production-ready software.

---

# Release Process

Software releases should include:

- Validation
- Documentation Updates
- Changelog
- Release Notes
- Architecture Review (when necessary)

Every release should be reproducible and fully documented.

---

# Engineering Standards

All contributors should follow:

- Coding Standards
- Branch Strategy
- Git Workflow
- Folder Conventions
- Documentation Standards

Exceptions should be documented and justified.

---

# Ownership

Owner:

Engineering Team

Review Frequency:

At the end of every Product EPIC or whenever the development workflow changes.