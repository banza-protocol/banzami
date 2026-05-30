# BANZA — First 100 Builders Roadmap

**Mission:** BANZA-FIRST-100-BUILDERS-001  
**Scope:** How BANZA acquires, activates, and retains 100 technical builders who ship on the platform  
**Date:** 2026-05-30  
**Status:** Official

---

## Definition: What Counts as a Builder

A "builder" is counted when they meet **all three criteria**:

1. **Installed** — has run `npm install @banza/sdk`, `flutter pub add banza_flutter`, or equivalent
2. **Activated** — has made a successful API call to the BANZA sandbox (at least one non-error response)
3. **Shipped** — has published something that uses BANZA: a GitHub repo, a demo app, a deployed integration, a pull request, a blog post with working code, or a shared screenshot of a confirmed payment

The "shipped" criterion prevents counting developers who tried it once and dropped off. A builder is someone who completed something and shared it.

**Tracking signal:** The first two criteria are measurable via sandbox API analytics. The third requires a community signal (GitHub repo created, community post, or self-reported via a form linked from the quickstart's "What next?" section).

---

## Why 100 Builders Before Broad Launch

100 builders is not an arbitrary number. It is the minimum viable developer ecosystem:

- 100 active builders means enough public GitHub repos that a new developer can find examples in their specific use case
- 100 builders creates enough feedback to identify the top 5 friction points in the SDK
- 100 builders produces enough "built with BANZA" content that the platform has social proof before press coverage
- 100 builders means at least a few will become advocates who recruit others without being asked

Trying to go from 0 to 1000 builders without first going through 100 produces a wasteland — broad awareness, shallow engagement, high churn.

---

## Builder Personas (Who the First 100 Are)

| Persona | Estimated share | Description |
|---------|----------------|-------------|
| **Angolan product engineer** | 40% | Builds products that handle money. Currently frustrated with bank APIs or cash. |
| **Hackathon builder** | 25% | Student or early-career. Will build something in 48 hours for a prize or for fun. |
| **Curious developer** | 20% | No specific project. Saw BANZA somewhere, wants to understand how it works. Becomes a builder if the quickstart is good enough. |
| **Integration bounty hunter** | 10% | Developer who builds integrations for recognition or bounty programs. |
| **Protocol explorer** | 5% | Developer interested in the protocol layer itself — will build conformance tools, protocol visualizers, or BanzAI integrations. |

The first 100 skew toward Angolan product engineers and hackathon builders. The outreach strategy must reach these audiences specifically, not generic developer communities globally.

---

## The Three Phases

### Phase 0 — Prerequisites (Before Any Outreach)

**Nothing is announced until these are complete.** Announcing an SDK that is not on npm, or a quickstart that takes 45 minutes, destroys the first impression — permanently.

| Prerequisite | Owner | Done when |
|-------------|-------|-----------|
| `@banza/sdk` published on npm | SDK team | `npm install @banza/sdk` works |
| `banza_flutter` published on pub.dev | SDK team | `flutter pub add banza_flutter` works |
| Sandbox sign-up is self-service (email → key in 30s) | Backend team | Test with new email, no human involved |
| `banza.sandbox.simulateQrPayment` works | SDK + API team | Quickstart `payment.ts` runs end-to-end |
| Pre-seeded consumer demo wallet exists | Backend team | `wlt_sandbox_consumer_demo` has balance |
| Quickstart page is live at banzami.com/docs/quickstart | Docs team | Complete 15-min path verified by external tester |
| BanzAI answers "how do I accept payments in TypeScript?" with SDK reference | BanzAI | Live test |

**Gate:** All prerequisites checked. First outreach only after this.

---

### Phase 1 — First 10 Builders (Weeks 1–2 after launch)

**Goal:** 10 builders who have shipped something. These are not random — they are hand-picked.

#### Acquisition: Hand-to-hand

Do not post publicly yet. Reach out individually to 20–30 developers you already know or have identified:

**Target profiles for first 10:**

| # | Profile | Reach channel |
|---|---------|--------------|
| 1–3 | Angolan developers in your personal network who build payment-adjacent products | Direct message |
| 4–5 | Active members of Angolan developer Telegram/WhatsApp groups (Angola Devs, etc.) | Direct invite |
| 6–7 | Developers who have open-sourced Angolan fintech projects on GitHub | GitHub direct message |
| 8–9 | Flutter developers building Angolan mobile apps (find on pub.dev or GitHub) | Direct message |
| 10 | Developer at an Angolan ecommerce or delivery company | LinkedIn or warm intro |

**The outreach message (direct, honest, short):**

```
Olá [Name],

I'm building BANZA — an open payment protocol for Angola, with a TypeScript/Flutter SDK.

I'd love to have you be one of the first 10 developers to try it.

If you have 30 minutes this week:
1. npm install @banza/sdk
2. Run the quickstart: banzami.com/docs/quickstart
3. Tell me what broke

No expectations — if it doesn't work for your use case, that feedback is valuable too.

- [Your name]
```

This message works because: it is specific, it is honest about being early, it has a clear call to action, and it asks for feedback rather than implying the product is perfect.

#### Activation: The Friday Criterion

Each of the first 10 builders gets direct support:
- A 30-minute call if they get stuck
- Direct Telegram/WhatsApp for questions
- Immediate fixes for any blockers they hit

The goal is to get all 10 to the "shipped" criterion. A builder who got stuck and gave up is not in the count.

#### First feedback: The Friction Log

During Phase 1, every reported friction point is logged in a shared document:

```
Friction Log — Phase 1
---
[Date] @handle: npm install worked. sandbox/signup link gave 500 error.
[Date] @handle: Couldn't figure out how to fund consumer wallet — needed sandbox.fund docs
[Date] @handle: createDynamicQr parameters unclear — what is "ownerId"? a wallet or a consumer?
```

This log drives the first SDK patch (`0.1.1`) and the first quickstart revision.

---

### Phase 2 — First 25 Builders (Weeks 3–4)

**Goal:** 25 builders, first public content.

#### Acquisition: Community seeding

By Week 3, the first 10 have shipped something. Now use their work:

1. **GitHub showcase** — create a `github.com/banzami/banzami/wiki/Built-with-BANZA` page listing the first 10 repos with one-line descriptions

2. **First public post** — a blog post or Twitter/X thread written by one of the first 10 builders (not by BANZA) describing what they built and why. The builder's authentic voice is more credible than BANZA's own marketing.

3. **Angolan developer communities** — post in:
   - Angola Devs Telegram (if it exists)
   - Luanda Tech / Angola Tech Facebook groups
   - LinkedIn (Angolan developer network)
   - Dev.to (tag: angola, payments, fintech)

**The community post content:**

```
I built [X] using BANZA — Angola's open payment SDK.

What I built: [2-sentence description with screenshot]

How: npm install @banza/sdk + 40 lines of TypeScript.
No bank negotiations. Sandbox is free and instant.

Try it: banzami.com/docs/quickstart
```

A post with a screenshot of a working QR payment is more persuasive than any description of the protocol architecture.

#### Activation: Builder Discord

By Phase 2, create a Discord server (or Telegram group — depending on what Angolan developers prefer):

```
Channels:
#show-and-tell      — builders share what they built
#help               — SDK questions, answered within 24h
#feature-requests   — what builders want next
#announcements      — SDK releases, new features
```

The Discord is not a support channel. It is a community. The distinction matters for culture.

---

### Phase 3 — First 100 Builders (Months 2–3)

**Goal:** 100 builders who have shipped. First external integration goes live.

#### Acquisition: Hackathons

One hackathon (or hackathon track) is the highest-density builder acquisition event possible. Targeting:

| Hackathon type | Expected yield | Note |
|----------------|---------------|------|
| Angola national hackathon (gov or university organized) | 10–20 teams, 20–60 builders | High yield, Angolan context |
| Angola-focused startup weekend | 5–10 teams, 15–30 builders | Strong product orientation |
| African fintech hackathon (BANZA track) | 5–15 teams, 15–40 builders | Broader reach, requires prize sponsorship |

**BANZA as a hackathon sponsor:**

- Offer a "Best BANZA Integration" prize (not necessarily cash — profile, hardware, or mentorship)
- Provide a workshop (45 minutes: quickstart + 2 example integrations)
- Have a BANZA mentor available throughout the event
- All participating teams get production access (bypassing sandbox-only stage) if they win or place

#### Acquisition: "What can you build with BANZA?" content

Publish a curated list of 20 project ideas that are buildable in one weekend with `@banza/sdk`. Each idea specifies:

- Target audience (taxi app, ecommerce, school, NGO, etc.)
- Difficulty (beginner / intermediate / advanced)
- Which SDK methods are needed
- Expected time: 4h / 8h / 16h
- A starter template repository (one button: "Use this template" on GitHub)

**The 20 project ideas:**

| # | Project | Audience | Time |
|---|---------|---------|------|
| 1 | Payment link generator (WhatsApp share) | Any | 4h |
| 2 | Merchant QR display screen (Flutter) | Merchant | 8h |
| 3 | Tip jar with QR code (for creators) | Creator | 4h |
| 4 | School fee collection portal | School admin | 8h |
| 5 | Event ticket sales with QR confirmation | Event organizer | 8h |
| 6 | Delivery payment confirmation (webhook) | Delivery app | 8h |
| 7 | P2P transfer bot (Telegram bot) | Consumer | 8h |
| 8 | Donation platform (NGO/charity) | NGO | 4h |
| 9 | Balance dashboard (Next.js) | Merchant | 8h |
| 10 | Flutter payment widget (embeddable) | Mobile dev | 16h |
| 11 | Taxi app in-app payment | Taxi app | 16h |
| 12 | WordPress/Woo payment plugin | WP developer | 16h |
| 13 | Subscription billing (recurring payment links) | SaaS | 16h |
| 14 | Multi-merchant aggregator | Platform | 16h |
| 15 | Crypto-to-Kz off-ramp (simulation only) | Curious dev | 16h |
| 16 | Settlement reconciliation exporter (CSV) | Finance | 8h |
| 17 | Protocol conformance checker CLI | Protocol explorer | 16h |
| 18 | BANZA transaction explorer (BanzAI wrapper) | BanzAI builder | 8h |
| 19 | QR payment status poller (real-time UI) | Frontend dev | 8h |
| 20 | Webhook event log and replay tool | DevOps/infra | 8h |

Each template is a GitHub repo with:
- `README.md` (what it is, how to run it, how to customize it)
- Working code connected to the sandbox (keys replaced with env vars)
- A "Deploy to Vercel/Render" button where applicable

---

## Retention: What Keeps Builders Engaged

Acquiring a builder is the first step. Retaining them as an advocate is the goal.

| Retention mechanism | Description |
|--------------------|-------------|
| **Builder showcase** | `banzami.com/builders` — a page featuring every builder who has shipped something. Photo, project name, one-line description, link. It costs nothing to be featured. It is socially motivating. |
| **SDK changelog** | Every `@banza/sdk` release includes a "builders who contributed to this release" section. Feedback that led to a change is attributed. |
| **"First 100" badge** | A GitHub badge, a Discord role, and a note on the builder showcase: "Original BANZA Builder." This has value because it is permanent and limited. |
| **Production access fast-track** | Builders who have shipped something in sandbox get priority review for production access. Their experience demonstrates readiness. |
| **Protocol RFC input** | Builders who have reached a certain engagement level are invited to comment on protocol RFCs before they are finalized. This turns builders into protocol contributors. |

---

## What "100 Builders" Proves

When builder 100 ships their integration, BANZA can say — with evidence:

> "100 developers in Angola have built payment integrations on BANZA without bank negotiations, without contacting the BANZA team, and without a legal business entity. In 15 minutes or less."

This is not a product claim. It is a demonstration of the protocol's accessibility and the SDK's quality. It is the proof that the developer adoption thesis works — before the operator adoption thesis needs to.

It also produces:
- 100+ public GitHub repos with BANZA code
- 20+ blog posts, threads, or demo videos about BANZA
- 50+ product ideas that BANZA had not thought of
- 10+ integrations that could become commercial operators
- Feedback for SDK `1.0.0` that would have taken 6 months of internal testing

The first 100 builders are not a marketing goal. They are the engineering validation of the platform.

---

## Metrics Dashboard

Track these weekly, starting from launch:

| Metric | Source | Target (Week 8) |
|--------|--------|----------------|
| Sandbox sign-ups | Backend analytics | 500 |
| SDK activations (≥1 successful API call) | Sandbox API logs | 200 |
| Builders (shipped criterion met) | Community + GitHub | 100 |
| Builder retention (still active 2 weeks after first call) | Sandbox API logs | 60% |
| Average time to first successful API call | Sandbox API logs | ≤ 15 min |
| GitHub repos using `@banza/sdk` | GitHub search | 50+ |
| Quickstart completion rate | Analytics on docs page | ≥ 40% |
| SDK issues opened (signal of engagement) | GitHub Issues | 30+ |

The quickstart completion rate (≥40%) is the key leading indicator. If it is below 40%, there is a friction point blocking the majority of developers before they complete the quickstart. Find it and fix it before continuing outreach.

---

*Part of BANZA-FIRST-100-BUILDERS-001 — 2026-05-30*  
*Related: [FIRST_BUILDER_JOURNEY.md](FIRST_BUILDER_JOURNEY.md) · [SDK_ADOPTION_PLAN.md](SDK_ADOPTION_PLAN.md) · [SANDBOX_REQUIREMENTS.md](SANDBOX_REQUIREMENTS.md) · [15_MINUTE_QUICKSTART_SPEC.md](15_MINUTE_QUICKSTART_SPEC.md)*
