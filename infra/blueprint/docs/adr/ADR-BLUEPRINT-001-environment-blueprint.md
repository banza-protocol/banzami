# ADR-BLUEPRINT-001 — One Environment Blueprint, isolated Sandbox and Live profiles

**Status:** Accepted (Increment 1). **Version:** 1.0

## Context
Banzami needs a durable, reusable deployment model. Sandbox and a future Live must
share one logical architecture and operational contract, yet be provably isolated so
that Sandbox can never touch Live and Live can never inherit Sandbox resources.

## Decision
Adopt a single **Environment Blueprint** (`infra/blueprint/base`) that defines the
shared logical model, plus per-environment **profiles** (`profiles/sandbox`,
`profiles/live`) that carry only environment-specific, non-secret bindings.

The base defines and freezes as shared: service topology, image build process,
immutable image identity/provenance, PostgreSQL major version, database role
separation, secret-injection interface, migration-runner contract, migration receipt
lifecycle, migration lock model, health semantics, application rollback semantics and
the sanitised audit/reporting model.

Profiles may differ only in: environment identifier, resource sizing, network
identifiers, secret-provider backend, domains/certificates, observability
destination, backup/retention policy, approval policy and external-integration
binding. Everything in the *never-share* set (hosts, networks, database instances,
volumes, secret roots, credentials, runtime identities, receipt/authorisation/rollback
roots, logs, backups, domains, integrations) must have distinct values per profile.

Live is deployed in a **separate infrastructure boundary** and remains unprovisioned
in this repository.

## Rationale
- Parity by construction: one model, two instantiations — no drift between Sandbox and
  Live behaviour or contracts.
- Isolation by construction: a static validator (`make check-blueprint`) proves the
  profiles share no isolation resource and never cross-reference, so Sandbox values
  cannot be promoted into Live.

## Consequences
- New environments are added as profiles, not forks.
- Static validation gates any accidental resource sharing or Live provisioning.
