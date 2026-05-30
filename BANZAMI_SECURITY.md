# Security Policy — Banzami

## Reporting a Vulnerability

If you discover a security vulnerability in Banzami, please report it responsibly.

**Do NOT open a public GitHub issue for security vulnerabilities.**

Instead, email: **security@banzami.com**

Include:
- A description of the vulnerability
- Steps to reproduce
- Potential impact assessment
- Any suggested fix (optional)

We will acknowledge your report within 48 hours and provide a timeline for a fix.

---

## Scope

This security policy covers:

**Payment and wallet flows:**
- Transaction authorization and capture flows
- Wallet funding and balance management
- Payout and settlement flows
- QR payment flows (static and dynamic)
- Payment link and payment request flows
- P2P transfer flows

**APIs and authentication:**
- `services/api-gateway` — public API gateway
- `services/public-api` — consumer and merchant APIs
- `services/admin-api` — admin API
- API key management and rotation
- JWT authentication flows
- Webhook signature verification

**Financial data:**
- Ledger integrity
- Wallet balance consistency
- Settlement batch integrity
- Reconciliation accuracy

**Applications:**
- `apps/dashboard` — merchant dashboard
- `apps/admin` — admin portal
- `apps/pay` — pay page
- `apps/checkout` — checkout page

## Out of Scope

- The BANZA protocol specification itself (report protocol vulnerabilities to `github.com/banza-protocol/banza`)
- BanzAI Protocol OS (report BanzAI vulnerabilities to `github.com/banza-protocol/banzai`)
- Third-party services and infrastructure providers
- Social engineering attacks on personnel

---

## Financial Invariant Vulnerabilities

Security issues that could compromise financial invariants are our highest-priority category:

- Any path that allows a ledger entry to be modified after creation
- Any path that allows a balance to go negative
- Any path where `gross_minor ≠ net_minor + fee_minor`
- Any path that allows money to be created without a corresponding external funding event
- Any path that bypasses idempotency and could create duplicate transactions
- Any path that allows sandbox transactions to affect production balances

These are treated as critical severity with immediate response.

---

## Severity Classification

| Severity | Examples | Response time |
|---|---|---|
| **Critical** | Financial invariant bypass, balance manipulation, duplicate transactions | 24 hours |
| **High** | Authentication bypass, unauthorized wallet access, data exposure | 48 hours |
| **Medium** | Privilege escalation within authenticated session, information disclosure | 7 days |
| **Low** | Minor information leakage, rate limiting issues | 30 days |

---

## Responsible Disclosure

We follow a 90-day responsible disclosure policy:
- We will provide a fix within 90 days of acknowledgement for High/Critical issues
- We will coordinate a public disclosure timeline with the reporter
- We will credit reporters who responsibly disclose vulnerabilities (unless they prefer anonymity)

---

## Security Contact

Email: **security@banzami.com**  
PGP: available on request
