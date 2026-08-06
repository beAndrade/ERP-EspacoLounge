# Core

## Purpose

Contains framework-independent platform capabilities used across the application.

## Contains

- Configuration
- Base abstractions
- Error handling
- Middleware
- Decorators
- Guards
- Interceptors
- Logger

## Must NOT contain

- Business rules
- Database access
- Module-specific logic
- External integrations

## Dependencies

Core must not depend on Modules or Features.

It may be used by any other layer.