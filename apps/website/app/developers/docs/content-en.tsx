'use client';

// EN documentation content, split by area (P3A information architecture).
// Every block below was MOVED VERBATIM from the previous single EN page —
// same components, same styles, same claim-safety wording. Cross-area anchors
// were remapped to their new routes. See content-map.ts.

import { BADGE_LABELS_EN, Badge, Callout, Code, CodeBlock, H2, H3, INK, LI, MUT, NextSteps, P, PageLede, RED, Section, UL, mono } from './ui';
import { ResourceReference } from './reference';
import { ErrorCatalogue } from './ErrorCatalogue';
import { ConceptModelDiagram, SegregatedAccountsDiagram, DonationFlowDiagram, JourneyStripDiagram } from './diagrams';
import { CapabilityCards } from './CapabilityCards';
import type { CopyFn } from './content-pt';

// English concepts (translations of the canonical PT glossary — same 28 terms).
const CONCEPTS: { term: string; def: string; code?: boolean }[] = [
  { term: 'Sandbox', def: 'Test environment for validating Banzami integrations without moving real money.' },
  { term: 'Production', def: 'Environment for real-money operations, once the platform is enabled. Currently in preparation.' },
  { term: 'Ledger', def: 'Financial record keeping every debit and credit of a transaction, preserving balance integrity.' },
  { term: 'Idempotency', def: 'Guarantee that repeating the same request never creates a second transfer, payment or financial effect.' },
  { term: 'Webhook', def: 'Notification Banzami sends directly to your application server when an event happens.' },
  { term: 'banza-signature', def: 'BANZA-protocol signature header used by Banzami to prove a webhook is authentic and unmodified.', code: true },
  { term: 'HMAC-SHA256', def: 'Signature method used to verify the origin and integrity of a received event.' },
  { term: 'OTP', def: 'Temporary code confirming you control the email or contact used to sign in.' },
  { term: 'Business account', def: 'Banzami account used by an organisation to run integrations, receive value and manage its activity.' },
  { term: 'Settlement', def: 'Process by which confirmed value is calculated and handled under the operator’s rules.' },
  { term: '@banza', def: 'Public identifier of a Banzami account, used to receive transfers.', code: true },
  { term: 'API key', def: 'Credential an application uses to authenticate against a Banzami integration.' },
  { term: 'Publishable key', def: 'Identifier that may be used client-side when the flow allows it; never a substitute for a secret key.' },
  { term: 'Secret key', def: 'Server-only credential. Never expose it in a browser, mobile app, repository, logs or screenshots.' },
  { term: 'Replay', def: 'Re-delivery or repetition of an already-received request/event. Idempotency prevents duplicated effects.' },
  { term: 'At-least-once', def: 'Delivery model where an event may arrive more than once; your server must handle it idempotently.', code: true },
  { term: 'QR', def: 'Visual code that opens a Banzami payment journey or identifies an operation quickly.' },
  { term: 'Payment session', def: 'Representation of a payment attempt tied to a reference from your application.' },
  { term: 'Receipt', def: 'Record issued after a confirmed operation, with the data needed for lookup and verification.' },
  { term: 'Workspace', def: 'The group of people with access to a set of projects, with roles (Owner, Admin, Developer, Finance, Viewer).' },
  { term: 'Project', def: 'One integrated application: its keys, webhooks and logs. The Project ID does not change when its name does.' },
  { term: 'Financial setup', def: 'The link between a project and the Business that receives its money. Without it, the project cannot be paid.' },
  { term: 'Business', def: 'The legal entity, verified by Banzami, that owns the money a project receives.' },
  { term: 'Wallet account', def: 'An account inside a Business wallet, to keep value apart — one per campaign, for example.' },
  { term: 'Payment link', def: 'An address on pay.banzami.com where the payer pays; with a fixed or an open amount.' },
  { term: 'Refund', def: 'Returning a confirmed payment, fully or partially, from the account that received it.' },
  { term: 'Transaction', def: 'A movement of value recorded in the ledger — a payment, a refund or a transfer.' },
  { term: 'Minor units', def: 'How amounts travel in the API: integers, where 100 minor units are 1 Kz. Never decimals.' },
];

// -- Code samples (placeholders only, Sandbox-only) ------------------------------
const SAMPLE_SESSION = `import { BanzamiClient } from '@banzami/sdk';

// The bz_test_sk_ secret key lives on the server and nowhere else.
const apiKey = process.env.BANZAMI_API_KEY;
if (!apiKey) throw new Error('BANZAMI_API_KEY is not set');
const banzami = new BanzamiClient({ apiKey });

// 0. The project must be financially ready — otherwise: 403 PAYMENTS_UNAVAILABLE.
const setup = await banzami.getFinancialSetup();

// 1. Create a payment session.
//    Do not name the destination account: with a Console key the recipient
//    comes from the project's financial setup. Sending one is refused by the API.
const session = await banzami.createPaymentSession({
  purpose: 'ORDER',
  referenceType: 'ORDER',
  referenceId: 'order_123',
  amountMinor: 25000,      // 250 Kz — 100 minor units = 1 Kz
  currency: 'AOA',
  description: 'Order #123',
});

// 2. Show the payer the link or the QR.
const link = banzami.paymentSessionInterface(session, 'PAYMENT_LINK');
// link.value  ->  https://pay.banzami.com/pay/{slug}

// 3. Know that it paid. The source of truth is Banzami, not the payer's browser:
//    confirm on your server, from the webhook or by reading the session.
const now = await banzami.getPaymentSession(session.session_id);
// now.status  ->  'PAID' once the payer has paid`;

const SAMPLE_CURL_SESSION = `# Create a payment session in the Sandbox (placeholder values).
# With a developer key you do NOT send wallet_account_id: the recipient comes
# from the project's financial setup, and the API refuses a client-supplied recipient.
curl -X POST https://sandbox-api.banzami.com/v1/payment-sessions \\
  -H "Authorization: Bearer bz_test_sk_XXXXXXXXXXXXXXXX" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: idem_order_123" \\
  -d '{
    "purpose": "ORDER",
    "reference_type": "ORDER",
    "reference_id": "order_123",
    "amount_minor": 25000,
    "currency": "AOA",
    "description": "Order #123"
  }'

# Response (201) — the main fields
{
  "session_id": "psess_example",
  "wallet_account_id": "wacc_example",
  "currency": "AOA",
  "amount_minor": 25000,
  "purpose": "ORDER",
  "reference_type": "ORDER",
  "reference_id": "order_123",
  "status": "ACTIVE",
  "created_at": "2026-07-11T11:45:00Z",
  "interfaces": [
    { "type": "PAYMENT_LINK", "value": "https://pay.banzami.com/pay/slug_example", "format": "URL",
      "expires_at": "2026-07-11T12:00:00Z" },
    { "type": "DEEP_LINK", "value": "banzami://pay/slug_example", "format": "URL",
      "expires_at": "2026-07-11T12:00:00Z" },
    { "type": "DYNAMIC_QR", "value": "https://pay.banzami.com/pay/slug_example", "format": "QR_PAYLOAD",
      "qr_url": "/v1/payment-sessions/psess_example/qr", "expires_at": "2026-07-11T12:00:00Z" }
  ]
}`;

const SAMPLE_WEBHOOK = `import { BanzamiClient } from '@banzami/sdk';

// The endpoint's secret comes with the client — without it, constructEvent refuses.
const apiKey = process.env.BANZAMI_API_KEY;
const webhookSecret = process.env.BANZAMI_WEBHOOK_SECRET;
if (!apiKey || !webhookSecret) throw new Error('API key or webhook secret is not set');
const banzami = new BanzamiClient({ apiKey, webhookSecret });

// In your webhook endpoint (server): the RAW body, and the header.
const raw = await req.text();
const sig = req.headers.get('banza-signature') ?? '';
// constructEvent verifies the signature and ONLY THEN returns the event.
// If the signature does not match, it throws — and nothing was read.
const event = banzami.webhooks.constructEvent(raw, sig);

switch (event.type) {
  case 'payment_session.paid':             /* confirm the order (idempotently) */ break;
  case 'application_settlement.completed': /* record the settlement */            break;
}

// Answer 2xx quickly; delivery is at-least-once, with no ordering guarantee.`;

const SAMPLE_WEBHOOK_MANAGE = `import { BanzamiClient } from '@banzami/sdk';
const apiKey = process.env.BANZAMI_API_KEY;
if (!apiKey) throw new Error('BANZAMI_API_KEY is not set');
const banzami = new BanzamiClient({ apiKey });

// Register the endpoint. No merchant, no wallet: the owner comes from the project's financial setup.
const ep = await banzami.createWebhookEndpoint({
  url:    'https://www.example.com/api/webhooks/banzami',
  events: ['payment_session.paid'],
});
storeSecret(ep.secret);   // returned ONCE — no later read brings it back

// See what happened
const { data: endpoints } = await banzami.listWebhookEndpoints();
const { data: events }    = await banzami.listWebhookEvents(20);
const { data: deliveries } = await banzami.listWebhookDeliveries(events[0].id);

// Rotate the secret. Update the receiver FIRST: the swap is immediate, not overlapping.
const rotated = await banzami.rotateWebhookEndpointSecret(ep.id);
storeSecret(rotated.secret);`;

const SAMPLE_CURL_ME = `# Verify your test key (placeholder) against the Sandbox API
curl https://sandbox-api.banzami.com/v1/me \\
  -H "Authorization: Bearer bz_test_sk_XXXXXXXXXXXXXXXX"

# Response (200)
{
  "environment": "SANDBOX",
  "project": {
    "id": "6f1c2d3e-0000-4000-8000-000000000000",
    "name": "My Project",
    "ref": "my-project"
  },
  "scopes": ["identity:read"],
  "key_status": "ACTIVE"
}`;

const SAMPLE_KEYS = `bz_test_pk_XXXXXXXXXXXXXXXX   # publishable — may live client-side
bz_test_sk_XXXXXXXXXXXXXXXX   # secret — server only, revealed exactly once`;

const SAMPLE_ERROR = `# Canonical error envelope (Sandbox)
{
  "code": "INVALID_AMOUNT",
  "message": "amount_minor must be a positive integer",
  "request_id": "4f3c1b9a2e7d5086c1af03be7d2915ce"
}`;

const SAMPLE_WEBHOOK_ENVELOPE = `# Event envelope delivered to your endpoint (implemented in Sandbox)
{
  "id": "evt_XXXXXXXX",
  "type": "payment_session.paid",
  "created_at": "2026-07-11T11:46:02Z",
  "data": { /* event object */ }
}`;

const SAMPLE_IDEM_RETRY = `# Safe retry: the SAME Idempotency-Key replays the original response
curl -X POST https://sandbox-api.banzami.com/v1/payment-sessions \\
  -H "Authorization: Bearer bz_test_sk_XXXXXXXXXXXXXXXX" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: idem_order_123" \\
  -d '{ ...same body... }'
# -> 201 with the SAME response; no duplicate session is created.

# What NOT to do: change the Idempotency-Key when retrying after a timeout —
# that can create a second effect. Always reuse the original key.`;

// Verified event catalogue (same closed set as the PT page and its tests).
// Every event the operator actually emits, and only those — see the PT note.
const EVENTS: string[] = [
  'payment_session.created',
  'payment_session.paid',
  'payment_link.paid',
  'refund.completed',
  'application_settlement.completed',
  'application_settlement.cancelled',
  'application_settlement.failed',
];

const SDKS: { name: string; lang: string; state: string }[] = [
  { name: '@banzami/sdk', lang: 'TypeScript / Node', state: 'Published — npm, server SDK, recommended path' },
  { name: 'banzami-python', lang: 'Python', state: 'Complete (source code)' },
  { name: 'banzami/sdk-php', lang: 'PHP (+ Laravel)', state: 'Complete (source code)' },
  { name: 'banzami_client', lang: 'Dart / Flutter (client)', state: 'Published — public client SDK, publishable key' },
  { name: '@banzami/checkout', lang: 'JavaScript (browser)', state: 'Complete (source code)' },
  { name: 'banzami-go', lang: 'Go', state: 'Partial — webhooks + payment links' },
];



const enCopy = { toastText: 'Copied to clipboard', buttonText: 'Copy' };

