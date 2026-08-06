# Folder Conventions

This document defines the responsibility of each top-level folder in the API. Every new file should follow these conventions.

---

# Core

## Purpose

Contains framework-independent platform capabilities used across the application.

## Contains

- Configuration
- Error handling
- Base abstractions
- Middleware
- Decorators
- Guards
- Interceptors
- Logger

## Must NOT contain

- Business rules
- Database access
- Module-specific logic

---

# Shared

## Purpose

Contains reusable building blocks shared across the entire application.

## Contains

- DTOs
- Interfaces
- Types
- Enums
- Constants
- Utility functions
- Validators

## Must NOT contain

- Business rules
- Database queries
- HTTP clients
- Module-specific code

---

# Platform

## Purpose

Contains SaaS platform capabilities shared by every business module.

## Contains

- Authentication
- Authorization
- Users
- Tenants
- Billing
- Subscriptions
- Notifications
- Audit
- File Management

## Must NOT contain

- Beauty-specific logic
- Clinic-specific logic
- Scheduling
- Products
- Financial rules

---

# Modules

## Purpose

Contains business domains.

Each module represents one business vertical.

Examples:

- Beauty
- Clinic
- Pet
- Barber

Each module should remain independent.

---

# Features

## Purpose

Contains reusable business capabilities that may be shared by multiple modules.

Examples:

- Reporting
- Scheduling Engine
- Payment Processing

Features should never depend on a specific module.

---

# Infrastructure

## Purpose

Contains adapters that communicate with external systems.

## Contains

- Database
- Cache
- Queue
- Storage
- Email
- External APIs
- HTTP Clients
- Observability

## Must NOT contain

- Business rules

---

# Services (Legacy)

Temporary folder kept during migration.

No new services should be added here.

This folder will gradually disappear as services are migrated into the new architecture.

---

# db

Contains database schema, migrations and ORM configuration.

---

# integrations

Contains external integrations that have not yet been migrated into Infrastructure.

---

# seed

Contains seed scripts.

---

# etl

Contains import/export and ETL processes.

---

# General Rules

- Modules must not depend on other Modules.
- Shared must remain business-independent.
- Infrastructure must never contain business rules.
- Platform must remain business-agnostic.
- Core must not depend on Modules.
- New code should always be placed in the new architecture.