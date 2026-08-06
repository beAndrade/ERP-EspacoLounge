# Platform

## Purpose

Contains SaaS platform capabilities shared across every business module.

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
- Scheduling
- Products
- Customers
- Financial rules

## Dependencies

Platform may depend on Core, Shared and Infrastructure.

Business modules may depend on Platform.