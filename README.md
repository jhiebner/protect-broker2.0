# Protect Broker

Protect Broker is a self-hosted appliance for monitoring and controlling UniFi Protect devices from a farm-focused dashboard.

## Phase 1 scope

- Monorepo workspace with API, web, and core packages
- Fastify API foundation with REST and Socket.IO wiring
- Prisma schema and database package
- JWT and administrator bootstrap flow
- First-run setup wizard shell
- SCADA-inspired dashboard shell
- Provider boundary for future UniFi Protect integration

## Workspace layout

```text
protect-broker/
  apps/
    api/
    web/
  packages/
    protect-client/
    broker-core/
    database/
    shared/
    ui/
  docs/
  scripts/
```

## Development prerequisites

- Node.js 22 LTS or later
- PostgreSQL 16 or later

## Planned flow

1. Start PostgreSQL and set `DATABASE_URL`.
2. Install dependencies with `npm install`.
3. Generate Prisma client with `npm run prisma:generate -w @protect-broker/database`.
4. Run migrations with `npm run db:migrate`.
5. Start the app with `npm run dev`.

The current workspace was scaffolded without executing those steps because Node.js is not installed in the local editor environment.

## Appliance installation

On Debian 12, the target flow is a single installer command:

```bash
sudo ./scripts/install-debian.sh
```

The installer is designed to:

- Install Node.js 22 LTS
- Install PostgreSQL locally unless an external database URL is provided
- Copy the application into `/opt/protect-broker/current`
- Create a dedicated `protect-broker` service account
- Write the systemd environment file in `/etc/protect-broker/protect-broker.env`
- Build the workspace, run Prisma generate and migrations, and enable the systemd service

Optional flags:

- `--external-db-url <url>`
- `--hostname <host>`
- `--port <port>`
- `--skip-system-upgrade`

After installation, ongoing configuration is intended to happen through the browser-based setup wizard.

