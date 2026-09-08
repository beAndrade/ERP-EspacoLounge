# Cursor Guidelines

# Purpose

Cursor is an AI development assistant.

It should accelerate development without making architectural decisions.

Architecture decisions belong to the project documentation.

---

# Before Every Task

Cursor should:

Read

Architecture.md

↓

Modules.md

↓

Development.md

↓

Current Feature Documentation

before generating code.

---

# General Rules

Never duplicate code.

Never create business logic inside Shared.

Never create business logic inside Core.

Always reuse existing components.

Always respect folder organization.

---

# Preferred Workflow

Analyze.

↓

Explain.

↓

Propose.

↓

Implement.

↓

Review.

Never jump directly to implementation.

---

# Refactoring

Never refactor unrelated files.

Keep changes small.

Avoid unnecessary renaming.

Maintain backwards compatibility.

---

# Code Quality

Prefer readability.

Prefer simplicity.

Prefer reusable solutions.

Avoid unnecessary abstractions.

---

# Documentation

Whenever a new architectural decision is introduced,

suggest updating

Architecture.md

or

Decisions.md

when appropriate.