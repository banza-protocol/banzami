# Public Sandbox containment — RA-056 · RA-057 · RA-058 (HISTORICAL)

> **This containment no longer exists and must not be reinstated.**
>
> It was a temporary edge quarantine that protected the public Sandbox between
> 2026-08-31 21:35 UTC and 2026-09-01 13:27 UTC, while three confirmed
> cross-tenant defects were fixed but undeployable — GitHub Actions could not
> allocate runners, so the corrected code could not pass CI or be released.
>
> **It was removed on 2026-09-01** after the corrected build was deployed and the
> negative tests passed with the rules gone. RA-056, RA-057 and RA-058 are CLOSED
> and enforced by the application and core, not by nginx.
>
> The nginx rules themselves are deliberately **not** preserved. They would now
> block routes that are fixed, so a dormant copy is a deployment hazard rather
> than a safeguard — which is why the branch that held them was deleted rather
> than merged. What is worth keeping is the reasoning below: how exposure was
> contained without pretending it was fixed, and how the four states were kept
> apart.

---

- **Applied:** 2026-08-31 21:35 UTC · **Runtime at time of containment:** `4430e62db9c2`
- **Scope:** public Sandbox edge only. Production routing, Origin Rules, Full (strict) and LIVE configuration untouched.

## State — four things, not one

| | |
|---|---|
| **Implementation fix** | *(then)* NOT DEPLOYED — PR #94 unmerged · **(now) merged and deployed** |
| **CI validation** | *(then)* BLOCKED — no runners · **(now) 8/8 with real runners**, PRs #94/#95/#96/#97 |
| **Public exposure** | *(then)* CONTAINED at the edge · **(now) not contained — not needed** |
| **Deployed closure** | *(then)* NOT ACHIEVED · **(now) ACHIEVED**, runtime `866c1cfe9b2c` |

The application behind this proxy is **still vulnerable**. No finding may be
closed on the strength of these rules. Findings stay **FIX READY / MITIGATED IN
DEPLOYED SANDBOX**.

## Why an edge rule at all

A fix that exists only in a branch does not protect a running system. Three
confirmed cross-tenant defects — two critical — were publicly reachable, and the
normal release path was unavailable through no fault of the code. Containing
exposure is the reversible action; merging past a CI blackout is not.

## Rules applied

`infra/nginx/sandbox-edge.conf.template`, `sandbox-api.banzami.com` server block.

| Finding | Contained | Left up |
|---|---|---|
| RA-058 | `^~ /v1/consumer-wallets` (whole group) | `/consumer/v1/me/wallet*` — the consumer's own wallet, a different location |
| RA-057 | `^~ /v1/payment-requests` (whole group) | — every route in it was defective |
| RA-056 | `POST /v1/payouts`; `~ ^/v1/payouts/.` (read by id) | `GET /v1/payouts` — the caller's own list, correctly scoped |

**404, not 403** — matching the `/internal/` convention already in this file: a
403 confirms the path exists. The body carries no finding id, no reason, and
nothing about who was affected.

Payout creation is contained rather than narrowed further because the defect is
in *which wallet* the caller may name, which the edge cannot evaluate.
CAP-PAYOUT-001 is `pending-e2e` and not a released capability, so no released
surface is withdrawn.

## Verified after applying

Contained (all **404**): payout create with a foreign wallet · payout read by id ·
payment-request create · payment-request pay · consumer-wallet resolve by
`consumer_id` · consumer-wallet balance by id.

State assertions: merchant A `50000 → 50000` · consumer `0 → 0` · **no payout
created** against A (own list, n=0).

Still working: `/health` · `/readyz` · merchant auth · own payout list ·
`/v1/business/me` · consumer's own wallet balance · **CAP-PAY-001 24/24** ·
**CAP-PAY-002 38/38** · **CAP-PAY-003 partial 26/26** · RA-053 mitigation intact
(`/v1/qr/pay` → 405).

