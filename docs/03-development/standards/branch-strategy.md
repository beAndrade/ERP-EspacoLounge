# Branch Strategy

## Purpose

This document defines the official Git branching strategy for the Nexa Platform.

The objective is to maintain a clean Git history, isolate changes, reduce risks, and support continuous development.

---

# Main Branches

## main

Purpose

Stable production-ready code.

Rules

- Always deployable.
- Never commit directly.
- Changes arrive only through reviewed merges.

---

## Branch Types

### feature/*

Purpose

New functionality.

Examples

feature/customer-history

feature/dashboard

feature/whatsapp-notifications

Rules

- One feature per branch.
- Merge into main after review and validation.

---

### fix/*

Purpose

Bug fixes and hotfixes.

Examples

fix/drawer-comanda-inputs

fix/calendar-timezone

fix/commission-calculation

Rules

- Keep changes minimal.
- Do not perform unrelated refactoring.
- Prioritize stability.

---

### refactor/*

Purpose

Architecture improvements without changing business behavior.

Examples

refactor/01-architecture-analysis

refactor/02-project-structure

refactor/03-core-foundation

Rules

- No business rule changes.
- No feature additions.
- Preserve runtime behavior.
- Complete one refactoring goal per branch.

---

### docs/*

Purpose

Documentation only.

Examples

docs/product

docs/architecture

docs/adr

Rules

- No code changes.
- Documentation updates only.

---

# Workflow

Every task should follow this workflow.

Issue

↓

Create Branch

↓

Analysis

↓

Implementation

↓

Testing

↓

Documentation Review

↓

Commit

↓

Merge into main

---

# Commit Convention

Use Conventional Commits.

Examples

feat: add customer history

fix: remove value inputs from scheduling drawer

refactor: create modular folder structure

docs: add architecture documentation

style: adjust sidebar spacing

test: add financial service tests

chore: update dependencies

---

# Merge Policy

Before merging:

- Build passes.
- No TypeScript errors.
- No console errors.
- Documentation reviewed.
- Related Sprint completed.
- Business behavior validated.

---

# Hotfix Workflow

Production Issue

↓

Create fix/* branch

↓

Implement minimal solution

↓

Test

↓

Merge into main

↓

Merge main into active branches

↓

Continue current Sprint

---

# Refactoring Workflow

Architecture Analysis

↓

Migration Plan

↓

Sprint Approval

↓

Implementation

↓

Validation

↓

Documentation Review

↓

Merge

---

# Branch Lifetime

Delete feature, fix and refactor branches after successful merge.

Keep main clean and always deployable.

---

# General Principles

- One objective per branch.
- One Sprint per refactor branch.
- Avoid mixing unrelated changes.
- Prefer small and incremental branches.
- Documentation evolves together with the code.
- Architecture decisions must be recorded as ADRs when appropriate.

---

# Long-term Goal

Maintain a predictable and scalable Git workflow that supports the continuous evolution of the Nexa Platform.

---

## Branch Ownership

Only one major initiative should be active per branch.

Examples

Correct

feature/dashboard

Only Dashboard development.

Correct

refactor/03-core-foundation

Only Core architecture.

Incorrect

feature/dashboard

+

sidebar redesign

+

database changes

+

financial improvements

Avoid mixing unrelated work.

Smaller branches are easier to review, test and merge.