# Domain: Consumer Identity

## Business Purpose

Consumer identity is the human-readable layer above raw database UUIDs.

Every end-user has a unique **handle** — a short string like `@carlos` or `@mercearia_kilamba` — that serves as their public payment address. Handles are the entry point for:

- QR code scanning (who receives payment?)
- P2P transfer initiation (send to @handle)
- Transaction history attribution

Consumers never see raw UUIDs in any user-facing flow.

---

## Architecture

```
                    ┌────────────────────┐
                    │  IdentityEngine    │  (trait)
                    │                   │
                    │  create()         │
                    │  get()            │
                    │  get_by_handle()  │
                    │  suspend()        │
                    │  close()          │
                    │  set_badge()      │
                    └────────┬──────────┘
                             │
                    ┌────────▼──────────┐
                    │ IdentityRepository│  (trait)
                    └────────┬──────────┘
                             │
                    ┌────────▼──────────┐
                    │  PostgreSQL        │
                    │  consumers         │
                    └───────────────────┘
```

### Handle validation rules

- 3–30 characters
- Only lowercase letters (`a-z`), digits (`0-9`), and underscores
- Cannot start or end with `_`
- No consecutive underscores (`__`)
- Reserved keywords blocked: `admin`, `banzami`, `support`, etc.

Handles are **normalized before storage**: leading `@` stripped, lowercased, trimmed.

---

## Status Lifecycle

```
ACTIVE → SUSPENDED → ACTIVE
       → CLOSED    (terminal)

Closed → Suspended: INVALID (raises InvalidStatusTransition)
```

---

## Verification Badge

An optional admin-assigned trust signal attached to a consumer identity.

| Value | Display | Meaning |
|-------|---------|---------|
| `CONSUMER` | Gold "Verificado" pill | Verified individual |
| `MERCHANT` | Blue "Comerciante" pill | Verified business / merchant account |
| `NULL` | No badge shown | Default — not yet verified |

Badges are set exclusively by admins via `PATCH /admin/v1/consumers/{id}/badge`. Consumers cannot self-assign a badge.

The badge is returned on every consumer profile response (`GET /v1/me`, register, list) and displayed on the profile screen in the mobile app. It has no effect on payment permissions or wallet access — it is a trust signal only.

**Seed:** `@fm65` (platform founder) is seeded with `CONSUMER` by default (migration `0020`).

---

## Invariants

1. **Handle uniqueness**: enforced at both application layer (validation) and DB layer (UNIQUE constraint).
2. **Normalization before write**: handles are always lowercased before insert — `@Carlos` and `carlos` refer to the same identity.
3. **Closed is terminal**: once closed, an identity cannot be suspended or re-activated. A new identity must be created.
4. **No raw UUIDs in public flows**: all public-facing payment flows resolve handles to IDs server-side.
5. **Badge is admin-only**: `verification_badge` is set only via the admin API; the consumer API exposes it read-only.

---

## Failure Scenarios

| Error | Cause | Action |
|-------|-------|--------|
| `HandleTaken` | Duplicate registration | Return 409 Conflict |
| `InvalidHandle` | Validation failure | Return 400 with rule description |
| `NotFound` | Unknown consumer ID | Return 404 |
| `HandleNotFound` | Unknown handle | Return 404 |
| `InvalidStatusTransition` | Closed → Suspended | Return 422 |

---

## API Endpoints

### Core API (internal, Rust)

| Method | Path | Description |
|--------|------|-------------|
| `POST`  | `/internal/v1/consumers` | Create consumer identity |
| `GET`   | `/internal/v1/consumers/:id` | Get by UUID |
| `GET`   | `/internal/v1/consumers/handle/:handle` | Get by handle |
| `GET`   | `/internal/v1/consumers?handle=` | List (with optional handle filter) |
| `POST`  | `/internal/v1/consumers/:id/suspend` | Suspend |
| `POST`  | `/internal/v1/consumers/:id/close` | Close (terminal) |
| `PATCH` | `/internal/v1/consumers/:id/badge` | Set or remove verification badge |

### Admin API (Go)

| Method | Path | Description |
|--------|------|-------------|
| `GET`   | `/admin/v1/consumers` | List consumers |
| `GET`   | `/admin/v1/consumers/{id}` | Get by UUID |
| `PATCH` | `/admin/v1/consumers/{id}/badge` | Assign or remove verification badge |

---

## Security Considerations

- Handles are **public** — they are safe to display and share.
- Consumer UUIDs are **internal** — never expose in user-facing surfaces.
- Suspended consumers cannot initiate transfers but can still receive funds (wallet is unaffected).
- Closed consumers have their wallets frozen by convention (enforced at the wallet level, not identity level).
- `verification_badge` is read-only from the consumer's perspective — only admin-key-authenticated requests can set it.
