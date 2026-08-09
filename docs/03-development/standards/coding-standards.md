# Coding Standards

# Naming

Folders

kebab-case

Example

financial-dashboard

---

Components

PascalCase

Example

FinancialCardComponent

---

Variables

camelCase

Example

totalRevenue

---

Constants

UPPER_SNAKE_CASE

Example

DEFAULT_PAGE_SIZE

---

Files

feature-name.component.ts

feature-name.service.ts

feature-name.repository.ts

---

Functions

Use verbs.

Examples

createAppointment()

calculateCommission()

generateReport()

---

Comments

Only explain business rules.

Never explain obvious code.

Bad

Increment x

Good

Hair services do not generate commission.

---

Imports

Standard Library

↓

Angular

↓

External Libraries

↓

Core

↓

Shared

↓

Features

↓

Modules

↓

Relative Imports

---

Formatting

Use Prettier.

No manual formatting.

---

Architecture

One responsibility per file.

One responsibility per service.

Avoid God Components.

Avoid God Services.