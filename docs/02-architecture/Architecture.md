# Architecture

# Purpose

This document defines the architectural principles of the Nexa Platform.

Every new feature must respect these principles.

The objective is to build a scalable SaaS platform capable of supporting multiple business modules without code duplication.

---

# High-Level Architecture

Nexa Platform

├── Core
├── Shared
├── Features
├── Modules
└── Infrastructure

---

# Core

The Core contains business-independent functionality.

Examples

- Authentication
- Authorization
- Companies
- Users
- Roles
- Permissions
- Notifications
- Audit Logs
- Settings
- Dashboard Framework

Core must NEVER contain business-specific logic.

---

# Shared

Reusable components used across every module.

Examples

- UI Components
- Buttons
- Inputs
- Tables
- Cards
- Modals
- Date Utilities
- API Clients
- Validators
- Icons

Shared must NEVER import Modules.

---

# Features

Business features available to every module.

Examples

- Scheduling
- Financial
- Reports
- CRM
- Inventory
- Marketing
- Dashboard

Features should be configurable but never business-specific.

---

# Modules

Modules contain business rules.

Current

- Beauty

Future

- Sports
- Clinic
- Food
- Pet
- Academy

Modules may use Core, Shared and Features.

Core must never import Modules.

---

# Infrastructure

Responsible for:

- Database
- APIs
- Authentication
- Storage
- Cache
- Deployment
- Monitoring
- Logging

---

# Dependency Rules

Allowed

Module → Feature

Module → Shared

Module → Core

Feature → Shared

Feature → Core

Shared → Core

Forbidden

Core → Module

Shared → Module

Core → Feature

Modules communicating directly with other modules

---

# Long-term Goal

Transform Nexa into a modular SaaS platform where every new business segment becomes only a new Module.

The Core should remain stable regardless of business domain.