# 09 — Validation Evidence model

Version: 1.0
Principle: **a result without evidence is not a result.**

---

## 1. Evidence classes

| Class | Artifacts | Produced by |
|---|---|---|
| Visual | screenshot (PNG), video (WebM), Playwright trace | browser journeys |
| Network | HAR, redacted request/response pairs | browser + API journeys |
| QR | rendered QR image, Y4M fake-camera input, decoder trace, parsed payload | QR journeys |
| Financial | pre/post balance snapshots, ledger extract, double-entry proof | every money journey |
| Document | receipt PDF, verification result | receipt journeys |
| Integration | webhook payload + headers (redacted), sink transcript | webhook journeys |
| Email | sanitized metadata, template identity | email journeys |
| Package | SDK install log, external-consumer runtime output | SDK journeys |
| Platform | build reports, `flutter analyze`, iOS/Android build logs | parity journeys |
| System | service logs, application logs for the run window | all |

## 2. Storage layout

```
sandbox/
  BZV-20260918-0001-0cdc05a2/
    run-manifest.json
    health-preflight.json
    S06/
      S06-COL-001/
        screenshots/   01-cobrar.png  02-split.png  03-qr.png  04-paid.png
        video/         journey.webm
        traces/        playwright.zip
        qr/            produced.png  camera-input.y4m  decoded.json
        api/           requests.jsonl        (redacted)
        ledger/        pre.json  post.json  postings.json
        receipts/      BZM-7K2M-9P4Q-3R8T.pdf  verification.json
        evidence-manifest.json
    defects/
      DEF-20260918-0003.json
    run-result.json
```

The run id carries the revision (`-0cdc05a2`) so an evidence directory is
self-identifying even when detached from the registry — this is the reason the
[10](10-run-resource-retention.md) §1 format adds it to the prompt's proposal.

## 3. Evidence Manifest

`evidence-manifest.json`, one per journey, every artifact represented:

```json
{
  "manifest_version": 1,
  "run_id": "BZV-20260918-0001-0cdc05a2",
  "suite_id": "S06",
  "journey_id": "S06-COL-001",
  "artifacts": [
    {
      "artifact_id": "S06-COL-001/qr/produced.png",
      "capability_id": "CAP-COLLECT-001",
      "artifact_type": "qr_image",
      "path": "S06/S06-COL-001/qr/produced.png",
      "sha256": "…",
      "bytes": 14203,
      "created_at": "2026-09-18T01:22:41Z",
      "redaction": { "applied": false, "reason": "no secret-bearing content" },
      "source": "app-banzami-web-business /business/cobrar",
      "description": "Collection share QR as rendered to the merchant"
    }
  ],
  "manifest_sha256": "…"
}
```

`manifest_sha256` is computed over the artifact list with the field itself
excluded, and the run-level `run-result.json` records every journey manifest
hash. That makes the evidence set tamper-evident as a whole, not merely
file by file.

## 4. Redaction — mandatory, automatic, fail-closed

Redacted before an artifact is ever written:

JWT · session cookie · CSRF token · PIN · password · TOTP seed and code ·
OTP · API key (`bz_sandbox_…`, `bz_live_…`) · publishable key ·
webhook secret · `banza-signature` value · email-provider key · database
credentials · internal auth headers (`X-Internal-Key`, `core_internal_key`) ·
proof signing key.

Two rules that make this real rather than aspirational:

1. **Redaction runs at the writer, not at upload.** An unredacted artifact
   never exists on disk, so it cannot leak through a crash or a partial run.
2. **A post-run scan re-checks every artifact** against the same patterns plus
   the repository's `.gitleaks.toml` shapes. A hit is
   `EVIDENCE_SECRET_LEAK = FAIL` — classified as a **defect of the Validation
   Lab**, not of the product, and it voids the run.

The repository already has `tests/phase0/sanitise.mjs` and nginx proof/query
log-redaction guards; the Lab reuses those patterns rather than inventing a
second redaction vocabulary.

Screenshots are the hard case: a key can be *rendered*. Journeys that display a
one-time key secret mask the element before capture, and the one-time-reveal
journey asserts the masking rather than capturing the value.

## 5. Storage placement

| Where | What | Why |
|---|---|---|
| Object storage (R2) | video, screenshots, traces, HAR, PDFs, Y4M | large, binary, write-once |
| BANZADMIN database | manifest index, artifact metadata, hashes, verdicts | queryable, small |
| Repository (`evidence/`) | **only** curated release evidence, as today | it is version-controlled |

The platform already uses Cloudflare R2 for KYB storage
(`kyb_storage_{endpoint,access_key_id,secret_access_key}`), so no new vendor
decision is required — a separate bucket with separate credentials is enough.
`evidence/` in the repository stays what it is today: 146 curated files, 3.5 MB.
Routine run evidence must never be committed; `tools/e2e/lib/assurance-output.mjs`
already writes generated evidence **outside the worktree**, and that is the
correct precedent.

## 6. Automated vs manual evidence

Two values on a separate axis from the verdict:

```
EVIDENCE = AUTOMATED               the runner produced and hashed it
EVIDENCE = MANUAL_USER_VERIFIED    a person verified it; who, when, what they saw
```

Manual evidence is legitimate — the Collections milestone used it correctly —
but it can never masquerade as automated. Rules:

- a Golden Run targets `AUTOMATED` for every realistically automatable
  capability, and reports the count of `MANUAL_USER_VERIFIED` as a headline
  number, not a footnote;
- a manual record carries the verifying identity, timestamp and an artifact;
- `MANUAL_USER_VERIFIED` never satisfies the coverage invariant for a
  capability whose journey is marked `automation: full`.

## 7. Traceability

```
capability_id ──▶ journey_id ──▶ artifact_id ──▶ sha256
      ▲               ▲               │
      └── manifest    └── catalog     └── object storage key
```

Every `evidence_required` entry on a journey must resolve to at least one
artifact in that run's manifest, or the journey cannot be `PASS` — a green
assertion with no artifact is exactly the state this model exists to prevent.
