# Database

# Philosophy

The database must be designed for scalability.

Business-independent tables belong to the Core.

Business-specific tables belong to Modules.

---

# Current State

Single-module architecture.

Beauty module only.

---

# Future State

Multi-tenant architecture.

Every business belongs to a Company.

Every record belongs to a Company.

Example

Company

↓

Users

↓

Appointments

↓

Financial

↓

Reports

---

# Core Tables

Companies

Users

Roles

Permissions

Notifications

Audit Logs

Settings

Plans

Subscriptions

---

# Shared Tables

Customers

Professionals

Addresses

Attachments

Media

---

# Beauty Module Tables

Hair Methods

Hair Packages

Hair Services

Hair Inventory

Commissions

---

# Sports Module Tables

Courts

Reservations

Memberships

Matches

---

# Clinic Module Tables

Patients

Medical Records

Prescriptions

Appointments

---

# Database Principles

No duplicated structures.

Prefer generic entities over business-specific entities.

Business interpretation belongs to Modules.

---

# Future

Multi-Tenant

Every table should eventually contain

company_id

except global configuration tables.