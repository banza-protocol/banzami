# Pricing Model V2 — applying the migration

**One command, at your terminal.** Everything else in the V2 cutover is done.

This step is not automatable and deliberately so: `rt04e-secure-rollout.sh`
calls `require_tty()` — *"a direct interactive TTY is required for operator
authorisation — refusing (no non-interactive stream)"* — and a caller-provided
database credential in the environment is explicitly forbidden. The only intake
is a hidden `read -rs` from your terminal.

Applying the migrations with `psql` instead is what created the 0090–0095
history drift that `tools/sqlx-backfill.sh` is disabled for. Please do not.

---

## What it applies

| migration | what it does | reversible harm if re-run |
| --- | --- | --- |
| 0106, 0107 | **already applied, never recorded.** Their schema effects are present on the deployed Sandbox but absent from `_sqlx_migrations`. Both are idempotent (`ADD COLUMN IF NOT EXISTS`, every `CREATE TRIGGER` preceded by `DROP TRIGGER IF EXISTS`), so re-running them changes nothing and finally records them. This is the reconciliation. | none |
| 0108 | seeds the withdrawal rule durably. The rule already exists by hand; the insert is guarded and does nothing. | none |
| 0109 | adds `pricing_operation` to rules and a pricing snapshot to `payouts`. Purely additive, all nullable. | none |
| 0110 | seeds explicit per-operation rules, creates `sandbox-reference`, closes the superseded network-wide withdrawal rule's effective window, and adds the uniqueness index that makes ambiguity impossible. | none — every insert is guarded on the resolution key |

**No rate changes for anyone.** Every seeded rate is the one already in force.

---

## Before

The deployed Sandbox is running the transitional baseline. The V2 code is
**not** deployed and must not be until this migration is applied — the new
resolver reads `pricing_operation`, which does not exist there yet.

---

## The command

```bash
cd /srv/banzami/src && \
RT04E_EXECUTION_MODE=migration-only \
BANZAMI_DB_TARGET=banzami_staging \
RT04E_RELEASE_REV=$(git rev-parse HEAD) \
RT04E_CHECKPOINT_CONFIRMED=yes \
RT04E_CHECKPOINT_CAPTURED=yes \
RT04E_BACKUP_CONFIRMED=yes \
RT04E_MIGRATION_ACCESS_APPROVED=yes \
bash infra/deployment/rt04e-secure-rollout.sh
```

It will ask you to type, exactly:

```
AUTHORISE RT04E SANDBOX MIGRATION
```

and then prompt for the Sandbox migration credential with hidden input.

Set the four `yes` flags only if each is genuinely true — they are assertions
about the world, not switches to get past a prompt.

---

## After

Two checks, both of which I can run:

```bash
node tools/check-pricing-assignment.mjs
```

Expected: every assigned profile has exactly one explicit rule for **both**
SETTLEMENT and PAYOUT, and `sandbox-default SETTLEMENT` is an explicit zero.

Then the V2 code deploys, in this order:

```bash
./deploy.sh core-api-staging
./deploy.sh api-gateway-staging
```

and the economic smoke runs:

```bash
tools/ops/run-sandbox-smoke.sh tests/phase0/economic-model-smoke.sh
```

---

## If the checkpoint gate refuses

It checks migration order, checksums and forward-only-ness without touching the
database. A refusal there means the repository state is wrong, not the
deployment — send me the message rather than overriding it.
