# Debian 12 Appliance Installation

## Goals

The installer exists to turn a fresh Debian 12 LXC into an appliance-like runtime with one command and no manual file editing afterward.

## Default layout

- Application root: `/opt/protect-broker/current`
- Mutable data: `/var/lib/protect-broker`
- Logs: handled by `systemd` journal
- Environment file: `/etc/protect-broker/protect-broker.env`
- Service user: `protect-broker`
- Service name: `protect-broker.service`

## Supported modes

### Local PostgreSQL

The installer creates:

- Database role: `protect_broker`
- Database: `protect_broker`

### External PostgreSQL

Pass `--external-db-url` and the installer will skip local database provisioning while still running Prisma generate and migrations against the supplied connection string.

## Operational model

- `systemd` owns process startup and restart behavior.
- Secrets and database connection settings are injected through the environment file created by the installer.
- The web app is built once and served by the Fastify API process.
- All post-install application configuration is meant to happen through the UI.
