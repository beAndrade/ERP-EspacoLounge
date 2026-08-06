# Modules

## Purpose

Contains business domains.

Each folder represents one independent business vertical.

Examples

- Beauty
- Clinic
- Pet
- Barber
- Academy

## Must NOT contain

- Shared platform capabilities
- Generic utilities
- Infrastructure adapters

## Dependencies

Modules may depend on:

- Core
- Shared
- Platform
- Features
- Infrastructure

Modules must never depend directly on another Module.