# Infrastructure

## Purpose

Contains adapters responsible for communication with external systems.

## Contains

- Database
- Cache
- Queue
- Storage
- Email
- HTTP Clients
- External APIs
- Observability

## Must NOT contain

- Business rules
- Domain logic

## Dependencies

Infrastructure may depend on Core and Shared.

Business modules may use Infrastructure through abstractions.