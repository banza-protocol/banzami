# Banzami Institutional Separation Report

**Mission:** BANZAMI-INSTITUTIONAL-SEPARATION-001  
**Date:** 2026-05-30  
**Decision:** Banzami is separated institutionally from the BANZA protocol organization.

---

## Decision Summary

Banzami is now explicitly defined as:

- An **independent commercial startup**
- A **reference operator** built on the BANZA protocol
- **Not part of** the BANZA protocol organization (`github.com/banza-protocol`)
- Hosted at: `github.com/banzami/banzami`
- Product domain: `banzami.com`
- Contact: `contact@banzami.com` / `security@banzami.com`

---

## Old Location

```
github.com/banza-protocol/banzami
```

## New Location

```
github.com/banzami/banzami
```

---

## GitHub Actions Required (manual — cannot be done via API without admin:org scope)

### Step 1 — Create the Banzami GitHub organization

Go to: **https://github.com/organizations/new**

Set:
- **Organization name:** `banzami`
- **Contact email:** `contact@banzami.com`
- **Plan:** Free (upgrade later if needed)

Then in organization Settings → Profile:
- **Display name:** Banzami
- **Description:** Angola's instant payment startup. Reference operator built on the BANZA protocol.
- **URL:** https://banzami.com
- **Email:** contact@banzami.com

### Step 2 — Transfer the repository

Go to: **https://github.com/banza-protocol/banzami/settings**

Scroll to "Danger Zone" → **Transfer ownership**

- **New owner:** `banzami`
- Repository name stays: `banzami`
- Confirm by typing: `banzami/banzami`

After transfer: `github.com/banzami/banzami` is live.

### Step 3 — Update local remote

```bash
cd ~/banzami
git remote set-url origin https://github.com/banzami/banzami.git
git remote -v   # verify
git fetch origin
git push origin main  # confirm access
```

---

## Files Updated in This Repo

### Go module paths (61 files)

All three Go services had their module paths updated:

- `services/api-gateway/go.mod` — `module github.com/banzami/banzami/services/api-gateway`
- `services/admin-api/go.mod` — `module github.com/banzami/banzami/services/admin-api`
- `services/public-api/go.mod` — `module github.com/banzami/banzami/services/public-api`
- 58 Go source files — all internal imports updated

### Domain references (99 files)

`banzami.org` → `banzami.com` across all active files:
- All `.md` documentation files
- All `.go` source files with email templates
- All `.ts`/`.tsx` frontend files
- All `.yml`/`.json` configuration files
- `.env` environment template
- `.github/` issue templates

### Identity documents

- `CLAUDE.md` — Institutional identity section added; protected names section updated to reflect active canonical names
- `README.md` — Framed as independent startup; new org URL
- `docs/BANZA_REFERENCE.md` — Institutional note added

---

## Verification

```bash
# Go module paths clean
grep -r "banza-protocol/banzami" services/ --include="*.go" --include="*.mod"
# → 0 results

# Domain references clean (outside historical docs)
grep -r "banzami\.org" . --include="*.md" --include="*.go" --include="*.ts"
# → 0 results (outside docs/migration/ and docs/audit/)

# Go services compile
cd services/api-gateway && go vet ./...  # EXIT 0
cd services/admin-api && go vet ./...    # EXIT 0
cd services/public-api && go vet ./...   # EXIT 0

# Rust core compiles
cd core && SQLX_OFFLINE=true cargo check --workspace  # EXIT 0
```

---

## Remaining References

The following references are intentionally preserved as historical records:

- `docs/migration/` — All migration reports documenting the old `banza-protocol/banzami` path
- `docs/audit/` — All audit reports referencing old domain/org state
- Rust crate names (`banzami-types`, `banzami-ledger`, etc.) — deferred, out of scope

---

## Migration Risks

| Risk | Mitigation |
|------|-----------|
| GitHub auto-redirects `banza-protocol/banzami` to `banzami/banzami` for 30 days after transfer | Update all bookmark and CI links within 30 days |
| Deploy keys may not transfer — verify SSH access post-transfer | Re-add deploy key to new org repo if needed |
| GitHub Actions secrets do not transfer automatically | Re-add `DEPLOY_SSH_KEY`, `DEPLOY_HOST`, `DEPLOY_USER` in new org |
| Go module proxy may cache old paths | `go mod download` after transfer; module proxy caches by content hash, not org name |
| CI workflows reference repo — update if hardcoded org name | Check `.github/workflows/ci.yml` for hardcoded org references |

---

*Produced by: BANZAMI-INSTITUTIONAL-SEPARATION-001 — 2026-05-30*
