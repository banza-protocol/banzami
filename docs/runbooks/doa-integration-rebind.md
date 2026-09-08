# Rebinding DOA after the Sandbox reset

**Version:** 1.0

The Banzami Sandbox was destroyed and rebuilt on 2026-09-07. Every Banzami
resource DOA held went with it — merchant, wallet, campaign accounts, API key,
webhook endpoint, payment sessions. That was the intent: none of it was
preserved, no identifier was recreated, and nothing was backfilled.

The Banzami side has been rebuilt. The DOA side has not, and cannot be from
here: DOA stores Banzami identifiers in its production Supabase, and this
session has no authorisation to reach it.

---

## Already done, on the Banzami side

DOA was rebuilt through the **public Developers Console**, the same lifecycle any
external developer uses — sign in, workspace, project, financial environment,
API key. No operator route, no fixture, no SQL.

| | |
| --- | --- |
| workspace | `DOA` |
| project | `DOA Sandbox` · `2515de46-f73d-42c5-8de8-ff8588821d33` |
| financial owner | `8565edf9-b128-4a0d-ae6d-beeaf652a233` — provisioned by the project's own Financial Setup |
| business account type | `MERCHANT` |
| pricing profile | `sandbox-default` (settlement 0 bps, payout 75 bps) |
| API key | 10 scopes, installed in DOA's Vercel production as `BANZAMI_API_KEY` (Sensitive) |

Scopes granted: `identity:read`, `payment_sessions:write`, `payment_sessions:read`,
`wallet_accounts:create`, `wallet_accounts:read`, `refunds:write`, `refunds:read`,
`customers:read`, `webhooks:write`, `webhooks:read` — exactly what DOA's code
calls. `application_settlements:write` is deliberately **not** granted: nothing
in DOA creates a settlement, and it is the scope that pays money out.

### Corrections to the previous version of this runbook

An earlier revision recorded a `@doa` Business Account (`a779d287-…`, wallet
`0271d995-…`, `APPLICATION`, KYB `APPROVED`, `sandbox-reference`). **No such
merchant exists in the Sandbox database.** It was created against a different
cluster during the period when two databases shared the name `banzami_staging`;
the cluster-identity gate now makes that mistake impossible, but the record it
produced was wrong and is removed rather than left to be trusted.

Nothing about DOA is special. It is an ordinary Console tenant, on the profile
every self-provisioned project gets, with no DOA branch anywhere in the runtime.

---

## Not done, and why

**The webhook endpoint is not registered.** It cannot be done from here: the
Console can list endpoints, events and deliveries but cannot create one, and the
key that could create it is Sensitive in Vercel and unreadable. The one command
that does it lives in DOA's own repository — see the window below.

**The pricing profile is `sandbox-default`, not `sandbox-reference`.** Assigning
a profile is an operator decision, and BANZADMIN could not make it until now:
`PUT /admin/v1/merchants/{id}/pricing-profile` exists but admin-api is a
Stage-D-gated surface and has not been deployed. Until then DOA settles at 0 bps,
which is a configured price rather than a missing one.

## The window

Everything here needs DOA's production Supabase and Vercel.

**1. Register the webhook endpoint** (yours, one command)

```bash
cd ~/doa && npm run banzami:webhook
```

It asks for the project key once without echoing it, subscribes the endpoint to
exactly the events `apps/web/app/api/webhooks/banzami/route.ts` handles, and
pipes the signing secret straight into `vercel env add BANZAMI_WEBHOOK_SECRET
production`. Neither secret is printed, stored or passed as an argument.

**2. Redeploy** (yours)

From the Vercel dashboard — never `vercel deploy --prod` from `~/doa`. An
environment variable only takes effect on the next production deployment.

**3. Rebind DOA's stored Banzami identifiers** (yours, or mine with access)

DOA's Supabase holds these columns, and every value in them now points at
something that was destroyed:

| column | what it held |
| --- | --- |
| `banzami_wallet_account_id` | one per campaign — the segregated account donations were credited to |
| `banzami_recipient` / `banzami_recipient_type` | the settlement beneficiary |
| `banzami_refund_id` | references to refunds that no longer exist |

For each currently active campaign, a new wallet account is created through the
public SDK/API against wallet `0271d995-…`, and the campaign's
`banzami_wallet_account_id` is set to the new id. **Do not recreate the old
UUIDs.** Historical rows whose Banzami counterpart is gone should be cleared
rather than left pointing at nothing — a dangling identifier that still looks
valid is worse than a null.

**4. The 269 payment links are dead.** Their sessions were destroyed with the
database. Any campaign that needs a live link gets a fresh session; there is no
way to revive the old URLs and no attempt should be made to.

---

## After the window

Two things prove the integration is whole, and neither can run before it:

```bash
tests/phase0/doa-public-donation-e2e.sh     # a donation credits the campaign account GROSS
tests/phase0/settlement-economics-e2e.sh    # DOA and an ordinary owner, same plan, differential zero
```

The second already passes with two ordinary owners. Running it with DOA as one
of them is what turns "DOA is not special" from a code audit into a measurement.
