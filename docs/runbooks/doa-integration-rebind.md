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

`@doa` was created through the ordinary public onboarding flow — application,
activation, auth — not by writing rows.

| | |
| --- | --- |
| handle | `@doa` |
| merchant id | `a779d287-8422-4d0f-b6af-6f392720f8e4` |
| wallet id | `0271d995-734f-49c4-931f-5f47ee89534f` |
| primary account id | `48ebb417-292a-4c99-865b-52ec6afd7a27` |
| business account type | `APPLICATION` |
| KYB | `APPROVED` |
| pricing profile | `sandbox-reference` |
| settlement ready | yes, no blockers |

Its rates, read back from `GET /v1/business/me`:

```
SETTLEMENT  200 bps   sandbox-reference-settlement
PAYOUT       75 bps   sandbox-reference-payout
```

The activation PIN was written to a local file during provisioning and is not
recorded here. Without it the account cannot be signed into again.

**Nothing about DOA is special.** It carries the same profile any owner can be
assigned, and `settlement-economics-e2e.sh` proves an ordinary owner on that
profile is charged an identical fee and net — differential zero. There is no
DOA branch anywhere in the runtime.

---

## Not done, and why

**No API key and no webhook secret were created.** Creating a live credential
that no consumer holds is how unused authority accumulates, and it cannot be
installed in DOA from here anyway. They are issued in the window below, at the
moment they can be installed.

---

## The window

Everything here needs DOA's production Supabase and Vercel, which this session
must not reach without an explicit maintenance window.

**1. Issue the credentials** (Banzami side, mine)

A fresh Developer API key with exactly the scopes DOA needs, and a webhook
endpoint with a fresh signing secret — both through the public Developers
lifecycle, not operator-minted.

**2. Install them** (yours)

`BANZAMI_API_KEY` and `BANZAMI_WEBHOOK_SECRET` in DOA's Vercel environment, then
redeploy. The old values are dead: their key is revoked and their merchant no
longer exists.

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
