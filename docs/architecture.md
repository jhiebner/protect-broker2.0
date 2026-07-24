# Protect Broker Architecture

## Why this shape

Protect Broker needs to behave like an appliance, not a script collection. The design therefore prioritizes:

- A single operational control plane in the API
- Persistent internal state in PostgreSQL
- Provider adapters behind stable interfaces
- Real-time fan-out through an event bus and Socket.IO
- Browser-based configuration for every user-facing setting

## Runtime model

```text
UniFi Protect Provider
        |
        v
Protect Client Package
        |
        v
Broker Event Bus
   |      |       |
   v      v       v
 Database Rules  Socket.IO
        Engine
```

## Package responsibilities

### apps/api

- Fastify HTTP server
- JWT authentication
- Setup wizard endpoints
- Socket.IO server
- Dependency assembly
- Lifecycle management and graceful shutdown

### apps/web

- Material UI application shell
- Login page
- First-run setup wizard
- Dashboard shell for farm operations
- Real-time client for future Socket.IO streams

### packages/shared

- Zod schemas
- DTOs and request contracts
- Shared enums and validation rules

### packages/database

- Prisma schema
- Prisma client factory
- Persistence boundary for services

### packages/broker-core

- Typed internal event bus
- Provider contracts
- Broker-wide event topics

### packages/protect-client

- Provider interface for UniFi Protect
- Connection lifecycle contract
- Health and discovery contract

### packages/ui

- Shared SCADA-style design tokens for the web UI

## Phase boundaries

### Phase 1

- Build the monorepo and control plane
- Ship setup wizard, login, dashboard shell, and persistence model
- Define provider seams without implementing full Protect transport

### Phase 2

- Implement Protect authentication, bootstrap, WebSocket, and resync logic
- Persist device inventory and live state

### Phase 3+

- Live widgets, relay control, rules, notifications, diagnostics, backup, and update flows

## Operational notes

- The API is the only component that communicates with providers.
- Sensitive provider credentials are encrypted before storage.
- Instance secrets are generated automatically and stored locally by the application, not edited by the user.
- Browser clients receive live updates only through Socket.IO; polling is intentionally avoided.
