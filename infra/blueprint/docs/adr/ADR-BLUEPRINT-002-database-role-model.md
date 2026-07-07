# ADR-BLUEPRINT-002 — Permanent PostgreSQL role model

**Status:** Accepted (Increment 1). **Version:** 1.0

## Context
Structural migrations need owner-level capability; application services need the
minimum; short-lived migration logins must never permanently own objects or hold
broad privileges. This must be identical in every environment.

## Decision
Three logical roles per environment (`base/contracts/database-roles.contract.json`):

- **stable schema owner** — `NOLOGIN`, owns schemas and all migration-created objects,
  never used by application services. The durable ownership context.
- **runtime application role** — `LOGIN`, minimum application privileges (DML + schema
  `USAGE`), no schema ownership, no role administration, no `CREATEDB`, no superuser.
- **migration role** — `LOGIN`, generated per authorised migration operation,
  short-lived (≤24h), `CONNECTION LIMIT 1`, environment-scoped, and **NOSUPERUSER
  NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS**. It acts *through* the stable
  schema owner (role membership / `SET ROLE`) so that objects created by migrations
  remain owned by the stable owner — the migration login never receives permanent
  ownership.

## Rationale
- Plain DML grants are insufficient for structural (`CREATE/ALTER/DROP`) migrations;
  owner-equivalent capability is required, but scoped and ephemeral.
- Ownership stability decouples object ownership from expiring migration logins.

## Consequences
- No blind `GRANT ALL`; no ownership transfer to short-lived logins; no cross-database,
  Production/Live or role-administration capability for the migration role.
- Role names, passwords and URLs are never hard-coded in the repository — they are
  provisioned per environment and injected only through the read-only file interface
  (ADR-BLUEPRINT-003).
