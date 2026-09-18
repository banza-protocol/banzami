# 26 — B10: the one owner ceremony

Version: 1.0
Status: **awaiting the owner** · 5 of 9 actors provisioned
Blocks: `VALIDATION_ACTOR_COUNT=9`, `VALIDATION_VOLUME_BUDGET_PREFLIGHT_WITH_ACTORS`,
and therefore `BANZAMI_VALIDATION_STUDIO_PHASE_B=COMPLETE`.

---

## 1. What is done, and what is not

| Actor | State | How |
|---|---|---|
| `C01` `C02` `C03` | **provisioned, HEALTHY** | `POST /v1/auth/register` — handle + full name + PIN, no operator, no email |
| `D01` `D02` | **provisioned, HEALTHY** | Console OTP sign-in (Resend readback) → workspace → project |
| `B01` `B02` `B03` | **blocked** | an application must be APPROVED by an operator |
| `A01` | **blocked** | creating an operator requires an operator, plus a step-up |

Nothing was inserted into a database. Every identity above came through the
product's own door, and each PIN was proven by signing in with it afterwards.

## 2. Why the remaining four are one boundary, not four

```
POST /admin/v1/operators                         CapOperatorManage + stepUp
POST /admin/v1/merchant-applications/{id}/approve  CapApplicationApprove
```

`stepUp` is `RequireStepUp(auth.StepUpWindow)` — a second-factor proof within
the last five minutes. So **creating the first validation operator requires an
operator who can already prove a second factor**, and the only `ACTIVE` operator
on the Sandbox is the owner's own account (`fidel.monteiro@banzami.com`,
SUPER_ADMIN, MFA confirmed; the other four are SUSPENDED proof fixtures).

`B01`–`B03` are blocked *through* `A01`: an application can only be approved by
an operator holding `CapApplicationApprove`. Once `A01` exists, it approves them
through the ordinary operator path with no further owner involvement.

The gateway does expose `/internal/v1/merchant-applications/{id}/approve` behind
the service key. **It was not used and must not be.** It exists so admin-api can
reach Core, not so a harness can skip the KYB decision — using it would be
exactly the merchant-lifecycle bypass the B10 brief forbids.

## 3. The ceremony

Performed once, by the owner, in BANZADMIN.

### Step 1 — create `A01`

```
admin.banzami.com → Operadores → novo operador
  email  a01-validation@<a mailbox you control>
  role   SUPER_ADMIN        (it must create Businesses and approve applications)
```

This asks for your step-up code. That prompt is the boundary.

### Step 2 — enrol `A01`'s TOTP and capture the seed

Sign in as `A01`, then enrol. `MFAService.BeginEnrolment` returns the secret
**once, in plaintext**, with its provisioning URI. Capture it — after
confirmation it is never shown again.

```bash
# On the Sandbox host, as root. 0700 directory, 0600 files — the same place
# the other operator secrets already live.
printf '%s' '<TOTP secret>'      > /root/.banzami/validation/a01_totp_seed
printf '%s' '<A01 password>'     > /root/.banzami/validation/a01_password
printf '%s' '<recovery codes>'   > /root/.banzami/validation/a01_recovery_codes
chmod 600 /root/.banzami/validation/a01_*
```

Then discard every other copy. From this point the Studio computes
`TOTP(seed, now)` for `/auth/mfa/verify` and `/auth/step-up`, and **no routine
run needs a person again** — including the highest-risk operator routes, whose
five-minute step-up window is the same computation.

BANZADMIN MFA is not weakened: `A01` carries a real confirmed factor like every
other operator. What changes is only who holds the seed.

### Step 3 — tell me it is done

I then complete B10 unattended:

1. submit the three Business applications (`@e2eb01`, `@e2eb02`, `@e2eb03` —
   all three confirmed available);
2. approve each as `A01` through `POST /admin/v1/merchant-applications/{id}/approve`;
3. complete activation and set each PIN, storing it as `validation/b0N_pin`;
4. record the merchant, wallet and account ids in the actor registry;
5. re-run actor health with `--probe` for all nine;
6. re-run the volume preflight, now with real per-merchant windows.

## 4. One quota caveat

`application-submit` is **30 per 24h per IP**, and my origin's allowance is
already spent by ordinary harness traffic (`ZCARD` 30/30, TTL ≈ 15h). The three
submissions will therefore come from the Sandbox host itself, which has 29
remaining — the same public endpoint and the same lifecycle, from operator
infrastructure rather than a workstation.

This is worth noticing beyond the workaround: a shared IPv6 /64 can exhaust the
daily allowance for everyone behind it, which is precisely the cost that
persistent actors exist to stop paying every run.

## 5. What provisioning has cost so far

```
merchant-credit volume burnt   0            (no merchant was credited)
aggregate funds                6 532 600 → 9 532 600
```

The Kz 30 000 is three × Kz 10 000 `registration-grant`, which Sandbox
**consumer registration grants automatically**
(`services/public-api/internal/handler/auth.go:130`). It is a product feature,
not an action taken here, and it consumes the funds cap — which retirement can
reverse — rather than the one-way merchant-credit windows.