export function EnGetStarted({ copy }: { copy: CopyFn }) {
  return (
    <>
<Section id="introduction">
              <h1 style={{ margin: '0 0 8px', fontSize: 30, fontWeight: 900, letterSpacing: '-.02em', color: INK }}>Introduction</h1>
              <NextSteps label="Next:" links={[{ href: '/docs/en/sdk', text: 'SDKs' }, { href: '/docs/en/testing', text: 'Sandbox testing' }, { href: '/docs/en/reference', text: 'API Reference' }]} />
              <P style={{ fontSize: 15.5, color: MUT, fontWeight: 600 }}>
                Start integrating Banzami in minutes. Every call uses the <strong>Sandbox</strong> environment by default.
                Build and validate your integration in the Sandbox — <strong>Production</strong> will be activated once the
                platform is enabled for real payments.
              </P>

              <div id="current-status" style={{ scrollMarginTop: 72, margin: '0 0 18px', borderRadius: 16, border: '1px solid #F7DAD7', background: '#FFF7F6', padding: '16px 18px', maxWidth: 660 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 14, fontWeight: 900, color: INK }}>Current status of this documentation</span>
                  <Badge tone="prep">Sandbox</Badge>
                </div>
                <UL>
                  <LI>This documents the <strong>Sandbox</strong>, which is the only environment that exists. The SDKs install from public registries and the Console is operational; what is missing is real money, not capability.</LI>
                  <LI><strong>Money in the Sandbox is fictitious.</strong> Balances, payments and settlements are real as mechanics and behave the way they will in production — but no kwanza leaves or enters a bank account, and nothing that happens here has any financial effect in the world. That is why you can test freely.</LI>
                  <LI><strong>Production and real-money rails are not available.</strong> Public pay/checkout, live rails and external providers are not available.</LI>
                  <LI>The Console is <strong>operational in Sandbox</strong>: email + OTP sign-in, sessions, workspaces, projects, members and the full API-key lifecycle are exercised end to end against the deployed environment, including cross-tenant isolation. The Overview, Balances, Transactions, Webhooks and Logs derive from the project&rsquo;s own data — no Console page renders illustrative data, and nothing is shown that the platform cannot answer for.</LI>
                </UL>
              </div>

              <CapabilityCards lang="en" />

              {/* h2, not h3: it follows the page h1 directly, and a skipped
                  heading level is a screen reader announcing a subsection of
                  something that is not there. */}
              <H2>Three layers</H2>
              <P>When integrating Banzami, always tell three layers apart:</P>
              <UL>
                <LI><strong>Banzami Developers Console</strong> — where you sign in with email + OTP, create workspaces, Sandbox projects and <strong>test keys</strong>, and manage members and roles. The Console is not a public API for third parties to call directly. The Overview, Balances, Transactions, Webhooks and Logs show your project&rsquo;s real data: Balances the accounts of the payee the project is bound to, Transactions the payments, refunds and transfers that happened, and Logs every request made with one of the project&rsquo;s keys. There is no customer directory and no status page — neither exists as a product.</LI>
                <LI><strong>Banzami integration layer</strong> — what your application uses for payments: payment links, sessions, QR, confirmation, receipts, signed webhooks and operator-controlled settlement.</LI>
                <LI><strong>Banzami Operator / Core</strong> — Banzami&rsquo;s financial layer: it executes the payment, keeps balances and integrity, and calculates and controls settlement. Your application never creates or manages its own financial ledger.</LI>
              </UL>

              <div id="doa" style={{ scrollMarginTop: 72, margin: '24px 0', borderRadius: 18, border: '1px solid #F2E2E0', background: 'linear-gradient(135deg,#fff,#FFF4F3)', padding: 22, boxShadow: '0 18px 44px -38px rgba(181,16,31,.4)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 900, letterSpacing: '.04em', color: RED }}>DOA · REFERENCE INTEGRATION</span>
                  <Badge tone="ok">{BADGE_LABELS_EN.ok}</Badge>
                </div>
                <P style={{ marginBottom: 8 }}>
                  <strong>DOA is the reference implementation of the Banzami integration.</strong> It shows how an application
                  runs its own business logic — campaigns and donations — while delegating everything financial to Banzami.
                </P>
                <UL>
                  <LI>It creates a Banzami payment journey and shows the donor a link and a QR.</LI>
                  <LI>It follows the confirmation and verifies signed webhooks on its server.</LI>
                  <LI>It issues receipts and requests settlement within the operator&rsquo;s model.</LI>
                  <LI>It creates no ledger, financial balance or payment infrastructure of its own.</LI>
                </UL>
                <P style={{ margin: 0 }}>
                  The DOA integration is currently operational in the Sandbox environment and is used to continuously validate
                  the Banzami integration model.
                </P>
                <div style={{ marginTop: 14 }}>
                  <JourneyStripDiagram
                    title="An integration's journey, from the user to settlement"
                    steps={['User', 'DOA app', 'Banzami', 'Link / QR / Session', 'Confirmation', 'Webhook / Receipt', 'Settlement']}
                  />
                </div>
              </div>

              <div id="production" style={{ scrollMarginTop: 72, marginTop: 8, borderRadius: 16, border: '1px solid #F7DAD7', background: '#FFF7F6', padding: '18px 20px', maxWidth: 660 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                  <span style={{ fontSize: 15, fontWeight: 900, color: INK }}>Production</span>
                  <Badge tone="prep">{BADGE_LABELS_EN.prep}</Badge>
                </div>
                <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: '#5a4a4e', fontWeight: 500 }}>
                  The Sandbox lets you validate your integration without moving real money. Activation for real payments
                  will be made available after the required platform-enablement steps are complete.
                </p>
              </div>
            </Section>
<Section id="quickstart">
              <H2>Quickstart</H2>
              <Callout>
                <strong>Recommended path: the TypeScript SDK.</strong> Install it with{' '}
                <Code>npm install @banzami/sdk</Code>. curl is for validating the protocol,
                diagnosing Sandbox behaviour or auditing low-level calls — it is not the
                implementation path.
              </Callout>
              <P>From first sign-in to your first confirmed payment, in the Sandbox — twelve steps:</P>
              <ol style={{ margin: '0 0 16px', padding: '0 0 0 20px', maxWidth: 660, display: 'flex', flexDirection: 'column', gap: 7 }}>
                <LI>Sign in to the Console at <Code>developers.banzami.com/login</Code> with email + code (OTP).</LI>
                <LI>Create or pick a <strong>workspace</strong>.</LI>
                <LI>Create a <strong>Sandbox project</strong>.</LI>
                <LI>Complete the project&rsquo;s <a href="#financial-setup" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>financial setup</a> — apply for a Business, or connect one that already exists with its owner&rsquo;s consent code. <strong>Without this step the project cannot receive payments.</strong></LI>
                <LI>Create a <strong>secret test key</strong> and save it when it appears — it is shown exactly once.</LI>
                <LI>Install the SDK: <Code>npm install @banzami/sdk</Code>.</LI>
                <LI>Make the first call: <Code>GET /v1/me</Code> confirms the environment, project, scopes and key status.</LI>
                <LI>Create a <strong>payment session</strong>.</LI>
                <LI>Open the link the session returns — it is the payer&rsquo;s page on <Code>pay.banzami.com</Code>.</LI>
                <LI>Confirm the outcome: <Code>getPaymentSession</Code> reads <Code>PAID</Code> once the payer pays.</LI>
                <LI>Receive the <Code>payment_session.paid</Code> webhook and <strong>verify its signature before you read it</strong>.</LI>
                <LI>See the payment in the Console, under <strong>Transactions</strong>.</LI>
              </ol>
              <Callout>
                Steps 1–3 and 5–7 take minutes. Step 4 does not: a new Business is{' '}
                <strong>reviewed by Banzami</strong> before it can receive, and connecting an existing
                Business needs its owner&rsquo;s code. That is why financial setup comes before the first
                payment — not after it fails.
              </Callout>
              <CodeBlock label="curl · first call (GET /v1/me)" raw={SAMPLE_CURL_ME} onCopy={copy} {...enCopy} />
              <Callout>
                Every example uses <strong>placeholder keys and identifiers</strong> and is <strong>Sandbox-only</strong> —
                no real money ever moves. Replace the values with your own Sandbox project’s.
              </Callout>
              <CodeBlock label="test keys" raw={SAMPLE_KEYS} onCopy={copy} {...enCopy} />
              <UL>
                <LI><Code>bz_test_pk_</Code> — publishable key (may live client-side).</LI>
                <LI><Code>bz_test_sk_</Code> — secret key (server only).</LI>
                <LI>The secret key appears <strong>exactly once</strong>; you can <strong>rotate</strong> or <strong>revoke</strong> keys at any time.</LI>
              </UL>
              <Callout>Never expose secret keys in a browser, mobile app, repository, logs, screenshots or analytics.</Callout>
              <P>
                Banzami is <strong>SDK-first</strong>. The TypeScript SDK is{' '}
                <strong>published</strong> and is the recommended path — install it with{' '}
                <Code>npm install @banzami/sdk</Code>. The curl examples are{' '}
                <strong>reference/diagnostic</strong> material for the protocol, not the implementation path.
                The Dart client SDK <Code>banzami_client</Code> is also published, on pub.dev. The Python, PHP
                and Go SDKs are <strong>not yet published</strong> to PyPI, Packagist or a module proxy — see{' '}
                <a href="/docs/en/sdk" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>SDKs</a>.
              </P>

              <H3 id="financial-setup">Financial setup — before the first payment</H3>
              <P>
                A freshly created project can do everything except receive money. Keys, webhooks and API
                calls work; creating a payment session answers <Code>403 PAYMENTS_UNAVAILABLE</Code>. What
                is missing is <strong>who receives</strong>: money goes to a <strong>Business</strong>, a
                verified entity, and financial setup is what connects the project to that Business.
              </P>
              <P>There are two paths, and the difference is who already exists:</P>
              <UL>
                <LI>
                  <strong>A new Business.</strong> In the Console, under <strong>Financial setup</strong>,
                  apply for the Business: entity, representative, documents. Banzami reviews the application
                  — it is a human decision and it is not instant, in the Sandbox too. Once approved, the
                  project is connected and can receive.
                </LI>
                <LI>
                  <strong>A Business that already exists.</strong> If the entity is already verified on
                  Banzami, its owner generates a <strong>consent code</strong> in the Banzami Business app.
                  Paste it into the Console and the project connects to that Business without repeating the
                  verification. The code is single-use.
                </LI>
              </UL>
              <P>
                To know whether the project is ready, check <strong>Financial setup</strong> in the Console,
                or ask the API with <Code>getFinancialSetup()</Code> — that is what your application should
                read before it offers a way to pay.
              </P>
              <Callout tone="warn">
                There is no shortcut: no request of yours, no field, no key makes a project financially
                ready. It is the Business&rsquo;s verification that gives the project authority to receive,
                which is why your key never chooses the recipient.
              </Callout>

              <H3 id="first-payment">Your first payment</H3>
              <P>
                A payment session is the main flow: you create it, Banzami gives you a link and a
                QR, and the payer uses either. With a project key you do <strong>not</strong> name
                the destination account — the recipient comes from the project&rsquo;s financial setup, and
                the API refuses a client-supplied one.
              </P>
              <CodeBlock label="curl · create a payment session (request + response)" raw={SAMPLE_CURL_SESSION} onCopy={copy} {...enCopy} />
              <P style={{ fontSize: 13, color: '#a89a9e' }}>
                Failures worth expecting: <Code>401</Code> (key missing, revoked or live),{' '}
                <Code>403 PAYMENTS_UNAVAILABLE</Code> (the project has no financial setup yet — see{' '}
                <a href="#financial-setup" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>above</a>),{' '}
                <Code>403 INSUFFICIENT_SCOPE</Code>,{' '}
                <Code>400 INVALID_BODY / BAD_REQUEST</Code>, <Code>409 IDEMPOTENCY_CONFLICT</Code> (a request with the
                same Idempotency-Key still in flight) and <Code>409 IDEMPOTENCY_KEY_REUSED</Code> (the same key with a
                different body). See{' '}
                <a href="/docs/en/reference#errors" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>Errors</a>.
              </P>
              <CodeBlock label="ts · create a payment session (@banzami/sdk)" raw={SAMPLE_SESSION} onCopy={copy} {...enCopy} />
              <H3 id="after-the-payment">After you create the session</H3>
              <UL>
                <LI><strong>Open the payment.</strong> The session&rsquo;s link is the payer&rsquo;s page on <Code>pay.banzami.com</Code>; the QR encodes the same address, and any camera opens it.</LI>
                <LI><strong>Confirm.</strong> When the payer pays, <Code>getPaymentSession</Code> reads <Code>PAID</Code>. Do not conclude it paid because the payer came back to your page — confirm on the server.</LI>
                <LI><strong>Receive the webhook.</strong> Register your endpoint with <Code>createWebhookEndpoint</Code> and store the secret, which appears once. When <Code>payment_session.paid</Code> arrives, <strong>verify the signature before you read the event</strong> and handle it idempotently by its <Code>id</Code> — delivery is at-least-once. See{' '}
                  <a href="/docs/en/guides#webhooks" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>Webhooks</a>.</LI>
                <LI><strong>See it in the Console.</strong> The payment appears under the project&rsquo;s <strong>Transactions</strong>, with its amount and status.</LI>
              </UL>

              </Section>
    </>
  );
}

export function EnSdk({ copy }: { copy: CopyFn }) {
  return (
    <>
<Section id="sdks">
              <H2>SDKs</H2>
              <PageLede><strong>SDK-first</strong> model, two SDKs published to public registries, the SDK contract, per-family status and ergonomics examples.</PageLede>
              <NextSteps label="Next:" links={[{ href: '/docs/en/guides', text: 'Guides' }, { href: '/docs/en/testing', text: 'Sandbox testing' }, { href: '/docs/en/trust', text: 'Security' }]} />
<H3 id="sdk-first">SDK-first integration model</H3>
              <P>
                Banzami&rsquo;s integration philosophy is <strong>SDK-first</strong>. Banzami SDKs should be the recommended
                path for integrating payments, creating sessions, validating responses, handling errors, managing idempotency,
                and consuming webhooks.
              </P>
              <P>
                The HTTP API and OpenAPI exist as the <strong>technical protocol reference layer</strong>. Direct HTTP usage
                is secondary and should be reserved for diagnostics, audits, controlled testing, or advanced integrators.
              </P>
              <P>
                Two SDKs are published to public registries and install with no commercial contact:{' '}
                <Code>npm install @banzami/sdk</Code> (server) and <Code>dart pub add banzami_client</Code> (client).
                The Python and PHP packages are not published yet and are consumed from source. This
                documentation gives no install command for them, because a command pointing at a package
                no registry has returns an error that looks like the reader's mistake.
              </P>

              <H3 id="sdk-maturity">SDK maturity matrix</H3>
              <P>
                The SDKs handle authentication, idempotency, retries and webhook signature verification. Today they are
                published: <Code>@banzami/sdk</Code> on npm and <Code>banzami_client</Code> on pub.dev, each proven by a
                clean-room install from the public registry outside every Banzami repository; the rest are consumed as{' '}
                <strong>source code</strong>. Banzami is SDK-first: the curl examples
                in this documentation are the <strong>protocol reference</strong> layer, not the recommended implementation
                path; internal or approved SDK packages may exist but are not public install paths.
              </P>
              <div style={{ overflowX: 'auto', maxWidth: '100%', margin: '0 0 14px' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 560, fontSize: 13.5 }}>
                  <thead>
                    <tr style={{ textAlign: 'left', color: '#a89a9e' }}>
                      <th style={{ padding: '8px 10px', fontWeight: 800, borderBottom: '1px solid #F2E2E0' }}>SDK</th>
                      <th style={{ padding: '8px 10px', fontWeight: 800, borderBottom: '1px solid #F2E2E0' }}>Language</th>
                      <th style={{ padding: '8px 10px', fontWeight: 800, borderBottom: '1px solid #F2E2E0' }}>State</th>
                    </tr>
                  </thead>
                  <tbody>
                    {SDKS.map((s) => (
                      <tr key={s.name}>
                        <td style={{ padding: '9px 10px', borderBottom: '1px solid #F5E9E7', fontFamily: mono, fontWeight: 700, color: INK }}>{s.name}</td>
                        <td style={{ padding: '9px 10px', borderBottom: '1px solid #F5E9E7', color: '#5a4a4e' }}>{s.lang}</td>
                        <td style={{ padding: '9px 10px', borderBottom: '1px solid #F5E9E7', color: '#5a4a4e' }}>{s.state}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <P>
                <strong>DOA</strong> is the real proof of SDK-first consumption: it uses <Code>@banzami/sdk</Code> to create sessions and links,
                produce QR, resolve <Code>@banza</Code>, verify webhooks and request settlement — with no direct HTTP calls.
              </P>

              {/* The anchor keeps its old id so links written when this section was
   called "SDK preview" still land on it. The section is not a preview. */}
              <H3 id="sdk-preview">SDK publication</H3>
              <P>
                <Code>@banzami/sdk</Code> (npm) and <Code>banzami_client</Code> (pub.dev) are published and are the
                recommended path. They install from the public registry, with no invite and no commercial contact.
              </P>
              <P>
                This documentation describes the expected SDK contract: authentication, session creation, idempotency,
                response validation, errors, webhooks and availability limits. It gives no installation command for
                the Python and PHP packages, because they are not yet published to PyPI or Packagist.
              </P>

              <H3 id="sdk-contract">Expected SDK contract</H3>
              <P>What official Banzami SDKs are expected to handle (<strong>expected contract</strong>, not published SDK behaviour):</P>
              <UL>
                <LI>Bearer authentication and environment separation (Sandbox vs future Production).</LI>
                <LI>Payment session creation and retrieval; public link and QR payload retrieval (verified surfaces).</LI>
                <LI><strong>Idempotency</strong>: Idempotency-Key generation or explicit caller-provided keys.</LI>
                <LI>Canonical error mapping and <Code>request_id</Code> exposure; safe retry guidance.</LI>
                <LI>Webhook signature verification (<Code>banza-signature</Code>) and verified event-envelope parsing (expected/planned).</LI>
                <LI><strong>Never</strong>: client-side exposure of secret keys, automatic live-rails activation, or Production key issuance (not available).</LI>
              </UL>

              <H3 id="sdk-families">SDK family status</H3>
              <div style={{ overflowX: 'auto', maxWidth: '100%', margin: '0 0 14px' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 560, fontSize: 13 }}>
                  <thead>
                    <tr style={{ textAlign: 'left', color: '#a89a9e' }}>
                      <th style={{ padding: '8px 10px', fontWeight: 800, borderBottom: '1px solid #F2E2E0' }}>SDK family</th>
                      <th style={{ padding: '8px 10px', fontWeight: 800, borderBottom: '1px solid #F2E2E0' }}>Current status</th>
                      <th style={{ padding: '8px 10px', fontWeight: 800, borderBottom: '1px solid #F2E2E0' }}>Public package</th>
                      <th style={{ padding: '8px 10px', fontWeight: 800, borderBottom: '1px solid #F2E2E0' }}>Install command</th>
                      <th style={{ padding: '8px 10px', fontWeight: 800, borderBottom: '1px solid #F2E2E0' }}>Recommended use now</th>
                      <th style={{ padding: '8px 10px', fontWeight: 800, borderBottom: '1px solid #F2E2E0' }}>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {([
                      ['JavaScript/TypeScript', 'published', '@banzami/sdk', 'npm install @banzami/sdk', 'recommended path (server)', 'secret key — never in the client'],
                      ['Dart / Flutter (client)', 'published', 'banzami_client', 'dart pub add banzami_client', 'recommended path (client)', 'publishable key, read-only'],
                      ['Python', 'not published', 'none', 'not available', 'consume from source', 'publication pending'],
                      ['PHP', 'not published', 'none', 'not available', 'consume from source', 'publication pending'],
                    ] as [string, string, string, string, string, string][]).map(([fam, st, pkg, cmd, use, note]) => (
                      <tr key={fam}>
                        <td style={{ padding: '9px 10px', borderBottom: '1px solid #F5E9E7', fontWeight: 700, color: INK }}>{fam}</td>
                        <td style={{ padding: '9px 10px', borderBottom: '1px solid #F5E9E7', color: '#5a4a4e' }}>{st}</td>
                        <td style={{ padding: '9px 10px', borderBottom: '1px solid #F5E9E7', color: '#5a4a4e' }}>{pkg}</td>
                        <td style={{ padding: '9px 10px', borderBottom: '1px solid #F5E9E7', color: '#5a4a4e' }}>{cmd}</td>
                        <td style={{ padding: '9px 10px', borderBottom: '1px solid #F5E9E7', color: '#5a4a4e' }}>{use}</td>
                        <td style={{ padding: '9px 10px', borderBottom: '1px solid #F5E9E7', color: '#5a4a4e' }}>{note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <P>
                Machine-readable contract:{' '}
                <a href="/developers/artifacts/sdk-contract.json" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>sdk-contract.json</a>
                {' '}·{' '}
                <a href="/developers/artifacts/sdk-first-manifest.json" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>sdk-first-manifest.json</a>.
                SDK-style examples (intended ergonomics):{' '}
                <a href="/developers/examples/sdk/typescript-payment-session.example.ts" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>TypeScript</a>
                {' '}·{' '}
                <a href="/developers/examples/sdk/python-payment-session.example.py" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>Python</a>
                {' '}·{' '}
                <a href="/developers/examples/sdk/php-payment-session.example.php" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>PHP</a>.
              </P>
              <Callout>
                The examples below show the ergonomics each SDK offers. For TypeScript
                and Dart they are real instructions: the packages are published and
                install with the commands given above. For Python and PHP they show the
                intended ergonomics — with no install command, because there is not yet
                a package in a public registry to install.
              </Callout>

              <H3 id="before-you-integrate">Before you put the integration in front of anyone</H3>
              <P>
                This is not an approval process: there is no invitation, no eligibility
                step and no sales conversation between you and the Sandbox. It is the
                list of things worth having tested before there are users on the other
                side.
              </P>
              <UL>
                <LI>Identity and authentication: <Code>GET /v1/me</Code> answers for the key your application will actually run with.</LI>
                <LI>Financial readiness: <Code>GET /v1/financial-setup</Code> returns your Project&apos;s state, and your application knows what to show while it is not ready.</LI>
                <LI>Creating and reading the payment resource you will use — session or link — plus the QR payload, if you present a QR.</LI>
                <LI>Idempotency: a retry with the <strong>same</strong> <Code>Idempotency-Key</Code> tested, and concurrent requests understood.</LI>
                <LI>Errors: a validation <Code>400</Code> and a <Code>401</Code> tested, with the <Code>request_id</Code> reaching your logs.</LI>
                <LI>Webhooks: signature verified with the SDK&apos;s own method, duplicate deliveries treated as the same event, and the secret stored where secrets live.</LI>
                <LI>Secrets: the secret key on the server only — never in a browser, never in a mobile app, never in the repository.</LI>
              </UL>

              <H3 id="report-a-problem">Found a problem?</H3>
              <P>
                Send the <Code>request_id</Code> from the response, the timestamp, the
                environment (<Code>SANDBOX</Code>), the operation you attempted and the SDK
                version. The <Code>request_id</Code> is what lets us follow the exact
                request on our side.
              </P>
              <Callout tone="warn">
                Never send the secret key, the webhook secret, an OTP code or a session
                token — through any support channel. Nothing we need in order to help is
                a secret.
              </Callout>

              </Section>
    </>
  );
}

export function EnConsole({ copy }: { copy: CopyFn }) {
  return (
    <>
<Section id="console">
              <H2>The Console</H2>
              <PageLede>Everything that exists at <Code>developers.banzami.com</Code>, screen by screen — and what each thing means before you use it.</PageLede>
              <NextSteps label="Next:" links={[{ href: '/docs/en/get-started', text: 'Quickstart' }, { href: '/docs/en/guides', text: 'Guides' }, { href: '/docs/en/trust', text: 'Security' }]} />

              <H3 id="model">The model, before the screens</H3>
              <P>
                Four things, nested inside one another. Worth reading once, because nearly every
                integration mistake is one of these four mistaken for another.
              </P>
              <ConceptModelDiagram l={{
                title: 'The model: person, workspace, project, and what each project holds',
                person: 'Person (email + code)', workspace: 'Workspace', project: 'Project',
                financialSetup: 'Financial setup', business: 'Business',
                wallet: 'Wallet', accounts: 'Accounts',
                apiKeys: 'API keys', webhooks: 'Webhook endpoints',
                noteWorkspace: 'who has access to what',
                noteProject: 'the unit of integration',
                noteBusiness: 'who receives the money',
                noteKeys: 'how your app authenticates',
                noteWebhooks: 'where the events go',
              }} />
              <UL>
                <LI><strong>Person ≠ Workspace.</strong> A person belongs to several workspaces; a workspace has several members.</LI>
                <LI><strong>Workspace ≠ Project.</strong> The workspace is the access boundary. The project is the <em>integration</em> boundary: keys, webhooks and logs belong to the project.</LI>
                <LI><strong>Project ≠ Business.</strong> The project is your application. The Business is the legal entity that receives the money. Financial Setup connects them, and a project without that connection can do everything except get paid.</LI>
                <LI><strong>Business ≠ wallet account.</strong> The Business has a wallet; the wallet has segregated accounts. Accounts are where value separates by campaign, store or event.</LI>
              </UL>
              <Callout>
                <strong>Authority flows down, never up.</strong> Your key identifies the Project;
                the Project determines the Business; the Business determines the wallet and its
                accounts. No field in your request picks the owner — the ids you send{' '}
                <em>select</em> resources within what is already yours, they never grant access to
                anything else.
              </Callout>

              <H3 id="account">Account</H3>
              <P>
                Your personal profile, at <Code>/conta</Code>. You sign in with an email and a
                six-digit code: there is no password to choose, forget or reuse.
              </P>
              <UL>
                <LI><strong>Profile</strong> — the name people who share a workspace with you see. The email is your identifier and is not editable.</LI>
                <LI><strong>Security</strong> — describes the real model: a code by email, a session in a cookie. There are no password or MFA controls because neither exists.</LI>
                <LI><strong>Sessions</strong> — your open sessions, with origin and last use, and a button to end all the others. This is the screen for the day you lose a laptop.</LI>
                <LI><strong>Sign out</strong> — asks for confirmation. Cancel keeps the session; confirming ends it, and the browser back button does not bring it back.</LI>
              </UL>

              <H3 id="workspace">Workspaces, members and roles</H3>
              <P>
                A workspace is <em>who</em> has access. Creating one is immediate and involves
                nobody at Banzami.
              </P>
              <div style={{ overflowX: 'auto', maxWidth: '100%', margin: '0 0 14px' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 520, fontSize: 13 }}>
                  <thead><tr style={{ textAlign: 'left', color: '#a89a9e' }}>
                    <th style={{ padding: '8px 8px', borderBottom: '1px solid #F5E9E7' }}>Role</th>
                    <th style={{ padding: '8px 8px', borderBottom: '1px solid #F5E9E7' }}>Can</th>
                  </tr></thead>
                  <tbody>
                    {[
                      ['Owner', 'Everything, including inviting, changing roles, archiving and deleting. The last owner cannot leave — there is no workspace without one.'],
                      ['Admin', 'Manage members, projects and keys. Cannot change or remove an Owner or another Admin, and cannot appoint Admins.'],
                      ['Developer', 'Create and manage projects, keys and webhooks. Does not manage members.'],
                      ['Finance', 'See balances, transactions and settlements. Does not issue keys.'],
                      ['Viewer', 'Read. Nothing else.'],
                    ].map((r, i) => (
                      <tr key={i}>
                        <td style={{ padding: '8px 8px', borderBottom: '1px solid #F5E9E7', color: INK, fontWeight: 700 }}>{r[0]}</td>
                        <td style={{ padding: '8px 8px', borderBottom: '1px solid #F5E9E7', color: '#5a4a4e' }}>{r[1]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <UL>
                <LI><strong>Inviting</strong> produces a link the Console copies for you. Whoever accepts it signs in with their own email and their own code — the invitation names the role, not the person.</LI>
                <LI><strong>Leaving</strong> a workspace is always possible, except for the last Owner: a workspace is never left without one.</LI>
                <LI><strong>Transferring ownership</strong> takes two steps: an Owner gives the Owner role to another member and then leaves or changes their own role. There is no single button that hands the workspace over, so there is no moment without an owner.</LI>
                <LI><strong>Archiving</strong> a workspace is refused while it still has active projects, and the refusal says how many. Archive those first.</LI>
                <LI><strong>Deleting</strong> is only possible when the workspace is genuinely empty. A workspace with history is archived; one that never held anything disappears.</LI>
              </UL>

              <H3 id="activity">Workspace activity</H3>
              <P>
                Under <Code>Settings · Activity</Code>, the workspace's administrative record: who
                changed what, to whom, and when. Invitations, joins and departures, role changes
                and removals, and the changes made to the workspace itself, to its projects and to
                its keys. A role change shows <strong>both halves</strong> of the transition — from
                which role to which — because that is usually the question.
              </P>
              <UL>
                <LI><strong>This workspace and no other.</strong> The record is filtered by the workspace you are already a member of; there is no way to ask for somebody else's.</LI>
                <LI><strong>Owners and Admins.</strong> Seeing who has access and who granted it is a management question, and those are the roles that can change it too.</LI>
                <LI><strong>It is nobody's account security history.</strong> Personal sessions, sign-in codes and account settings are not here — they live under <Code>/conta</Code>, and belong to that person alone.</LI>
                <LI><strong>No secrets.</strong> A key that was created appears as an event; its value, its prefix and webhook secrets appear nowhere.</LI>
                <LI><strong>Permanent.</strong> It cannot be edited or deleted from the Console, and it outlives what it describes: a deleted project still appears here.</LI>
              </UL>
              <Callout>
                <strong>Activity is not Logs.</strong> Activity answers "who has authority here, and
                who gave it to them" — workspace administration. <Code>Logs</Code> answers "what did
                my application ask the API" — one project's integration traffic. They are different
                pages because they are different questions.
              </Callout>

              <H3 id="project">Projects</H3>
              <P>
                The project is the unit of integration: one application, one set of keys, its
                webhooks and its logs. One application, one project.
              </P>
              <UL>
                <LI><strong>The Project ID does not change.</strong> Renaming changes the label and nothing else — the id you wrote into your configuration stays valid.</LI>
                <LI><strong>Deleting</strong> is possible while the project has no history at all: no key ever issued, no request logged, no financial connection. The Console says what is in the way.</LI>
                <LI><strong>Archiving</strong> is what you do to a project that <em>had</em> history. Archiving revokes the active keys and says how many — and from then on a call with any of them answers <Code>401</Code>.</LI>
                <LI>An archived project leaves the selector and returns behind &ldquo;Show archived&rdquo;, marked as archived.</LI>
              </UL>

              <H3 id="financial-setup">Financial Setup</H3>
              <P>
                This is where a project gains a financial owner. Without it everything works —
                keys, webhooks, integration — <strong>except receiving money</strong>. That split
                is deliberate: you can build and test the whole integration before there is a
                verified legal entity behind it.
              </P>
              <P>There are two paths, and they are genuinely different:</P>
              <UL>
                <LI><strong>A new Business.</strong> You submit an application — entity, representative, documents — and Banzami verifies it. It is a human decision, and it takes as long as it takes.</LI>
                <LI><strong>An existing Business.</strong> If the entity is already verified with Banzami, its owner issues you a <strong>consent code</strong>. Paste it, and the project connects to that Business without repeating the verification. The code is single-use: connecting consumes it.</LI>
              </UL>
              <P>
                The state is readable over the API at <Code>GET /v1/financial-setup</Code>, so your
                application knows what to show while it is not ready.
              </P>
              <Callout tone="warn">
                The fee is not yours to choose. Banzami assigns pricing to the Business; no field
                in your request selects it, and no path through the Console changes it.
              </Callout>

              <H3 id="keys">API keys</H3>
              <UL>
                <LI>The <strong>name</strong> is yours: it tells the key apart in the list and in Workspace activity, and changes nothing about what it can do.</LI>
                <LI><strong>Scopes</strong> are chosen at creation and do not change. A read-only key will never write.</LI>
                <LI>The secret appears <strong>exactly once</strong>, in the creation dialog, with a copy button. After that the list shows the prefix and a mask.</LI>
                <LI><strong>Rotating</strong> creates the successor and revokes the predecessor in the same step: the new key works at once, and the old one stops working at that instant. To swap without failures on your server, create a new key first, put it in use, and only then revoke the old one.</LI>
                <LI><strong>Revoking</strong> is immediate: the next call with that key answers <Code>401</Code>.</LI>
                <LI>The list shows <strong>last use</strong>, which is how you find the key nobody uses any more.</LI>
              </UL>
              <P>
                Where to keep the key and what never to do with it is in{' '}
                <a href="/docs/en/trust" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>Security</a>.
              </P>

              <H3 id="console-webhooks">Webhooks</H3>
              <UL>
                <LI><strong>Registering</strong> an HTTPS endpoint returns the signing secret exactly once.</LI>
                <LI><strong>Events</strong> lists what your project emitted; opening one shows its deliveries, with status and response code.</LI>
                <LI><strong>Redelivering</strong> repeats the same delivery — it is that delivery again, not a new one.</LI>
                <LI><strong>Rotating the secret</strong> issues a new one, revealed once; the endpoint stays.</LI>
                <LI><strong>Disabling</strong> stops queueing new events for this endpoint, without deleting it or its history. Events emitted while it is disabled are not delivered to it afterwards; <strong>re-enabling</strong> starts receiving again from that moment, and the ones it missed are still listed under Events.</LI>
                <LI>A delivery that fails is <strong>retried</strong>, up to 5 attempts, with growing backoff. The full contract, and what to do when nothing arrives, are in{' '}
                  <a href="/docs/en/guides#redelivery" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>Redelivery contract</a> and{' '}
                  <a href="/docs/en/guides#troubleshooting" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>Troubleshooting</a>.</LI>
              </UL>

              <H3 id="logs">Balances, transactions and logs</H3>
              <UL>
                <LI><strong>Balances</strong> shows the accounts of the owner your project is bound to, and what is in each.</LI>
                <LI><strong>Transactions</strong> shows the project&rsquo;s real movement — not a sample, not an example.</LI>
                <LI><strong>Logs</strong> lists the requests your key made to the API, with <Code>request_id</Code>. It is the first place to open when something answered what you did not expect. For who changed what in the workspace, that is <a href="#activity" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>Activity</a> — a different question, a different page.</LI>
              </UL>
              <P style={{ fontSize: 13, color: '#a89a9e' }}>
                No Console page renders illustrative data. If a list is empty it is because there
                is nothing in it — not because the screen has not been wired up yet.
              </P>
            </Section>
    </>
  );
}

export function EnGuides({ copy }: { copy: CopyFn }) {
  return (
    <>
<Section id="guides">
              <H2>Guides</H2>
              <PageLede>Practical integration guidance — payment sessions, links, QR, idempotency, errors and webhooks. The framing is <strong>SDK-first</strong>; where curl/HTTP appears, it is protocol reference material.</PageLede>
              <NextSteps label="Related:" links={[{ href: '/docs/en/reference', text: 'API Reference' }, { href: '/docs/en/testing', text: 'Sandbox testing' }, { href: '/docs/en/sdk', text: 'SDKs' }]} />
              <P>Task-oriented guides for the verified Sandbox surfaces. Where HTTP/curl appears, it is protocol reference / diagnostic material — Banzami is SDK-first.</P>

<H3 id="segregated-accounts">Where the money lands: financial setup and accounts <Badge tone="ok">Available in Sandbox</Badge></H3>
              <P>
                Two different questions, answered in different places — and the distinction is what
                makes the platform safe to use:
              </P>
              <UL>
                <LI><strong>Who</strong> owns the money? — the <strong>project&rsquo;s financial setup</strong> answers. It is established by the operator, it does not change, and your application never names it in a request.</LI>
                <LI><strong>Which</strong> of that owner&rsquo;s accounts receives? — the <strong>wallet account</strong> answers. That one your application chooses, among its own.</LI>
              </UL>
              <P>
                A donation platform needs exactly this: each campaign accumulates in its own account,
                without mixing with the others, and settlement happens from that account at close.
              </P>
              <SegregatedAccountsDiagram l={{
                title: 'Segregated accounts: one financial owner, one account per campaign',
                project: 'Your project',
                owner: 'financial owner',
                ownerNote: 'from financial setup — never from your request',
                accounts: ['Campaign A', 'Campaign B', 'Campaign C'],
                accountNote: 'one wallet account each',
              }} />
              <P>
                In practice, with your developer key:
              </P>
              <UL>
                <LI>Open one account per campaign with <Code>createWalletAccount</Code> — give the purpose and your reference, <strong>never</strong> a wallet or a merchant.</LI>
                <LI>Create the payment with <Code>createPaymentSession</Code>, passing that campaign&rsquo;s <Code>walletAccountId</Code>.</LI>
                <LI>If you omit <Code>walletAccountId</Code>, the payment lands in the project&rsquo;s default account — enough when you do not need to segregate.</LI>
              </UL>
              <P style={{ fontSize: 13, color: '#a89a9e' }}>
                The server always checks that the account you name is yours. Another owner&rsquo;s account
                answers <Code>404</Code> — not <Code>403</Code> — so nobody can discover other people&rsquo;s
                accounts from the status code. And naming <Code>merchant_id</Code> or <Code>wallet_id</Code> is
                refused with <Code>400 PAYEE_NOT_ALLOWED</Code>: choosing an account is selection, choosing an
                owner would be authority.
              </P>

              <H3 id="charges">Create a charge <Badge tone="ok">Available in Sandbox</Badge></H3>
              <P>
                A charge starts from a <strong>payment link</strong> or a <strong>payment session</strong>: create the intent,
                present the link/QR to the payer and track the confirmation (by polling and/or webhook). In the Banzami model,
                the operator executes the payment and owns the financial truth — your application only creates the journey and reacts to state.
              </P>
              <UL>
                <LI><strong>Testable in Sandbox:</strong> create sessions/links, present the QR, confirm the payment and issue the receipt. The session QR encodes the hosted pay URL (<Code>pay.banzami.com/pay/{'{slug}'}</Code>): any phone camera opens the pay page.</LI>
                <LI><strong>Reserved for Production:</strong> real-money movement — <em>Production in preparation</em>.</LI>
              </UL>

              <H3 id="transfers">Transfers <Badge tone="ok">Available in Sandbox</Badge></H3>
              <P>
                Move value between two accounts of your own project. The request names the source account,
                the destination account, the amount in minor units (AOA) and an idempotency key. In the Sandbox
                the transfer confirms synchronously, with atomic debit and credit in the ledger — the owner&rsquo;s
                total does not change, only how it is distributed across accounts.
              </P>
              <P>
                Replaying the same idempotency key returns the original transfer without moving funds twice;
                reusing it with a different request answers <Code>409</Code> rather than silently repeating.
                Verified end to end in the Sandbox. Never real money — <em>Production in preparation</em>.
              </P>
              <Callout tone="warn">
                <strong>What Transfers is, and what it is not.</strong> It moves value between two accounts of the
                {' '}<strong>same owner</strong> that your project&rsquo;s financial setup fixes — Campaign A to Campaign B of the
                same organisation, say. Nothing crosses the owner boundary: it is not a payout, not an application
                settlement (ADR-029), not a consumer-to-consumer P2P transfer. Naming an account that is not yours
                answers <Code>404</Code>, indistinguishable from one that does not exist.
              </Callout>
              <P style={{ fontSize: 13, color: '#a89a9e' }}>
                Credential: a project key with the <Code>transfers:write</Code> scope, on{' '}
                <Code>POST /v1/wallet-account-transfers</Code>. The owner comes from the financial setup — no request field can
                name it. See the{' '}
                <a href="/docs/en/reference#credentials" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>credential matrix</a>.
                Never real money — <em>Production in preparation</em>.
              </P>

              <H3 id="refunds">Refunds <Badge tone="ok">Available in Sandbox</Badge></H3>
              <P>
                Banzami refunds return, fully or partially, the value of an eligible payment confirmed in the Sandbox. Each request
                identifies the payment source, respects the amount already captured and is processed idempotently.
              </P>
              <UL>
                <LI><Code>ACQUIRING_PAYMENT</Code> — payment made over an external rail.</LI>
                <LI><Code>WALLET_PAYMENT</Code> — native payment between Banzami wallets.</LI>
                <LI>The currency is validated against the original source.</LI>
                <LI>Partial refunds are allowed up to the payment&rsquo;s accrued cap.</LI>
                <LI>Reusing the same <Code>idempotency_key</Code> does not refund twice.</LI>
                <LI>Production remains <em>Production in preparation</em>.</LI>
              </UL>
              <P>
                <strong>Request fields:</strong> <Code>source_type</Code> (<Code>ACQUIRING_PAYMENT</Code> or
                {' '}<Code>WALLET_PAYMENT</Code>), <Code>source_id</Code>, <Code>amount_minor</Code>, <Code>currency</Code>
                {' '}and <Code>idempotency_key</Code>.
              </P>
              <Callout>
                <strong>Path verified in Sandbox.</strong> Refunds were validated end to end through the public gateway
                (<Code>POST /v1/refunds</Code>): acquiring and wallet sources, full and partial refunds, the cumulative cap per
                source, currency validation against the source, idempotent replay and <Code>idempotency_key</Code> conflict,
                request authorisation and correction of the receipt&rsquo;s state. There is never real money — <em>Production in preparation</em>.
              </Callout>

              <P style={{ fontSize: 13, color: '#a89a9e' }}>
                Technical reference: the payment source is typed per BANZA ADR-017. Credential: a project key with the
                {' '}<Code>refunds:write</Code> scope, on <Code>POST /v1/refunds</Code>. The refund debits the account
                that <strong>received</strong> the payment — not the owner&rsquo;s general balance — and another
                project&rsquo;s payment answers <Code>404</Code>. See the{' '}
                <a href="/docs/en/reference#credentials" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>credential matrix</a>.
                Never real money — <em>Production in preparation</em>.
              </P>
              <H3 id="receipts">Receipts and public verification</H3>
              <P>
                Every confirmed payment has a <strong>receipt</strong>: a document carrying a{' '}
                <strong>public proof reference</strong> and a QR. Whoever holds that reference can confirm, with no
                account and no key, that the payment exists and what state it is in. The PDF receipt is issued to the
                Business that received the payment, in the Banzami Business app — a project key does not download
                receipts.
              </P>
              <P><strong>The reference.</strong> The current format is called <Code>SECURE_V1</Code>:</P>
              <CodeBlock label="SECURE_V1 format" onCopy={copy} {...enCopy} raw={`BZM-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX

# 24 symbols in six groups of four, after BZM-.
# Alphabet: 0-9 and A-Z without I, L, O and U — no letter reads as a digit.
# 120 bits: it cannot be guessed or enumerated.`} />
              <UL>
                <LI><strong>It is a bearer capability.</strong> Whoever holds the reference sees the amount, both parties&rsquo; @banza and the description. Share it the way you would share the receipt itself.</LI>
                <LI><strong>It is exact.</strong> There is no normalisation: lower-case letters, spaces or an extra hyphen answer <Code>404</Code>, exactly like a reference that does not exist. Copy it; do not retype it.</LI>
                <LI>Older eight-symbol references (<Code>BZM-XXXX-XXXX</Code>) still verify; new ones are always <Code>SECURE_V1</Code>.</LI>
              </UL>
              <P><strong>Verifying.</strong> The receipt&rsquo;s QR opens <Code>https://banzami.com/r/&#123;reference&#125;</Code>, the public verification page. The same check exists as a public API, with no authentication:</P>
              <CodeBlock label="curl · verify a receipt" onCopy={copy} {...enCopy} raw={`curl https://sandbox-api.banzami.com/v1/public/proofs/BZM-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX`} />
              <div style={{ overflowX: 'auto', maxWidth: '100%', margin: '0 0 14px' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 520, fontSize: 13 }}>
                  <thead><tr style={{ textAlign: 'left', color: '#a89a9e' }}>
                    <th style={{ padding: '8px 8px', borderBottom: '1px solid #F5E9E7' }}>HTTP</th>
                    <th style={{ padding: '8px 8px', borderBottom: '1px solid #F5E9E7' }}>Response</th>
                    <th style={{ padding: '8px 8px', borderBottom: '1px solid #F5E9E7' }}>Means</th>
                  </tr></thead>
                  <tbody>
                    {[
                      ['200', 'the receipt status + amount, parties, date', 'Verified. Read status: CONFIRMED, PENDING, REVERSED, CANCELLED, FAILED or EXPIRED.'],
                      ['404', 'exists: false, status NOT_FOUND', 'It does not exist — or the reference was altered. The two answers are the same on purpose.'],
                      ['503', 'exists: false, status UNAVAILABLE', 'Verification is temporarily unavailable. Try again later; do not conclude it is forged.'],
                    ].map((r, i) => (
                      <tr key={i}>
                        <td style={{ padding: '8px 8px', borderBottom: '1px solid #F5E9E7', color: INK, fontWeight: 700 }}><Code>{r[0]}</Code></td>
                        <td style={{ padding: '8px 8px', borderBottom: '1px solid #F5E9E7', color: '#5a4a4e' }}>{r[1]}</td>
                        <td style={{ padding: '8px 8px', borderBottom: '1px solid #F5E9E7', color: '#5a4a4e' }}>{r[2]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <UL>
                <LI><strong>Refunded or reversed</strong>, a receipt does not disappear: it becomes <Code>REVERSED</Code>. The proof that the payment existed remains, and says it was undone.</LI>
                <LI>
                  <strong>Do not confuse it with the app&rsquo;s short reference.</strong> The Banzami app shows an
                  eight-character reference on every transfer (for example <Code>5AD6BEA0</Code>): it is the start of the
                  transfer&rsquo;s id, it helps the person recognise the entry in their list, and it{' '}
                  <strong>does not verify</strong> at <Code>/r/</Code>. Only the receipt&rsquo;s <Code>BZM-…</Code>{' '}
                  reference is a public proof.
                </LI>
              </UL>
</Section>
<Section id="webhooks">
              <H2>Webhooks <Badge tone="ok">{BADGE_LABELS_EN.ok}</Badge></H2>
              <P>
                Use webhooks to confirm events on your server without relying on the browser or polling alone. Banzami signs
                every event; your endpoint verifies the signature and reacts idempotently.
              </P>
              <Callout>
                <strong>Full journey verified in Sandbox.</strong> End-to-end delivery was confirmed against the implemented DOA
                endpoint: a real <Code>payment_session.paid</Code> emitted by the operator was delivered by the outbox, the canonical{' '}
                <Code>banza-signature</Code> header was accepted, the donation was confirmed <strong>exactly once</strong> and the
                receipt was recorded. In the controlled test no external email was sent; in normal flows with an email contact, DOA
                delivers the receipt to the donor. Redelivery of the same event was <strong>deduplicated</strong> (no duplicated
                effect). There is never real money — <em>Production in preparation</em>.
              </Callout>
              <Callout>
                <strong>Honest scope.</strong> Outbound delivery is real and verified end to end: Banzami emits{' '}
                <Code>payment_session.paid</Code> because money moved, its outbox delivers over the public internet to the
                registered HTTPS endpoint, and the reference application accepts it. This section used to say delivery to an
                external sink remained simulated — true when written, and no longer. What still does not exist is{' '}
                <strong>Production</strong>: this is the Sandbox, and no real money ever moves.
              </Callout>
              <H3 id="how-it-works">How it works</H3>
              <UL>
                <LI>Banzami sends a <Code>POST</Code> to your endpoint with the event body as JSON.</LI>
                <LI>The signature travels in the <Code>banza-signature</Code> header, formatted <Code>t=&lt;unix&gt;,v1=&lt;hmac_sha256_hex&gt;</Code>.</LI>
                <LI>The signature is HMAC-SHA256 over <Code>&quot;{'{'}t{'}'}.{'{'}body{'}'}&quot;</Code>, with a <strong>5-minute</strong> replay tolerance.</LI>
                <LI>Process <strong>idempotently</strong> and answer <Code>2xx</Code> fast; delivery is at-least-once, unordered, with redelivery on failure.</LI>
              </UL>
              <Callout tone="warn">
                <strong>Verify the signature before you parse the event.</strong> Read the raw body,
                check it against <Code>banza-signature</Code>, and only then treat the JSON as
                something that came from Banzami. Anything on the public internet can POST to your
                endpoint; until the signature checks out, the body is a stranger&apos;s claim about
                your money. Re-serialising the JSON before verifying changes the bytes and the
                signature stops matching — read it once, as text.
              </Callout>
              <CodeBlock label="ts · verify and handle an event" raw={SAMPLE_WEBHOOK} onCopy={copy} {...enCopy} />
              <CodeBlock label="json · event envelope (implemented in Sandbox)" raw={SAMPLE_WEBHOOK_ENVELOPE} onCopy={copy} {...enCopy} />
              <P style={{ fontSize: 13, color: '#a89a9e' }}>
                The envelope above is the shape implemented in the Sandbox: <Code>id</Code> (dedupe on it), <Code>type</Code>{' '}
                (one of the verified catalogue below), <Code>created_at</Code> and <Code>data</Code> with the event object.
              </P>
              <H3 id="redelivery">Redelivery contract</H3>
              <UL>
                <LI>At-least-once delivery, no ordering guarantee — handle every event <strong>idempotently</strong> (dedupe by event id).</LI>
                <LI>Signature in <Code>banza-signature</Code> with a <strong>5-minute</strong> timestamp (replay) tolerance.</LI>
                <LI>Implemented in the Sandbox: up to <strong>5 attempts</strong> per delivery — the first and, after each failure, another after{' '}
                  <Code>1&nbsp;min</Code> → <Code>5&nbsp;min</Code> → <Code>30&nbsp;min</Code> → <Code>2&nbsp;h</Code>. After the fifth failure the delivery is <Code>FAILED</Code>; you can replay it.</LI>
                <LI>Any <Code>2xx</Code> from your endpoint counts as delivered; answer fast and process asynchronously.</LI>
                <LI><em>Note:</em> this is the contract implemented and verified in the Sandbox; Production behaviour is not claimed (Production in preparation).</LI>
              </UL>
              <H3 id="manage-endpoint">Manage the endpoint with your project key <Badge tone="ok" /></H3>
              <P>
                The endpoint that receives <strong>your</strong> events is managed with the
                <strong> project key</strong> — no merchant credential is needed, or possible.
                The owner comes from the project&rsquo;s financial setup; none of these requests accepts a{' '}
                <Code>merchant_id</Code>, because there is no field for one.
              </P>
              <CodeBlock label="ts · register and rotate the secret" raw={SAMPLE_WEBHOOK_MANAGE} onCopy={copy} {...enCopy} />
              <UL>
                <LI>The <Code>secret</Code> is returned <strong>exactly once</strong>, on registration and on rotation. No later read brings it back — store it immediately.</LI>
                <LI><Code>webhooks:read</Code> sees endpoints, events and deliveries. <Code>webhooks:write</Code> registers, disables, redelivers and rotates the secret. A read scope never authorises a write.</LI>
                <LI>Another project&rsquo;s endpoint answers <Code>404</Code> — never <Code>403</Code> — so an id cannot be used to discover other people&rsquo;s integrations.</LI>
              </UL>
              <Callout tone="warn">
                <strong>Rotation is immediate, not overlapping.</strong> The signature is checked
                against <em>one</em> secret. Update your receiver first and rotate afterwards —
                or rotate at a moment when a short window of refused deliveries is acceptable.
                Because delivery is <Code>at-least-once</Code> with retries, a delivery refused in
                that window is <strong>not</strong> a lost event: it is tried again.
              </Callout>

              <H3 id="events">Events</H3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '0 0 14px', maxWidth: 660 }}>
                {EVENTS.map((e) => (
                  <span key={e} style={{ fontFamily: mono, fontSize: 12.5, fontWeight: 700, color: '#9A1B22', background: '#FFF1F0', border: '1px solid #F7DAD7', borderRadius: 8, padding: '4px 9px' }}>{e}</span>
                ))}
              </div>
              <P>
                This is the <strong>verified event catalogue</strong> — only events whose emission and contract are verified
                in the current Sandbox are listed; nothing outside it is a contractual event name. Payment confirmation and
                settlement are <strong>distinct</strong> events with distinct business effects: <Code>payment_session.paid</Code>{' '}
                confirms the payment; <Code>application_settlement.completed</Code> concludes the settlement.
              </P>
            
              <H3 id="troubleshooting">Troubleshooting</H3>
              <P>
                The thirteen problems that actually come up, and what to do about each. In every
                case, keep the <Code>request_id</Code> from the response before doing anything else.
              </P>
              <div style={{ overflowX: 'auto', maxWidth: '100%', margin: '0 0 14px' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 560, fontSize: 13 }}>
                  <thead><tr style={{ textAlign: 'left', color: '#a89a9e' }}>
                    <th style={{ padding: '8px 8px', borderBottom: '1px solid #F5E9E7' }}>What you see</th>
                    <th style={{ padding: '8px 8px', borderBottom: '1px solid #F5E9E7' }}>What it usually is</th>
                    <th style={{ padding: '8px 8px', borderBottom: '1px solid #F5E9E7' }}>What to do</th>
                  </tr></thead>
                  <tbody>
                    {[
                      ['401 UNAUTHORIZED', 'The key is missing, was revoked or rotated, or is not a Sandbox key.', 'Check it under API keys: if it reads Revoked, use the successor. If you created it seconds ago, confirm you copied the whole secret.'],
                      ['403 INSUFFICIENT_SCOPE', 'A missing scope. Scopes are fixed at creation and never change.', 'Compare the key’s scopes with what the route requires in the reference. If one is missing, create a new key — the existing one will never gain it.'],
                      ['403 PAYMENTS_UNAVAILABLE', 'The project has no completed financial setup.', 'GET /v1/financial-setup reports the state. Complete Financial Setup; until then the project can do everything except get paid.'],
                      ['404 on a resource that exists', 'It exists, and belongs to another project.', 'That is deliberate: a 403 here would let you enumerate other people’s resources. Check you are using the key of the project that created it.'],
                      ['409 IDEMPOTENCY_KEY_REUSED', 'The same Idempotency-Key with a different body.', 'An idempotency key belongs to one request. If the body changed, it is a different request: use a different key.'],
                      ['400 MISSING_FIELD · INVALID_AMOUNT', 'A missing field, or one with the wrong type.', 'The message names the field. Amounts are integers in minor units — 250 Kz is 25000, not 250.'],
                      ['429 RATE_LIMITED', 'Too many requests, or too many codes requested.', 'Slow down and retry with backoff. Retrying immediately extends the window rather than shortening it.'],
                      ['A payment stays pending', 'The payer has not finished.', 'A pending payment is a normal state, not an error. Wait for the webhook; never confirm anything from a timeout.'],
                      ['The webhook never arrives', 'The endpoint is not public HTTPS, or it answers slowly.', 'Open the event’s deliveries in the Console: they show the code your server returned. A slow 2xx is treated as a failure.'],
                      ['The signature does not match', 'The body was re-serialised before verifying.', 'Verify over the RAW body. Parsing the JSON and serialising it again changes the bytes, and the signature is over the bytes.'],
                      ['A refund is refused', 'The amount exceeds what is left, the receiving account no longer has the balance, or the payment is not refundable.', 'The message and the code say which (REFUND_EXCEEDS_CAPTURED, REFUND_NOT_FUNDABLE, INVALID_PAYMENT_STATUS). Nothing was returned: fix it and retry with a new idempotency key.'],
                      ['The receipt does not verify', '404: the reference does not exist or was altered. 503: verification is unavailable.', 'Copy the BZM-… reference without retyping it — there is no normalisation. A 503 is retried later and does not mean the receipt is forged.'],
                      ['A settlement does not proceed', 'The account has no balance, or the beneficiary is not eligible.', 'GET /v1/financial-setup shows what is blocking. Gross is read from the account: an empty account has nothing to settle.'],
                    ].map((r, i) => (
                      <tr key={i}>
                        <td style={{ padding: '8px 8px', borderBottom: '1px solid #F5E9E7', color: INK, fontWeight: 700, whiteSpace: 'nowrap' }}>{r[0]}</td>
                        <td style={{ padding: '8px 8px', borderBottom: '1px solid #F5E9E7', color: '#5a4a4e' }}>{r[1]}</td>
                        <td style={{ padding: '8px 8px', borderBottom: '1px solid #F5E9E7', color: '#5a4a4e' }}>{r[2]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Callout tone="warn">
                When you ask for help, send the <Code>request_id</Code>, the timestamp, the
                environment and the operation. <strong>Never send the key, the webhook secret, an
                OTP code or a session token</strong> — nothing we need in order to help is a secret.
              </Callout>
            </Section>
    </>
  );
}

export function EnDoa({ copy }: { copy: CopyFn }) {
  return (
    <>
<Section id="doa">
              <H2>Reference implementation — DOA</H2>
              <PageLede>A real application, running, integrating Banzami through exactly the public contracts in this documentation.</PageLede>
              <NextSteps label="Next:" links={[{ href: '/docs/en/console', text: 'The Console' }, { href: '/docs/en/guides', text: 'Guides' }, { href: '/docs/en/reference', text: 'API Reference' }]} />

              <H3 id="doa-what">What DOA is, and why it is here</H3>
              <P>
                <a href="https://www.doadoa.app" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>DOA</a>{' '}
                is an Angolan crowdfunding platform. Someone creates a campaign, shares a link or
                a QR, and anyone who wants to donates in Kwanza. It is a real application, with
                real donors, running on the Banzami Sandbox.
              </P>
              <Callout>
                <strong>DOA is not a special tenant.</strong> It has no endpoints of its own, no
                scopes of its own, and no code path that names it. It does exactly what any
                integration does, with the same contracts that are in this documentation — which
                is precisely what makes it useful as an example. If anything here only worked for
                DOA, it would not be documented.
              </Callout>

              <H3 id="doa-boundary">The boundary: what is yours, and what is Banzami&rsquo;s</H3>
              <P>
                This is the most important decision in any integration, and the easiest to get
                wrong in the expensive direction: reimplementing money.
              </P>
              <div style={{ overflowX: 'auto', maxWidth: '100%', margin: '0 0 14px' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 520, fontSize: 13 }}>
                  <thead><tr style={{ textAlign: 'left', color: '#a89a9e' }}>
                    <th style={{ padding: '8px 8px', borderBottom: '1px solid #F5E9E7' }}>DOA owns</th>
                    <th style={{ padding: '8px 8px', borderBottom: '1px solid #F5E9E7' }}>Banzami owns</th>
                  </tr></thead>
                  <tbody>
                    {[
                      ['Campaigns: creating, editing, closing', 'The money: balances, accounts, the ledger'],
                      ['The donor experience', 'Payment execution'],
                      ['Campaign state (active, closed, settled)', 'Pricing and the fee'],
                      ['Who can manage what, on DOA’s side', 'Receipts and their public verification'],
                      ['The application’s business logic', 'Settlement to the beneficiary'],
                    ].map((r, i) => (
                      <tr key={i}>
                        <td style={{ padding: '8px 8px', borderBottom: '1px solid #F5E9E7', color: INK, fontWeight: 600 }}>{r[0]}</td>
                        <td style={{ padding: '8px 8px', borderBottom: '1px solid #F5E9E7', color: '#5a4a4e' }}>{r[1]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <SegregatedAccountsDiagram l={{
                title: 'Segregated accounts: one financial owner, one account per campaign',
                project: 'Your project',
                owner: 'financial owner',
                ownerNote: 'from financial setup — never from your request',
                accounts: ['Campaign A', 'Campaign B', 'Campaign C'],
                accountNote: 'one wallet account each',
              }} />
              <P>
                DOA never stores a balance of its own. When it needs to know what a campaign has
                received, it asks Banzami — because the alternative is two numbers that one day
                diverge, and on that day one of them is wrong and nobody knows which.
              </P>

              <H3 id="doa-prepare">Preparing the project</H3>
              <P>
                Everything DOA does starts like any other integration — a developer account, a
                workspace and a project. DOA received none of these steps differently.
              </P>
              <ol style={{ margin: '0 0 14px', padding: '0 0 0 20px', maxWidth: 660, display: 'flex', flexDirection: 'column', gap: 7 }}>
                <LI>Sign in to the <a href="/docs/en/console" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>Console</a>, create a <strong>workspace</strong> and, inside it, a <strong>project</strong> for the application.</LI>
                <LI>
                  Complete the <strong>financial setup</strong>. DOA receives donations for beneficiaries, so it
                  needs a Business. There are two paths: <strong>apply for a new Business</strong>, which Banzami
                  reviews before the project can receive; or <strong>connect a Business that already exists</strong>{' '}
                  with the consent code its owner generates in the Banzami Business app. See{' '}
                  <a href="/docs/en/get-started#financial-setup" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>Financial setup</a>.
                </LI>
                <LI>
                  Create a <strong>secret key</strong> with the scopes this pattern uses, and only those:{' '}
                  <Code>identity:read</Code>, <Code>wallet_accounts:create</Code>, <Code>wallet_accounts:read</Code>,{' '}
                  <Code>payment_sessions:write</Code>, <Code>payment_sessions:read</Code>,{' '}
                  <Code>webhooks:write</Code>, <Code>webhooks:read</Code> and{' '}
                  <Code>application_settlements:write</Code>. Settlement has a scope of its own: being able to
                  take payments never carries, by accident, the ability to pay money out.
                </LI>
                <LI>Install the SDK on the server: <Code>npm install @banzami/sdk</Code>.</LI>
                <LI>
                  Configure the server with <Code>BANZAMI_API_KEY</Code> (the <Code>bz_test_sk_</Code> key) and{' '}
                  <Code>BANZAMI_WEBHOOK_SECRET</Code> (the endpoint&rsquo;s secret, shown once when you register it). If
                  your business&rsquo;s pricing profile applies a fee to settlements, also{' '}
                  <Code>BANZAMI_FEE_DESTINATION</Code>: the @banza of your business&rsquo;s account that receives it. No
                  merchant_id, no wallet_id.
                </LI>
                <LI>
                  Before letting a campaign go live, ask whether the project can receive yet:{' '}
                  <Code>getFinancialSetup()</Code>. That is how DOA lets people create campaigns and does not let
                  them activate one until financial setup is complete.
                </LI>
              </ol>

              <H3 id="doa-flow">The whole journey</H3>
              <DonationFlowDiagram title="From donor to settlement: who does what, and with which call" steps={[
                { actor: 'Donor', what: 'picks a campaign and names an amount', how: "DOA's own business logic" },
                { actor: 'DOA', what: 'asks for a payment session', how: 'POST /v1/payment-sessions' },
                { actor: 'Banzami', what: 'returns the link and the QR', how: 'GET /v1/payment-sessions/{id}/link · /qr' },
                { actor: 'Donor', what: 'pays on the Banzami surface' },
                { actor: 'Banzami', what: 'moves the money and records the financial truth' },
                { actor: 'webhook', what: 'payment_session.paid — signed, at-least-once', how: 'DOA verifies the signature and processes idempotently' },
                { actor: 'DOA', what: 'marks the donation confirmed', how: "DOA's own state" },
                { actor: 'DOA', what: 'closes the campaign and asks for settlement', how: 'POST /v1/application-settlements' },
                { actor: 'webhook', what: 'application_settlement.completed — gross, fee and net' },
              ]} />
              <P>
                The donor pays on a Banzami page, not a DOA one. The session returns a link to{' '}
                <Code>pay.banzami.com/pay/…</Code> and a QR that encodes the same address; DOA shows one or the
                other and never builds a financial request itself. The donor coming back to DOA&rsquo;s page
                proves nothing — confirmation arrives on the webhook, or by reading the session on the server.
              </P>

              <H3 id="doa-accounts">One account per campaign</H3>
              <P>
                Every DOA campaign has its own segregated account under DOA&rsquo;s wallet. That is
                why a campaign&rsquo;s balance is a question with an answer, rather than a running
                total the application has to maintain.
              </P>
              <CodeBlock label="account per campaign" onCopy={copy} raw={`// When the campaign is activated, DOA opens the account that will receive it.
const account = await banzami.createWalletAccount({
  purpose:       'CAMPAIGN',
  referenceType: 'CAMPAIGN',
  referenceId:   campaign.id,      // YOUR reference, not ours
  label:         campaign.title,
});

// Keep the id. It is how settlement knows where to take the money from.
await db.campaigns.update(campaign.id, { banzami_wallet_account_id: account.id });`} />
              <P style={{ fontSize: 13, color: '#a89a9e' }}>
                <Code>reference_type</Code> and <Code>reference_id</Code> are yours: Banzami stores
                them and hands them back, and never interprets them. That is how your table joins
                to ours without either needing to know about the other.
              </P>

              <H3 id="doa-webhook">The webhook, the way DOA handles it</H3>
              <CodeBlock label="webhook" onCopy={copy} raw={`export async function POST(req) {
  // 1. The RAW body. Re-serialising the JSON changes the bytes,
  //    and the signature stops matching.
  const raw = await req.text();

  // 2. Verify BEFORE looking at the contents. constructEvent does both in the
  //    right order: it checks the signature, and only then returns the event.
  //    Do not JSON.parse(raw) separately — that is reading before verifying.
  //    (the client was created with { apiKey, webhookSecret })
  let event;
  try {
    event = banzami.webhooks.constructEvent(raw, req.headers.get('banza-signature') ?? '');
  } catch {
    return new Response('invalid signature', { status: 400 });
  }

  // 3. Idempotent on the event id. Delivery is at-least-once:
  //    this same event WILL arrive again, sooner or later.
  if (await db.events.seen(event.id)) return new Response('ok');
  await db.events.record(event.id);

  // 4. Only now the business effect.
  if (event.type === 'payment_session.paid') {
    // reference_id is the reference DOA gave the session when it created it.
    await confirmDonation(event.data.reference_id);
  }

  // 5. 2xx quickly. Slow work goes on a queue, not in here.
  return new Response('ok');
}`} />
              <Callout tone="warn">
                Steps 1 and 3 are the ones people forget. Without the raw body the signature fails
                for a reason that looks like a Banzami bug; without deduplication on the event id,
                an ordinary redelivery duplicates the donation.
              </Callout>

              <H3 id="doa-receipt">The donor&rsquo;s receipt</H3>
              <P>
                When the donor pays, Banzami issues the payment&rsquo;s <strong>receipt</strong> — not DOA. The donor
                receives it in the Banzami app, with a public <Code>BZM-…</Code> reference and a QR that opens{' '}
                <Code>https://banzami.com/r/&#123;reference&#125;</Code>. The donation receipt DOA sends is something else: it is
                DOA&rsquo;s, it says which campaign received, and it may quote that reference.
              </P>
              <P>
                Anyone can confirm the receipt, with no account and no key, with{' '}
                <Code>GET /v1/public/proofs/&#123;reference&#125;</Code>: <Code>200</Code> with the status and the amount, or{' '}
                <Code>404</Code> if it does not exist or was altered. Whoever holds the reference sees the amount and both
                parties&rsquo; @banza — share it the way you would share the receipt itself. See{' '}
                <a href="/docs/en/guides#receipts" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>Receipts and public verification</a>.
              </P>

              <H3 id="doa-settlement">Settlement, and who decides what</H3>
              <P>
                When a campaign closes, DOA requests settlement of that campaign&rsquo;s account.
                The request carries neither an amount nor a rate — and that is not an omission for
                convenience, it is the design.
              </P>
              <CodeBlock label="settlement" onCopy={copy} raw={`const settlement = await banzami.createBusinessApplicationSettlement({
  sourceAccountId:      campaign.banzami_wallet_account_id,
  beneficiaryBanzaName: campaign.payout_banza,     // the @banza receiving it
  // Where the fee goes, when your pricing profile applies one. It must be an
  // account of YOUR business, of type APPLICATION or PLATFORM. Without it, a
  // settlement that carries a fee is refused with 422 FEE_DESTINATION_REQUIRED.
  feeDestinationBanzaName: process.env.BANZAMI_FEE_DESTINATION,
  referenceType:        'CAMPAIGN',
  referenceId:          campaign.id,               // your reference, returned on the webhook
  // A settlement moves money: the idempotency key is required, and it has to
  // survive a timeout. Store it before you make the request.
  idempotencyKey:       'idem_settlement_' + campaign.id,
});

// What comes back is already the result, computed by Banzami:
// {
//   gross_amount_minor:     100000,   // read from the account balance, not sent by you
//   application_fee_minor:    2000,   // the pricing assigned to the Business (200 bps)
//   net_amount_minor:        98000,   // what goes to the beneficiary
//   currency: "AOA", status: "COMPLETED"
// }
// -100000 + 2000 + 98000 = 0`} />
              <P>
                And the three parts sum to zero against the movement, which is the property that
                makes this auditable: <Code>-100000 + 2000 + 98000 = 0</Code>. The gross is the account&rsquo;s
                balance at the moment of the request; the fee is the one in the pricing profile Banzami assigned to
                your business, not a field you can send.
              </P>
              <Callout>
                <strong>A payment is not a settlement.</strong> A confirmed payment puts money in
                the campaign&rsquo;s account. Settlement is a second act, requested by you, that
                takes the money out. DOA requests it after the campaign closes — it does not
                happen on its own.
              </Callout>

              <H3 id="doa-credentials">Rotating and revoking credentials</H3>
              <UL>
                <LI><strong>Rotating the key.</strong> Create a new key with the same scopes, put it on the server, confirm <Code>GET /v1/me</Code> answers, and only then revoke the old one. Revocation is immediate: the next call with the old key answers <Code>401</Code>.</LI>
                <LI><strong>Rotating the webhook secret.</strong> <Code>rotateWebhookEndpointSecret</Code> returns a new secret, once. The cutover is immediate, not overlapping: update <Code>BANZAMI_WEBHOOK_SECRET</Code> on the server before you rotate, or the next deliveries fail verification.</LI>
                <LI><strong>A suspected leak.</strong> Revoke first, investigate after. A revoked key is not reactivated; you create another.</LI>
              </UL>

              <H3 id="doa-troubleshooting">When something does not go as expected</H3>
              <UL>
                <LI><Code>403 PAYMENTS_UNAVAILABLE</Code> when creating the session — the project has no completed financial setup yet. Check the state in the Console or with <Code>getFinancialSetup()</Code>. Retrying does not help.</LI>
                <LI><Code>403 INSUFFICIENT_SCOPE</Code> — the key lacks the operation&rsquo;s scope; the message names it. Create a key with that scope. Scopes are not added to an existing key.</LI>
                <LI><strong>The webhook does not arrive.</strong> Look at the endpoint&rsquo;s deliveries in the Console: your server&rsquo;s response code and the time of the attempt. An endpoint that answers outside <Code>2xx</Code> gets the delivery again.</LI>
                <LI><strong>The signature does not verify.</strong> It is almost always the body: it was read as JSON and serialised again. Verify over the raw body, with the endpoint&rsquo;s current secret.</LI>
                <LI><strong>The same event twice.</strong> That is expected — delivery is at-least-once. Handle it by the event&rsquo;s <Code>id</Code> and ignore what you have already processed.</LI>
                <LI><strong>The settlement is refused.</strong> The source account has to be your own account with a balance, and the beneficiary an existing <Code>@banza</Code>. Retry with the <strong>same</strong> idempotency key: a settlement that did happen does not happen twice.</LI>
                <LI><strong>When you ask for help</strong>, send the response&rsquo;s <Code>request_id</Code>, the time and the operation. Never send the key, the webhook secret or a sign-in code. See <a href="/docs/en/trust#support" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>Support</a>.</LI>
              </UL>

              <H3 id="doa-lessons">What DOA learned along the way</H3>
              <UL>
                <LI><strong>Never duplicate a balance.</strong> DOA shows what Banzami says. Two numbers that ought to be equal end up not being, and then someone has to decide which one is true.</LI>
                <LI><strong>Keep the <Code>request_id</Code> of everything.</strong> It is the first thing support asks for and the last thing anyone thinks to log.</LI>
                <LI><strong>One account per campaign, from the start.</strong> Separating value after it has been mixed is far harder than never mixing it.</LI>
                <LI><strong>Campaign state is DOA&rsquo;s; money state is Banzami&rsquo;s.</strong> A closed campaign with a pending settlement is a normal state, and the application has to know how to show it.</LI>
                <LI><strong>Financial readiness is a condition, not an error.</strong> Before Financial Setup is complete DOA lets you create campaigns and not activate them — rather than allowing everything and failing at the payment.</LI>
              </UL>
              <P style={{ fontSize: 13, color: '#a89a9e' }}>
                The examples above are minimal and sanitised: fictitious identifiers, no keys, no
                secrets and no internal ids. What they teach is the recommended pattern, not the
                story of how DOA got there.
              </P>
            </Section>
    </>
  );
}

export function EnReference({ copy }: { copy: CopyFn }) {
  return (
    <>
<Section id="api-reference">
              <H2>API Reference</H2>
              <PageLede>The <strong>protocol reference</strong> layer (API/OpenAPI). <strong>It is not the recommended implementation path</strong> — Banzami is SDK-first; use this reference for diagnostics, audits and advanced integrators.</PageLede>
              <NextSteps label="Next:" links={[{ href: '/docs/en/artifacts', text: 'Artifacts' }, { href: '/docs/en/guides', text: 'Guides' }, { href: '/docs/en/sdk', text: 'SDKs' }]} />
              <P>The reference splits into two areas: what you manage in the <strong>Console</strong> and what your application calls in the <strong>integration layer</strong>.</P>
              <P>
                Your application authenticates by sending the Sandbox <Code>bz_test_</Code> API key directly in the{' '}
                <Code>Authorization: Bearer …</Code> header and calls the integration layer at <Code>sandbox-api.banzami.com</Code>.
                <Code>bz_live_</Code> keys are <strong>rejected fail-closed</strong> — there is no Production key issuance.
              </P>

              <H3 id="console-management">Managed in the Console</H3>
              <P>
                Workspaces, projects, members and <strong>keys</strong> are managed in the Banzami Developers portal — through the
                interface, with a session and role-based permissions. It is not a public API to call directly, so its internal
                endpoints are not exposed here. The Overview, Webhooks and Logs show the project&rsquo;s real data —
                requests, latencies, errors and emitted events, correlatable by <Code>request_id</Code>.
              </P>

              <H3 id="credentials">Credentials and capabilities</H3>
              <P>
                Not every documented capability is callable with the same credential today. This matrix tells the truth per
                credential — so “Available in Sandbox” is always true <em>for you</em>, not just for the platform:
              </P>
              <div style={{ overflowX: 'auto', maxWidth: '100%', margin: '0 0 14px' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 560, fontSize: 13 }}>
                  <thead>
                    <tr style={{ textAlign: 'left', color: '#a89a9e' }}>
                      <th style={{ padding: '8px 10px', fontWeight: 800, borderBottom: '1px solid #F2E2E0' }}>Capability</th>
                      <th style={{ padding: '8px 10px', fontWeight: 800, borderBottom: '1px solid #F2E2E0' }}>Credential</th>
                      <th style={{ padding: '8px 10px', fontWeight: 800, borderBottom: '1px solid #F2E2E0' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {([
                      ['Console — sign in, workspaces, projects, members, keys', 'OTP session (email + code)', 'Operational in Sandbox'],
                      ['Console — Transactions, Webhooks, Logs and Workspace Activity', 'OTP session (email + code)', 'The project’s and workspace’s own real data'],
                      ['GET /v1/me (key identity)', 'Developer key bz_test_ (identity:read scope)', 'Available in Sandbox'],
                      ['Payment sessions', 'Developer key (payment_sessions:write / :read, project with financial setup complete)', 'Available in Sandbox'],
                      ['Payment links', 'Developer key (payment_links:write / :read, project with financial setup complete)', 'Available in Sandbox'],
                      ['Webhook endpoint registration (POST /v1/webhooks/endpoints)', 'Project key (webhooks:write); reads with webhooks:read', 'Available in Sandbox — the secret is returned exactly once'],
                      ['Outbound webhook delivery', '—', 'Available in Sandbox — real, signed deliveries to your HTTPS endpoint'],
                      ['Refunds (POST /v1/refunds)', 'Project key (refunds:write)', 'Available in Sandbox — the refund debits the account that received the payment'],
                      ['Transfers (POST /v1/wallet-account-transfers)', 'Project key (transfers:write)', 'Available in Sandbox — between accounts of the project’s own owner'],
                      ['Financial LIVE / banking rails / external providers', '—', 'Unavailable · fail-closed'],
                    ] as [string, string, string][]).map(([cap, cred, st]) => (
                      <tr key={cap}>
                        <td style={{ padding: '9px 10px', borderBottom: '1px solid #F5E9E7', fontWeight: 700, color: INK }}>{cap}</td>
                        <td style={{ padding: '9px 10px', borderBottom: '1px solid #F5E9E7', color: '#5a4a4e' }}>{cred}</td>
                        <td style={{ padding: '9px 10px', borderBottom: '1px solid #F5E9E7', color: '#5a4a4e' }}>{st}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <H3 id="idempotency">Idempotency <Badge tone="ok">{BADGE_LABELS_EN.ok}</Badge></H3>
              <P>
                Send the <Code>Idempotency-Key</Code> header on any write so you can <strong>retry safely</strong> after a
                network failure or timeout without duplicating the effect. Sandbox behaviour: the original response (2xx or
                4xx) is replayed for the same key for <strong>24 hours</strong>, scoped per credential, method and path;
                <Code>5xx</Code> responses are never replayed (the request may be retried); two <strong>concurrent</strong>{' '}
                requests with the same key get <Code>409 IDEMPOTENCY_CONFLICT</Code> until the first finishes — wait and retry
                with the <em>same</em> key. The same key with a different body gets <Code>409 IDEMPOTENCY_KEY_REUSED</Code>:
                it is a different request and needs a different key.
              </P>
              <CodeBlock label="curl · safe retry with Idempotency-Key" raw={SAMPLE_IDEM_RETRY} onCopy={copy} {...enCopy} />

              <H3 id="authentication">Authentication and key management <Badge tone="ok">{BADGE_LABELS_EN.ok}</Badge></H3>
              <UL>
                <LI><strong>Direct Bearer:</strong> send the Sandbox key in <Code>Authorization: Bearer bz_test_sk_…</Code> (or <Code>X-API-Key</Code>). <Code>bz_live_</Code> keys are <strong>rejected fail-closed</strong> — Production keys are not issued.</LI>
                <LI><strong>Environment separation:</strong> <Code>bz_test_</Code> keys belong to the Sandbox; future Production keys will be issued only after platform enablement (<em>Production in preparation</em>).</LI>
                <LI><strong>Secrets stay server-side:</strong> the <Code>bz_test_sk_</Code> never reaches a browser, mobile app, repository, logs or analytics; only the <Code>bz_test_pk_</Code> may live client-side.</LI>
                <LI><strong>Rotation:</strong> rotate keys periodically and whenever exposure is suspected; after rotation the previous key stops being accepted immediately.</LI>
                <LI><strong>Revocation (verified behaviour):</strong> a revoked key receives <Code>401 UNAUTHORIZED</Code> on any call — verified in the Sandbox E2E.</LI>
              </UL>

              <H3 id="rate-limits">Rate limits</H3>
              <P>
                There are limits per IP address and per key. Exceeding them returns <Code>429 RATE_LIMITED</Code> with a{' '}
                <Code>Retry-After</Code> header, in seconds: wait that long and retry with the same idempotency key. The
                limit values are not part of the contract and may change; the behaviour — 429, Retry-After, nothing
                executed — is.
              </P>
              <H3 id="time">Dates and times</H3>
              <P>
                Every date in the API is UTC, in RFC 3339 (<Code>2026-07-11T11:45:00Z</Code>). Store them that way and
                convert only for display. The Console shows them in your browser&rsquo;s local time, and the public receipt
                verification page in Luanda time — the time of the event is always the API&rsquo;s UTC.
              </P>
              <H3 id="identifiers">Identifiers to keep</H3>
              <UL>
                <LI><strong>Project ID</strong> — your project; it does not change when the name does.</LI>
                <LI><strong>The ids of the resources</strong> you create — <Code>session_id</Code>, the account, refund and endpoint ids — to read them later.</LI>
                <LI><strong>Your own <Code>reference_id</Code></strong> — Banzami stores it and returns it, on resources and events; it is how a payment is tied to your order.</LI>
                <LI><strong>Each event&rsquo;s <Code>id</Code></strong> — to deduplicate repeated deliveries.</LI>
                <LI><strong>The receipt&rsquo;s <Code>BZM-…</Code> reference</strong>, when you have it — it is what verifies publicly.</LI>
                <LI><strong>The <Code>request_id</Code></strong> of every response that went wrong — it is what support asks for.</LI>
              </UL>
              <P>
                An id is not authority. Knowing the id of another project&rsquo;s resource gives no access to it — it answers{' '}
                <Code>404</Code> — and no request of yours carries the Business or wallet id: those come from financial setup.
              </P>

              <H3 id="resource-reference">Resource reference</H3>
              <P>
                Endpoint-by-endpoint reference of the public surface verified in the Sandbox — method, credential, headers,
                request body, response and common errors. Only resources with real evidence; nothing here claims Production.
              </P>
              <ResourceReference lang="en" onCopy={copy} />

              <P style={{ fontSize: 13, color: '#a89a9e' }}>
                Credential note: refunds and transfers are reached with a project key holding
                {' '}<Code>refunds:write</Code> and <Code>transfers:write</Code>, on <Code>/v1/refunds</Code> and
                {' '}<Code>/v1/wallet-account-transfers</Code>. Both were verified end to end against the deployed Sandbox, including
                the refusals: a read-only key cannot write, and another project&rsquo;s payment or account answers <Code>404</Code>.
                Sandbox only — never present either as available in Production.
              </P>

              </Section>
<Section id="errors">
              <H2>Errors</H2>
              <P>
                Every error response from the integration layer uses the <strong>same JSON envelope</strong>: a stable code,
                a readable message and a <Code>request_id</Code> to correlate with support. Handle errors by <Code>code</Code>,
                never by message.
              </P>
              <CodeBlock label="json · canonical error envelope" raw={SAMPLE_ERROR} onCopy={copy} {...enCopy} />
              <P>
                That <Code>request_id</Code> is searchable. In <strong>Console → Logs → API requests</strong>, paste it to
                find the exact request: method, path, status, latency and timestamp. Logs are your project&rsquo;s and only
                your project&rsquo;s, and are kept for <strong>30 days</strong>. What is never stored: the{' '}
                <Code>Authorization</Code> header, API keys, webhook secrets, cookies, OTPs or the request body.
              </P>
              <H3 id="error-catalogue">Error catalogue</H3>
              <P>
                Every code a project key can receive, and only those. The list is generated from the gateway source and
                checked against it: a new code missing from here, or a code here that no longer exists, fails the check.
                It describes the <strong>Sandbox</strong>; Financial LIVE behaviour is not claimed.
              </P>
              <ErrorCatalogue lang="en" />
              <H3 id="console-errors">Console (access and keys)</H3>
              <UL>
                <LI><Code>INVALID_EMAIL</Code> / <Code>INVALID_CODE</Code> — fix the email, or ask for a new one-time code.</LI>
                <LI><Code>RATE_LIMITED</Code> — too many requests; wait before retrying.</LI>
                <LI><Code>UNAUTHENTICATED</Code> — the session expired; sign in again.</LI>
                <LI><Code>FORBIDDEN</Code> — no permission for the action (role, or the origin/CSRF check).</LI>
                <LI><Code>CONFLICT</Code> / <Code>LAST_OWNER</Code> — a state conflict; includes the last-Owner protection.</LI>
                <LI><Code>INVITE_INVALID</Code> — the invitation expired, was revoked or was already used; ask for a new one.</LI>
                <LI><Code>VALIDATION</Code> — invalid data; fix the fields.</LI>
              </UL>
              <H3 id="integration-errors">Integration</H3>
              <UL>
                <LI><Code>401 UNAUTHORIZED</Code> — the key is missing, revoked, or not a Sandbox key. The <Code>bz_test_sk_</Code> key goes straight into <Code>Authorization: Bearer</Code>; there is no token to exchange.</LI>
                <LI>After a <strong>rotation</strong>, use the new key; the previous one stops being accepted.</LI>
                <LI>Never repeat an operation that moves value without an <strong>idempotency key</strong>.</LI>
              </UL>
            </Section>
    </>
  );
}

export function EnTesting({ copy }: { copy: CopyFn }) {
  return (
    <>
<Section id="testing">
              <H2>Sandbox testing</H2>
              <PageLede>How to validate the integration in the Sandbox, and what the Sandbox guarantees. <strong>No real money ever moves.</strong></PageLede>
              <NextSteps label="Next:" links={[{ href: '/docs/en/trust', text: 'Security' }, { href: '/docs/en/guides', text: 'Guides' }]} />
              <P><strong>What the Sandbox is:</strong> a complete integration environment with test accounts, sessions, links, QR and webhooks — flows behave like the real ones, but <strong>no real money ever moves</strong>.</P>
              <P><strong>What the Sandbox is not:</strong> there are no live rails, no external providers activated, and no Production key issuance. All test credentials in these examples are placeholders.</P>
              <UL>
                <LI><strong>1. First call:</strong> <Code>GET /v1/me</Code> with your key — success is <Code>200</Code> with <Code>environment: SANDBOX</Code>; the typical failure is <Code>401 UNAUTHORIZED</Code> (wrong/revoked key).</LI>
                <LI><strong>2. Create a session:</strong> <Code>POST /v1/payment-sessions</Code> — success is <Code>201</Code> with <Code>status: ACTIVE</Code> and the link/QR interfaces.</LI>
                <LI><strong>3. Test idempotency:</strong> repeat the same POST with the same <Code>Idempotency-Key</Code> — you should receive the original response with no duplicated effect; send two concurrently and one gets <Code>409 IDEMPOTENCY_CONFLICT</Code>.</LI>
                <LI><strong>4. Test errors:</strong> send <Code>amount_minor: 0</Code> to see <Code>400 BAD_REQUEST</Code> (omitting the amount is not an error: it creates an open-amount session); use an invalid key to see <Code>401</Code>; always keep the <Code>request_id</Code> from the response.</LI>
                <LI><strong>5. Interpreting results:</strong> any response carrying the error envelope (see <a href="/docs/en/reference#errors" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>Errors</a>) is actionable via its <Code>code</Code>.</LI>
              </UL>
              <Callout tone="warn">
                Internal Sandbox funding/simulation utilities exist but are <strong>internal — not public</strong>; they are
                not part of the documented surface.
              </Callout>
              <P style={{ fontSize: 13, color: '#a89a9e' }}>
                Webhook delivery is real, not simulated: Banzami delivers over the public internet to the HTTPS endpoint you
                registered, signed, with redelivery on failure — see{' '}
                <a href="/docs/en/guides#webhooks" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>Webhooks</a>.
                This page said outbound delivery remained simulated; that stopped being true when the reference application
                began receiving real events.
              </P>
            </Section>
    </>
  );
}

export function EnTrust({ copy }: { copy: CopyFn }) {
  return (
    <>
<Section id="trust-page">
              <H2>Security</H2>
              <PageLede>Where credentials live, what never leaves your server, and what the Sandbox guarantees.</PageLede>
              <NextSteps label="Related:" links={[{ href: '/docs/en/testing', text: 'Sandbox testing' }, { href: '/docs/en/reference#authentication', text: 'Authentication' }, { href: '/docs/en/guides#webhooks', text: 'Webhooks' }]} />

              <H3 id="keys">The secret key belongs to the server, and only there</H3>
              <P>
                A <Code>bz_test_sk_…</Code> key authorises everything your Project can do.
                Whoever holds it can create charges, move money between your accounts and
                issue refunds. So it lives on the server and nowhere else.
              </P>
              <UL>
                <LI><strong>Never in the browser.</strong> Not in JavaScript, not in <Code>localStorage</Code>, not in a <Code>NEXT_PUBLIC_*</Code> variable — all of that is code the user downloads and can read.</LI>
                <LI><strong>Never in a mobile app.</strong> A distributed binary is readable; a key inside one is a published key.</LI>
                <LI><strong>Never in the repository.</strong> Not in a commit, not in a config file, not in a versioned <Code>.env</Code>. Git history does not forget.</LI>
                <LI><strong>Never in a screenshot</strong>, a ticket, a chat message or an email.</LI>
              </UL>
              <P>
                The right place is a server-process environment variable, read at start-up,
                supplied by your platform&apos;s secret manager.
              </P>

              <H3 id="reveal-once">Revealed once</H3>
              <P>
                When you create a key in the Console the full value appears <strong>exactly
                once</strong>, in that dialog. After that the Console shows only the prefix
                and a mask: the value is not recoverable from the screen, the page source,
                the network or browser storage. If you lose it, revoke it and create
                another — that is faster than looking for it, and it leaves a record of why.
              </P>

              <H3 id="least-privilege">Ask only for the scopes you need</H3>
              <P>
                Scopes are chosen when the key is created and do not change afterwards. A
                key that can only read will never write, even if the code using it has a
                bug — which is what makes least privilege useful rather than merely tidy.
              </P>
              <UL>
                <LI>One key per integrating system, not one key for everything.</LI>
                <LI>If the application only reads payment state, do not ask for <Code>:write</Code>.</LI>
                <LI>A compromised key can be revoked on its own, without stopping the other systems.</LI>
              </UL>

              <H3 id="rotation">Rotation and revocation</H3>
              <P>
                Rotating a key in the Console creates the successor and revokes the predecessor in
                the same step. The predecessor stops authenticating immediately: a call with it
                answers <Code>401</Code>, and the failure belongs to the key, not to the request. To
                swap without failures on your server, first create a new key with the same scopes,
                put it in use, and only then revoke the old one.
              </P>
              <UL>
                <LI><strong>Rotate</strong> when someone with access leaves, when you change hosting provider, or on a schedule if your policy requires one.</LI>
                <LI><strong>Revoke immediately</strong> if the key has appeared somewhere it should not be — a log, a shared screen, a public repository. Revoking is free; assuming nobody noticed is not.</LI>
                <LI>The key list shows last use, which is how you find the one nobody uses any more.</LI>
              </UL>

              <H3 id="webhook-secret">The webhook secret</H3>
              <P>
                The signing secret is revealed once, like the key, and is stored the same
                way. It is how you verify that a <Code>POST</Code> to your endpoint came
                from Banzami and not from someone who found the URL.
              </P>
              <UL>
                <LI>Verify the signature <strong>before</strong> doing anything at all with the event body.</LI>
                <LI>Verify over the <strong>raw body</strong>, exactly as it arrived — re-serialising the JSON changes the bytes and the signature stops matching.</LI>
                <LI>Use the SDK&apos;s verifier where one exists: the comparison is constant-time and the replay window is already handled.</LI>
                <LI>Rotate the secret from the Console if you suspect it; the endpoint stays the same.</LI>
              </UL>

              <H3 id="sandbox-guarantees">What the Sandbox guarantees</H3>
              <P>
                The Sandbox is a complete environment: accounts, charges, links, QR,
                webhooks, refunds and settlements behave as they would with real money, and
                webhook delivery to your endpoint is real delivery, over the public internet.
              </P>
              <UL>
                <LI><strong>No real money, ever.</strong> Balances are fictitious Kwanza; no value leaves any bank.</LI>
                <LI><strong>There is no financial Live environment.</strong> It is not switched off awaiting a request: it does not exist, and <Code>bz_live_…</Code> keys are issued to nobody.</LI>
                <LI><strong>The data is real enough to hurt.</strong> Treat test data as you would a customer&apos;s: do not put real people&apos;s personal details in it.</LI>
                <LI><strong>What your key reaches is the OpenAPI document, and nothing else.</strong> There are no hidden routes for project keys waiting to be discovered: a CI check compares the routes that accept your key with the document. Merchant, consumer and operator routes exist, and refuse your key with <Code>401</Code> or <Code>403</Code>.</LI>
              </UL>
              <Callout tone="warn">
                If an SDK, an example or a page asks you for a <Code>bz_live_…</Code> key,
                you are looking at stale documentation or at something that is not ours.
                There are no Live keys.
              </Callout>

              <H3 id="support">What to send support — and what never to send</H3>
              <P>To investigate a request we need this, and only this:</P>
              <UL>
                <LI>The <Code>request_id</Code> from the response.</LI>
                <LI>The timestamp, with timezone.</LI>
                <LI>The environment (<Code>SANDBOX</Code>) and the operation you attempted.</LI>
                <LI>The SDK version, if you used one.</LI>
                <LI>The request body <strong>with credentials removed</strong>, if it is relevant.</LI>
              </UL>
              <Callout tone="warn">
                Never send an API key, a webhook secret, an OTP code or a session token —
                through any channel, to anyone, including us. Nothing we need in order to
                help is a secret, and a secret that has been sent is a secret to rotate.
              </Callout>
            </Section>
    </>
  );
}

export function EnArtifacts({ copy }: { copy: CopyFn }) {
  return (
    <>
<Section id="artifacts-page">
              <H2>Artifacts</H2>
              <PageLede>Public <strong>Sandbox</strong> artifacts — OpenAPI, Postman, availability matrix, manifests and examples. There is no Production contract because there is no Production.</PageLede>
              <NextSteps label="Related:" links={[{ href: '/docs/en/reference', text: 'API Reference' }, { href: '/docs/en/trust', text: 'Security' }, { href: '/docs/en/changelog', text: 'Changelog' }]} />
<H3 id="artifacts">Technical reference artifacts</H3>
              <P>
                The same documented surface exists in <strong>machine-readable</strong> form — <strong>protocol reference
                artifacts</strong>, published as static files. They are <strong>not the primary integration recommendation</strong>{' '}
                (Banzami is SDK-first), describe only the current Sandbox scope, are{' '}
                <strong>not Production contracts</strong>, not live rails, not regulatory approval, and not a replacement for
                the SDKs:
              </P>
              <UL>
                <LI><strong>OpenAPI</strong> (protocol reference) — <a href="/developers/openapi/banzami-sandbox.openapi.json" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>/developers/openapi/banzami-sandbox.openapi.json</a> — verified endpoints only.</LI>
                <LI><strong>Postman collection</strong> (protocol reference) — <a href="/developers/postman/banzami-sandbox.postman_collection.json" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>/developers/postman/banzami-sandbox.postman_collection.json</a>.</LI>
                <LI><strong>curl examples</strong> (diagnostic / protocol reference) — <a href="/developers/examples/curl/get-me.sh" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>get-me.sh</a> · <a href="/developers/examples/curl/create-payment-session.sh" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>create-payment-session.sh</a>; full fixtures in <Code>docs/developer/examples/</Code>.</LI>
                <LI><strong>Availability matrix</strong> — <a href="/developers/availability/banzami-developers-availability.json" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>/developers/availability/banzami-developers-availability.json</a> (the machine-readable source of this documentation's states, checked by tests).</LI>
                <LI><strong>Manifests</strong> — <a href="/developers/artifacts/manifest.json" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>manifest.json</a> · <a href="/developers/artifacts/sdk-first-manifest.json" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>sdk-first-manifest.json</a> (machine-readable SDK-first model; @banzami/sdk and banzami_client published, the others not).</LI>
              </UL>
                          <P style={{ fontSize: 13, color: '#a89a9e' }}>
                The <a href="/developers/artifacts/manifest.json" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>artifact manifest</a> indexes every
                public artifact — the OpenAPI document, the Postman collection, the availability
                matrix and the examples. They describe the Sandbox, which is the only
                environment that exists.
              </P>
</Section>
    </>
  );
}

export function EnChangelog({ copy }: { copy: CopyFn }) {
  return (
    <>
<Section id="changelog">
              <H2>Changelog</H2>
              <PageLede>Documentation, API-contract and Sandbox change tracking. There is no invented product release history.</PageLede>
              <NextSteps label="Next:" links={[{ href: '/docs/en/artifacts', text: 'Artifacts' }, { href: '/docs/en/trust', text: 'Security' }]} />
              <P style={{ fontSize: 13, color: '#a89a9e' }}>
                Dated entries by category: <Code>[Docs]</Code> (documentation only), <Code>[API]</Code> (API contract),{' '}
                <Code>[Sandbox]</Code> (Sandbox platform). Incompatible changes will be marked <Code>[Breaking]</Code>.
                There are no Production releases — <em>Production in preparation</em>.
              </P>
              <ul style={{ margin: 0, padding: 0, listStyle: 'none', maxWidth: 660, display: 'flex', flexDirection: 'column', gap: 12 }}>
                {([
                  ['13 Sep 2026', 'Docs', 'Error catalogue generated from the gateway, route by route, in both languages; the full DOA tutorial, with the settlement fee destination and the donor receipt; illustrations in SVG.'],
                  ['13 Sep 2026', 'API', 'GET /v1/public/proofs/{ref} published in the reference and the OpenAPI.'],
                  ['12 Sep 2026', 'Sandbox', '@banzami/sdk 0.13.0 published on npm; createApplicationSettlement retired in favour of createBusinessApplicationSettlement.'],
                  ['11 Sep 2026', 'API', 'POST /v1/payment-links/{id}/mark-used retired: it answers 410 ROUTE_RETIRED.'],
                  ['10 Sep 2026', 'Sandbox', 'Financial setup by reviewed application or by consent code; one-click setup retired.'],
                  ['11 Jul 2026', 'Docs', 'Resource reference (PT/EN), Sandbox testing guide, authentication and key management, webhook envelope and idempotent-retry examples.'],
                  ['11 Jul 2026', 'Docs', 'curl examples with request and response, credential↔capability matrix, error envelope, idempotency in code and the webhook redelivery contract.'],
                  ['July 2026', 'Sandbox', 'Sandbox Console available: email + OTP sign-in, workspaces, projects and test keys.'],
                  ['July 2026', 'Sandbox', 'Test keys with rotation and revocation; team roles and invites.'],
                  ['July 2026', 'Docs', 'Public developers documentation.'],
                  ['July 2026', 'Sandbox', 'DOA published as the reference integration (Sandbox).'],
                ] as [string, string, string][]).map(([when, cat, what], i) => (
                  <li key={i} style={{ display: 'flex', gap: 12 }}>
                    <span style={{ flex: 'none', width: 92, fontSize: 12, fontWeight: 800, color: '#a89a9e', fontFamily: mono, paddingTop: 2 }}>{when}</span>
                    <span style={{ flex: 'none', fontSize: 11, fontWeight: 800, color: '#9A1B22', fontFamily: mono, paddingTop: 3 }}>[{cat}]</span>
                    <span style={{ fontSize: 14, lineHeight: 1.55, color: '#5a4a4e', fontWeight: 500, minWidth: 0, overflowWrap: 'anywhere' }}>{what}</span>
                  </li>
                ))}
              </ul>
            </Section>
    </>
  );
}

export function EnGlossary({ copy }: { copy: CopyFn }) {
  return (
    <>
<Section id="glossary-page">
<div id="concepts" style={{ scrollMarginTop: 72 }}>
              <H2>Concepts</H2>
              <PageLede>Definitions of the terms used across this documentation, in the Banzami context.</PageLede>
              <NextSteps label="Next:" links={[{ href: '/docs/en/get-started', text: 'Get started' }, { href: '/docs/en/reference', text: 'API Reference' }]} />
              <P>Quick definitions of the terms used in this documentation, in the Banzami context.</P>
              <dl style={{ margin: 0, maxWidth: 660, display: 'flex', flexDirection: 'column', gap: 12 }}>
                {CONCEPTS.map((e) => (
                  <div key={e.term}>
                    <dt style={{ margin: 0 }}>
                      {e.code ? (
                        <code style={{ fontFamily: mono, fontSize: 13, background: '#FFF1F0', color: '#9A1B22', padding: '1px 6px', borderRadius: 6, fontWeight: 700 }}>{e.term}</code>
                      ) : (
                        <span style={{ fontSize: 14, fontWeight: 900, color: INK }}>{e.term}</span>
                      )}
                    </dt>
                    <dd style={{ margin: '4px 0 0', fontSize: 13.5, lineHeight: 1.6, color: '#5a4a4e', fontWeight: 500 }}>{e.def}</dd>
                  </div>
                ))}
              </dl>
            </div>
</Section>
    </>
  );
}