## Rollback

Delete the block marked `TEMPORARY SECURITY CONTAINMENT` from the template, then:

```
scp infra/nginx/sandbox-edge.conf.template root@<host>:/srv/banzami/sandbox-edge/templates/
docker exec bzsbedge-sandbox-edge sh -c 'envsubst "$SB_PUBLIC_API $SB_DEVELOPER_API $SB_GATEWAY" \
  < /etc/nginx/templates/sandbox-edge.conf.template > /etc/nginx/conf.d/sandbox-edge.conf && nginx -t'
docker exec bzsbedge-sandbox-edge nginx -s reload
```

Timestamped backups of the previous template are on the host beside it. Nothing
else in the file changed and no service depends on these rules existing.

## Removal order — deliberate

```
containment active  →  corrected build deployed  →  negative tests PASS
                    →  remove containment  →  negative tests PASS AGAIN
```

That last step is the point: it shows the repair lives in the application and
core authority layer, not in nginx.

---

## CI blocker — diagnosis as far as permissions allow

Every job: `runner_name` empty, `runner_group` null, `labels=["ubuntu-latest"]`,
`steps=0`, `started_at == completed_at` to the second. Jobs are created and never
scheduled. A re-run watched for six minutes executed **zero** steps.

**Ruled out**

| Candidate | Evidence |
|---|---|
| Code/test failure | `steps=0` — nothing ever ran; no job logs exist to fetch |
| Repo Actions disabled | `enabled=true` |
| Repo action restrictions | `allowed_actions=all` |
| GitHub-wide Actions incident | githubstatus.com: Actions **operational**, no active incidents |

That last check matters: it moves the cause from "GitHub is down" to
**something specific to this account or organisation**.

**Cannot be read with the available token**

| Candidate | Boundary |
|---|---|
| Org Actions policy | `GET /orgs/banza-protocol/actions/permissions` → **403, needs `admin:org`** |
| Billing / spending limit | `.../settings/billing/actions` → **410 moved**, and needs `admin:org` |

### Confirmed cause — GitHub's own annotation

The job-level annotation API returns the reason without `admin:org`:

> *"The job was not started because recent account payments have failed or your
> spending limit needs to be increased. Please check the 'Billing & plans'
> section in your settings"*

```
gh api repos/banza-protocol/banzami/check-runs/<job_id>/annotations
```

So this is **billing**, not an organisation runner policy and not a workflow
defect. Two possibilities remain, both on the same page: a **failed payment
method**, or an **exhausted spending limit**. Checking whether standard
GitHub-hosted runners were disabled at org level is unnecessary — they were not.

**External action required (org owner):**
`github.com/organizations/banza-protocol/settings/billing` → *Billing & plans* —
verify the payment method is valid, then the Actions spending limit / budget
(a budget with "stop usage when limit is reached" produces this same result).

**Not done, deliberately:** making the repository public to get free Actions,
installing a self-hosted runner to get one PR through, removing or weakening
checks, or an administrative merge. Each would change the architecture or the
release process to work around a billing condition, and the defects would still
be undeployed either way.

**Re-entry criterion, unchanged:** jobs must show a real runner, executed steps,
and green conclusions. Only then merge → deploy → deployed verification → remove
containment → re-verify.

---

## Outcome (2026-09-01)

The removal order held, and the last step is the one that mattered:

```
containment active → corrected build deployed → negative tests PASS
                   → containment REMOVED → negative tests PASS AGAIN
```

With the rules gone, the authority suite runs **18/18** against the public
Sandbox, and the same assertions were also run straight at the gateway with nginx
bypassed. Neither result depends on the perimeter, which is what proves the
repair lives in the application.

Two defects in the fix itself surfaced only at this stage: the RA-056 authority
refusal was correct from the first commit but surfaced as HTTP 500, then 502,
before reaching 404 (PRs #95, #96). A green CI could not see either.
