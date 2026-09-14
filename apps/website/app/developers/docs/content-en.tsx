'use client';

// EN documentation content, one page function per documentation route. Written
// as English technical documentation, not as a translation: the pages carry the
// same facts, sections, examples and illustrations as the Portuguese ones
// (tools/check-docs-pt-en-structure.mjs holds that), in native English.

import { MailLink } from '@/components/MailLink';
import type { ReactNode } from 'react';
import { BADGE_LABELS_EN, Badge, BODY, Callout, Code, CodeBlock, H1_STYLE, H2, INK, LI, LINK, MUT, P, PageLede, Section, TABLE, TD, TD_HEAD, TD_MONO, TH, THEAD, UL, mono } from './ui';
import { ResourceReference, ScopeTable } from './reference';
import { ErrorCatalogue, HttpClassTable } from './ErrorCatalogue';
import { EventReference } from './EventReference';
import { Troubleshooting } from './Troubleshooting';
import { StageBar, StepCard, NextStepCards, RecipeCard, ChapterFacts, DoDont } from './dx';
import { EVENT_NAMES } from './events';
import { ConceptModelDiagram, SegregatedAccountsDiagram, PathDiagram, FinancialSetupDiagram, ResponsibilityDiagram, SettlementSplitDiagram, RealtimeChannelsDiagram } from './diagrams';
import { CapabilityCards } from './CapabilityCards';
import type { CopyFn } from './content-pt';

// English concepts (translations of the canonical PT glossary — same 28 terms).
const CONCEPTS: { term: string; def: string; code?: boolean }[] = [
  { term: 'Sandbox', def: 'Test environment for validating Banzami integrations without moving real money.' },
  { term: 'Financial Live', def: 'The real-money environment. It is not available; the Sandbox is the only environment.' },
  { term: 'Ledger', def: 'Banzami’s accounting record: every debit and credit of every transaction, from which balances derive.' },
  { term: 'Idempotency', def: 'Guarantee that repeating the same request never creates a second transfer, payment or financial effect.' },
  { term: 'Webhook', def: 'Notification Banzami sends directly to your application server when an event happens.' },
  { term: 'banza-signature', def: 'The header carrying each webhook delivery’s signature. Verifying it confirms the delivery comes from Banzami, unaltered.', code: true },
  { term: 'HMAC-SHA256', def: 'The webhook signature algorithm, computed with the endpoint secret.' },
  { term: 'OTP', def: 'The six-digit code, sent by email, that signs you in to the Console.' },
  { term: 'Business account', def: 'The Banzami account of an organisation, used to receive payments and manage its activity.' },
  { term: 'Settlement', def: 'Paying out an account balance to a beneficiary, with the fee set by Banzami’s pricing. It happens only when you request it.' },
  { term: '@banza', def: 'Public identifier of a Banzami account, used to receive transfers.', code: true },
  { term: 'API key', def: 'The credential an application uses to authenticate to the Banzami API. It identifies a project.' },
  { term: 'Publishable key', def: 'A bz_test_pk_ key that may be used client-side, read-only. It never replaces the secret key.' },
  { term: 'Secret key', def: 'A bz_test_sk_ key, reserved for the server. Never put it in a browser, a mobile app or a repository.' },
  { term: 'Replay', def: 'A new delivery of an event, or a repeat of a request. Idempotency prevents duplicate effects.' },
  { term: 'At-least-once', def: 'Delivery model where an event may arrive more than once; your server must handle it idempotently.', code: true },
  { term: 'QR', def: 'The code that opens a session’s payment page when read with a camera or the Banzami app.' },
  { term: 'Payment session', def: 'A payment request tied to a reference from your application, with a link and a QR code.' },
  { term: 'Receipt', def: 'The document of a confirmed payment, with a publicly verifiable BZM-… reference.' },
  { term: 'Workspace', def: 'The group of people with access to a set of projects, with roles (Owner, Admin, Developer, Finance, Viewer).' },
  { term: 'Project', def: 'One integrated application: its keys, webhooks and logs. The Project ID does not change when its name does.' },
  { term: 'Financial Setup', def: 'The connection between a project and the Business that receives its payments. Without it, the project cannot be paid.' },
  { term: 'Business', def: 'The entity, verified by Banzami, that receives a project’s payments.' },
  { term: 'Wallet account', def: 'An account inside a Business wallet, to keep funds apart — one per campaign, for example.' },
  { term: 'Payment link', def: 'An address on pay.banzami.com where the payer pays; with a fixed or an open amount.' },
  { term: 'Refund', def: 'Returning a confirmed payment, fully or partially, from the account that received it.' },
  { term: 'Transaction', def: 'A movement of value recorded in the ledger — a payment, a refund or a transfer.' },
  { term: 'Minor units', def: 'The format of amounts in the API: integers, where 100 minor units are 1 Kz. Never decimals.' },
  { term: 'amount_minor', def: 'The API’s amount field, in minor units: 25000 is 250 Kz.', code: true },
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
//    Do not name the payee: it comes from the project's Financial Setup, and the
//    API refuses merchant_id or wallet_id. (walletAccountId picks one of the project’s accounts.)
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

// 3. Confirm the payment. The source of truth is Banzami, not the payer's browser:
//    confirm on your server, from the webhook or by reading the session.
const now = await banzami.getPaymentSession(session.session_id);
// now.status  ->  'PAID' once the payer has paid`;

const SAMPLE_CURL_SESSION = `# Create a payment session in the Sandbox (placeholder values).
# The payee comes from the project's Financial Setup: the request names no merchant
# and no wallet. amount_minor 25000 = 250 Kz (100 minor units = 1 Kz).
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

// In your webhook endpoint (server): the raw body and the header.
const raw = await req.text();
const sig = req.headers.get('banza-signature') ?? '';
// constructEvent verifies the signature and only then returns the event.
// With an invalid signature, it throws and nothing is read.
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
storeSecret(ep.secret);   // returned once — no later read returns it

// See what happened
const { data: endpoints } = await banzami.listWebhookEndpoints();
const { data: events }    = await banzami.listWebhookEvents(20);
const { data: deliveries } = await banzami.listWebhookDeliveries(events[0].id);

// Rotate the secret. Prepare the receiver first: the switch is immediate.
const rotated = await banzami.rotateWebhookEndpointSecret(ep.id);
storeSecret(rotated.secret);`;

const SAMPLE_CURL_ME = `# Check your test key (placeholder) against the Sandbox API
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

const SAMPLE_ERROR = `# Error envelope
{
  "code": "INVALID_AMOUNT",
  "message": "amount_minor must be a positive integer",
  "request_id": "4f3c1b9a2e7d5086c1af03be7d2915ce"
}`;

const SAMPLE_WEBHOOK_ENVELOPE = `# Event envelope delivered to your endpoint
{
  "id": "evt_XXXXXXXX",
  "type": "payment_session.paid",
  "created_at": "2026-07-11T11:46:02Z",
  "data": { /* event object */ }
}`;

const SAMPLE_IDEM_RETRY = `# Safe retry: the same Idempotency-Key replays the original response
curl -X POST https://sandbox-api.banzami.com/v1/payment-sessions \\
  -H "Authorization: Bearer bz_test_sk_XXXXXXXXXXXXXXXX" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: idem_order_123" \\
  -d '{ ...same body... }'
# -> 201 with the same response; no duplicate session is created.

# Avoid: changing the Idempotency-Key when retrying after a timeout —
# that can create a second effect. Always reuse the original key.`;

// Verified event catalogue (same closed set as the PT page and its tests).
// Every event the operator actually emits, and only those — see the PT note.
const EVENTS: string[] = EVENT_NAMES;

const SDKS: { name: string; lang: string; state: string; consume: string }[] = [
  { name: '@banzami/sdk', lang: 'TypeScript / Node.js', state: 'Published — server', consume: 'npm install @banzami/sdk' },
  { name: 'banzami_client', lang: 'Dart / Flutter', state: 'Published — client, read-only', consume: 'dart pub add banzami_client' },
  { name: 'banzami-python', lang: 'Python', state: 'Not published', consume: '—' },
  { name: 'banzami/sdk-php', lang: 'PHP', state: 'Not published', consume: '—' },
]



const enCopy = { toastText: 'Copied to clipboard', buttonText: 'Copy' };

// -- Samples for the task pages ------------------------------------------------
const SAMPLE_READY = `import { BanzamiClient } from '@banzami/sdk';
const apiKey = process.env.BANZAMI_API_KEY;
if (!apiKey) throw new Error('BANZAMI_API_KEY is not set');
const banzami = new BanzamiClient({ apiKey });

// Before showing "Pay": can this project receive payments?
const setup = await banzami.getFinancialSetup();
const canReceive = setup.financial_setup.state !== 'UNCONFIGURED' && setup.wallet.ready;
// state: 'UNCONFIGURED' | 'READY' | 'SEALED'

// Before settling: what still blocks it?
if (!setup.settlement.ready) console.log(setup.settlement.blockers);`;

const SAMPLE_LINK_CURL = `# Create a reusable payment link (placeholder values).
# amount_minor 25000 = 250 Kz. No merchant_id, no wallet_id: the payee comes from the project.
curl -X POST https://sandbox-api.banzami.com/v1/payment-links \\
  -H "Authorization: Bearer bz_test_sk_XXXXXXXXXXXXXXXX" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: idem_link_001" \\
  -d '{ "amount_minor": 25000, "currency": "AOA", "description": "Order #123" }'

# Response (201) — the payer opens https://pay.banzami.com/pay/slug_example
{ "slug": "slug_example", "amount_minor": 25000, "currency": "AOA", "status": "ACTIVE" }`;

const SAMPLE_REFUND = `import { BanzamiClient } from '@banzami/sdk';
const apiKey = process.env.BANZAMI_API_KEY;
if (!apiKey) throw new Error('BANZAMI_API_KEY is not set');
const banzami = new BanzamiClient({ apiKey });

// The payment to return: the refund_source from payment_session.paid,
// or from the session itself once it is paid.
const session = await banzami.getPaymentSession('psess_example');
if (!session.refund_source) throw new Error('the session has not been paid');

// Create the idempotency key BEFORE the request and store it:
// it is what prevents a second refund if the response is lost.
const key = 'idem_refund_order_123';

const refund = await banzami.createRefund({
  source_type: session.refund_source.source_type,  // 'WALLET_PAYMENT'
  source_id:   session.refund_source.source_id,
  amount_minor: 5000,                               // 50 Kz — partial
  currency:    'AOA',
  idempotency_key: key,
  reason:      'Item out of stock',
});
// refund.status -> 'SUCCEEDED'`;

const SAMPLE_TRANSFER = `import { BanzamiClient } from '@banzami/sdk';
const apiKey = process.env.BANZAMI_API_KEY;
if (!apiKey) throw new Error('BANZAMI_API_KEY is not set');
const banzami = new BanzamiClient({ apiKey });

// Two accounts of the SAME Business — campaign A and campaign B, for example.
const t = await banzami.createTransfer({
  sourceWalletAccountId:      'wacc_campaign_a',
  destinationWalletAccountId: 'wacc_campaign_b',
  amountMinor: 50000,            // 500 Kz
  currency: 'AOA',
  idempotencyKey: 'idem_transfer_123',
});
// t.status -> 'COMPLETED' — the Business total is unchanged; only its distribution moved.`;

const SAMPLE_SETTLE = `import { BanzamiClient } from '@banzami/sdk';
const apiKey = process.env.BANZAMI_API_KEY;
if (!apiKey) throw new Error('BANZAMI_API_KEY is not set');
const banzami = new BanzamiClient({ apiKey });

// 1. Ready to settle? Each blocker is the refusal the settlement would return.
const setup = await banzami.getFinancialSetup();
if (!setup.settlement.ready) throw new Error(setup.settlement.blockers.join(', '));

// 2. Settle the whole campaign account. No amount and no fee in the request.
const settlement = await banzami.createBusinessApplicationSettlement({
  sourceAccountId:         'wacc_campaign_123',
  beneficiaryBanzaName:    '@beneficiary_example',
  feeDestinationBanzaName: '@my-business',        // when your pricing charges a fee
  referenceId:             'campaign_123',
  idempotencyKey:          'idem_settlement_campaign_123',
});
// settlement.gross_amount_minor     100000   (1,000 Kz, the account balance)
// settlement.application_fee_minor    2000   (200 bps = 2%)
// settlement.net_amount_minor        98000   (to the beneficiary)`;

const SAMPLE_WEBHOOK_WRONG = `// (banzami was created with { apiKey, webhookSecret })

// WRONG — parses the body as JSON and verifies afterwards.
// The bytes reaching verification are no longer the bytes Banzami signed,
// and your code already used data nobody authenticated.
const parsed = await req.json();                      // ✗ parse before verify
banzami.webhooks.constructEvent(JSON.stringify(parsed), signature); // ✗ fails

// RIGHT — the raw body, verified, and only then the event.
const raw = await req.text();
const verified = banzami.webhooks.constructEvent(raw, signature);`;


const QS_STAGES = [
  { title: 'Account and project', steps: [1, 3] as [number, number], note: 'A few minutes, with an email address.' },
  { title: 'Financial Setup', steps: [4, 4] as [number, number], note: 'Reviewed by Banzami before it is ready.' },
  { title: 'Key and SDK', steps: [5, 7] as [number, number], note: 'A few minutes, up to the first 200 response.' },
  { title: 'First payment', steps: [8, 12] as [number, number], note: 'Session, payment, confirmation and webhook.' },
];

export function EnGetStarted({ copy }: { copy: CopyFn }) {
  const a = { color: LINK, fontWeight: 600, textDecoration: 'none' } as const;
  return (
    <>
<Section id="quickstart">
              <h1 style={H1_STYLE}>Quickstart</h1>
              <PageLede>Create your first payment in the Sandbox and confirm it on your server. Twelve steps, in four stages.</PageLede>
              <Callout>
                <strong>Prerequisites:</strong> an email address and Node.js 18 or later on your server. In the Sandbox you need no entity details and wait for nobody.
              </Callout>
              <PathDiagram title="From sign-up to first payment" desc="Account, workspace, project, Financial Setup, API key, SDK and payment, in that order. In the Sandbox every step is yours: none waits for a review by Banzami." steps={['Account', 'Workspace', 'Project', 'Financial Setup', 'API key', 'SDK', 'Payment']} highlight={3} />
              <StageBar lang="en" stages={QS_STAGES} anchor={(n) => 'step-' + n} />

              <H2 id="account-and-project">Account and project</H2>
              <StepCard lang="en" n={1} of={12} id="step-1" title="Sign in to the Console"
                what={<>Your developer account at <Code>developers.banzami.com</Code>.</>}
                why="Workspaces, projects and keys belong to a signed-in person."
                success="The Console shows your list of workspaces."
                next="Create a workspace.">
                Open <a href="/login" style={a}>developers.banzami.com/login</a> and sign in with your email and the six-digit code you receive. There is no password.
              </StepCard>

              <StepCard lang="en" n={2} of={12} id="step-2" title="Create a workspace"
                what="The space your team shares."
                why="The workspace decides who can access its projects, keys and logs."
                success="The workspace appears in the switcher, with you as Owner."
                next="Create the project for your application.">
                In the Console, select <strong>Create workspace</strong> and enter your company or team name.
              </StepCard>

              <StepCard lang="en" n={3} of={12} id="step-3" title="Create a project"
                what="The unit of integration: one application, with its keys, webhooks and logs."
                why="Keys identify the project, and the project determines who receives payments."
                success="The Console shows the Project ID, which stays the same if you rename the project."
                next="Complete Financial Setup.">
                In the workspace, select <strong>New project</strong>. Create one project per application.
              </StepCard>

              <H2 id="financial-setup">Financial Setup</H2>
              <P>
                Financial Setup connects the project to a <strong>Business</strong>: the entity that receives payments.
                Without it, the project can use keys, webhooks and the API, but cannot be paid — creating a session returns <Code>403 PAYMENTS_UNAVAILABLE</Code>.
                In the Sandbox, Banzami creates a <strong>test Business</strong> for the project the moment you choose the use case: no application, no documents, no waiting. It is a test entity — not verified, and it does not exist outside the Sandbox.
              </P>
              <FinancialSetupDiagram l={{
                title: 'Financial Setup in the Sandbox: two paths, one result',
                desc: 'A project becomes financially ready in one of two ways: by creating a test Business, immediately, from the use case, or by connecting an existing Business with a consent code from its owner.',
                project: 'Project',
                newBusiness: 'Create a test Business', newNote: 'immediate, by use case',
                existing: 'Connect an existing Business', existingNote: 'owner’s consent code',
                ready: 'Financially ready', readyNote: 'the project can receive payments',
              }} />
              <div style={{ overflowX: 'auto', maxWidth: '100%', margin: '0 0 14px' }}>
                <table style={TABLE}>
                  <thead><tr style={THEAD}>
                    <th style={TH}></th>
                    <th style={TH}>Test Business</th>
                    <th style={TH}>Existing Business</th>
                  </tr></thead>
                  <tbody>
                    {[
                      ['Use when', 'Almost always: it is the Sandbox path for a new project.', 'Another project of yours already has a test Business, or you want to use a Banzami Business that already exists.'],
                      ['What you do', 'Choose the use case: “Store, service or business” or “Application or platform”.', 'Enter the consent code its owner generates — in the other project’s Console or in the Banzami Business app.'],
                      ['Who decides', 'Nobody waits: Banzami creates the Business and assigns the classification and pricing for that use.', 'The owner, by issuing the code. Each code works once, for ten minutes.'],
                    ].map((r) => (
                      <tr key={r[0]}>{r.map((c, i) => <td key={i} style={i === 0 ? TD_HEAD : TD}>{c}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <StepCard lang="en" n={4} of={12} id="step-4" title="Complete Financial Setup"
                what="Connect the project to the Business that receives its payments."
                why="The payee of every payment comes from this setup, never from your application’s request."
                success={<>The Console shows the project as ready, and <Code>getFinancialSetup()</Code> returns <Code>financial_setup.state</Code> <Code>READY</Code> or <Code>SEALED</Code>.</>}
                next="Create a secret key.">
                In the Console, open <strong>Financial Setup</strong>, choose the use case and select <strong>Set up the Sandbox</strong> — or connect an existing Business with its code. In your application, check readiness before offering payment:
                <CodeBlock label="ts · check financial readiness" raw={SAMPLE_READY} onCopy={copy} {...enCopy} />
              </StepCard>
              <Callout>Your application never sends a classification, a price or a fee: Banzami assigns them to the Business for the chosen use case. The use case can change until the first payment is issued.</Callout>

              <H2 id="key-and-sdk">Key and SDK</H2>
              <StepCard lang="en" n={5} of={12} id="step-5" title="Create a secret key"
                what={<>A <Code>bz_test_sk_…</Code> secret key with the scopes this guide uses.</>}
                why="The key authenticates your application. Scopes are set at creation and cannot be changed."
                success={<>The secret is stored in a server environment variable, <Code>BANZAMI_API_KEY</Code>. The Console shows it only once.</>}
                next="Install the SDK.">
                In the project, open <strong>API keys</strong> and create a key with <Code>identity:read</Code>, <Code>payment_sessions:write</Code>,{' '}
                <Code>payment_sessions:read</Code>, <Code>webhooks:write</Code> and <Code>webhooks:read</Code>.
                <CodeBlock label="test key prefixes" raw={SAMPLE_KEYS} onCopy={copy} {...enCopy} />
              </StepCard>
              <Callout>Keep the secret key on your server. <a href="/docs/en/trust#keys" style={a}>Where to store keys</a></Callout>

              <StepCard lang="en" n={6} of={12} id="step-6" title="Install the SDK"
                what={<><Code>@banzami/sdk</Code>, the official server SDK.</>}
                why="The SDK handles authentication, idempotency keys, retries and webhook verification."
                success={<><Code>import {'{'} BanzamiClient {'}'} from &apos;@banzami/sdk&apos;</Code> compiles.</>}
                next="Make your first call.">
                <Code>npm install @banzami/sdk</Code>
              </StepCard>

              <StepCard lang="en" n={7} of={12} id="step-7" title="Make your first call"
                what={<><Code>GET /v1/me</Code> returns the environment, project, scopes and key status.</>}
                why="It confirms the key works before you create any payment."
                success={<><Code>200</Code> with <Code>&quot;environment&quot;: &quot;SANDBOX&quot;</Code>. A <Code>401</Code> points to the key.</>}
                next="Create a payment session.">
                <CodeBlock label="curl · first call (GET /v1/me)" raw={SAMPLE_CURL_ME} onCopy={copy} {...enCopy} />
                With the SDK: <Code>await banzami.me()</Code>.
              </StepCard>

              <H2 id="first-payment">Create your first payment</H2>
              <Callout>
                <strong>Amounts in minor units:</strong> <Code>amount_minor: 25000</Code> is 250 Kz (100 minor units = 1 Kz). <a href="/docs/en/concepts#minor-units" style={a}>Amounts in minor units</a>
              </Callout>
              <StepCard lang="en" n={8} of={12} id="step-8" title="Create a payment session"
                what={<>A payment session, with a link and a QR code for the payer.</>}
                why="The session is the main way to collect a payment: one request, several ways to pay, one confirmation."
                success={<><Code>201</Code> with <Code>status: &quot;ACTIVE&quot;</Code> and a <Code>PAYMENT_LINK</Code> interface. Store the <Code>session_id</Code>.</>}
                next="Open the payment page.">
                Do not name the payee: it comes from Financial Setup. Use <Code>reference_id</Code> to tie the session to your order.
                <CodeBlock label="ts · create a payment session (@banzami/sdk)" raw={SAMPLE_SESSION} onCopy={copy} {...enCopy} />
                <CodeBlock label="curl · create a payment session (request + response)" raw={SAMPLE_CURL_SESSION} onCopy={copy} {...enCopy} />
              </StepCard>
              <P style={{ fontSize: 13, color: MUT }}>
                The most common errors at this step: <Code>403 PAYMENTS_UNAVAILABLE</Code> (step 4 not complete), <Code>403 INSUFFICIENT_SCOPE</Code> (step 5),{' '}
                <Code>400 BAD_REQUEST</Code> (invalid amount) and <Code>409 IDEMPOTENCY_KEY_REUSED</Code>. <a href="/docs/en/errors" style={a}>See the error catalogue</a>
              </P>

              <StepCard lang="en" n={9} of={12} id="step-9" title="Open the payment page"
                what={<>The session link, at <Code>pay.banzami.com/pay/…</Code>. The QR code encodes the same address.</>}
                why="The payer pays on a Banzami page. Your application never handles payment details."
                success="The page shows the amount and the SANDBOX — test environment notice."
                next="Pay the session and confirm it on your server.">
                Open <Code>paymentSessionInterface(session, &apos;PAYMENT_LINK&apos;).value</Code> in a browser. The page switches to “Payment confirmed” as soon as the session is paid, on any device. <a href="/docs/en/payments#realtime" style={a}>Realtime status</a>
              </StepCard>

              <StepCard lang="en" n={10} of={12} id="step-10" title="Confirm the payment on your server"
                what={<>Pay the session with a test payer and read it with <Code>getPaymentSession</Code>.</>}
                why="A payer returning to your page does not confirm payment. The confirmation comes from Banzami."
                success={<><Code>status</Code> is <Code>PAID</Code>.</>}
                next="Receive the same confirmation by webhook.">
                In the Console, under <strong>Test data</strong>, create a test payer and pay the session by its <Code>session_id</Code>. The payment takes the real path: the session is paid, the event is emitted and the receipt is issued. <a href="/docs/en/testing#pay-session" style={a}>Pay a test session</a>
              </StepCard>

              <StepCard lang="en" n={11} of={12} id="step-11" title="Receive the webhook"
                what={<>The <Code>payment_session.paid</Code> event, delivered to your HTTPS endpoint.</>}
                why="It confirms the payment without polling, even if the payer closes the page."
                success={<>In <strong>Webhooks</strong>, the delivery shows your server’s <Code>2xx</Code> response.</>}
                next="See the payment in the Console.">
                Register the endpoint with <Code>createWebhookEndpoint</Code>, verify the signature before reading the event, and deduplicate by <Code>id</Code>. <a href="/docs/en/webhooks" style={a}>Set up webhooks</a>
              </StepCard>

              <StepCard lang="en" n={12} of={12} id="step-12" title="See the payment in the Console"
                what={<>The payment in <strong>Transactions</strong>, and the key’s requests in <strong>Logs</strong>.</>}
                why={<>This is where you investigate an unexpected response, starting from the <Code>request_id</Code>.</>}
                success="The payment appears with its amount and status."
                next="Choose what to build next.">
                In the project, open <strong>Transactions</strong>. The Console shows times in your browser’s time zone.
              </StepCard>

              <NextStepCards lang="en" items={[
                { href: '/docs/en/webhooks', title: 'Set up webhooks', desc: 'Verification, duplicates, retries and secret rotation.' },
                { href: '/docs/en/payments', title: 'Accept payments', desc: 'Sessions, links and QR, and when to use each.' },
                { href: '/docs/en/testing', title: 'Test in the Sandbox', desc: 'Test scenarios and their expected results.' },
                { href: '/docs/en/doa', title: 'Build like DOA', desc: 'A complete integration, from payment to settlement.' },
              ]} />
              </Section>
    </>
  );
}

export function EnConcepts({ copy }: { copy: CopyFn }) {
  const a = { color: LINK, fontWeight: 600, textDecoration: 'none' } as const;
  return (
    <>
<Section id="concepts-banzami">
              <h1 style={H1_STYLE}>How Banzami works</h1>
              <PageLede>How Banzami organises an integration — workspace, project, Business — and the rules every financial resource follows. Read it before your first integration, or when a term in another guide is unclear.</PageLede>

              <H2 id="sandbox-live">Sandbox and Live</H2>
              <P>
                The <strong>Sandbox</strong> is the integration environment available today. Payments, balances, refunds and settlements follow the same rules they will follow
                in production, with fictitious money: no value enters or leaves a bank account.
              </P>
              <div style={{ overflowX: 'auto', maxWidth: '100%', margin: '0 0 14px' }}>
                <table style={TABLE}>
                  <thead><tr style={THEAD}>
                    <th style={TH}></th>
                    <th style={TH}>Sandbox</th>
                    <th style={TH}>Financial Live</th>
                  </tr></thead>
                  <tbody>
                    {[
                      ['Status', 'Available', 'Unavailable (fail-closed)'],
                      ['Money', 'Fictitious', '—'],
                      ['API rules', 'API v1: authorisation, idempotency, events and errors', 'The same, once it exists'],
                      ['Data', 'May be retired by Banzami; keep your own records', '—'],
                      ['Does not prove', 'Regulatory approval, Live readiness or automatic Live access', '—'],
                      ['Keys', 'bz_test_sk_ and bz_test_pk_', 'bz_live_ is refused; none are issued'],
                      ['API', 'https://sandbox-api.banzami.com/v1', '—'],
                      ['Console', 'Your project’s real data', '—'],
                    ].map((r) => (
                      <tr key={r[0]}>{r.map((c, i) => <td key={i} style={i === 0 ? TD_HEAD : TD}>{c}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <P><a href="/docs/en/going-live" style={a}>Prepare your integration for Live</a></P>
              <CapabilityCards lang="en" />

              <H2 id="model">The integration model</H2>
              <ConceptModelDiagram l={{
                title: 'Workspace, project, and what each project contains',
                desc: 'Each workspace contains projects. Each project has a Financial Setup that connects it to a Business and its accounts, and has API keys and webhook endpoints.',
                workspace: 'Workspace', project: 'Project',
                financialSetup: 'Financial Setup', business: 'Business',
                accounts: 'Accounts',
                apiKeys: 'API keys', webhooks: 'Webhook endpoints',
                noteWorkspace: 'who has access',
                noteProject: 'the unit of integration',
                noteBusiness: 'who receives payments',
                noteKeys: 'how your app authenticates',
                noteWebhooks: 'where events go',
              }} />
              <div style={{ overflowX: 'auto', maxWidth: '100%', margin: '0 0 14px' }}>
                <table style={TABLE}>
                  <thead><tr style={THEAD}><th style={TH}>Concept</th><th style={TH}>What it is</th><th style={TH}>Not to be confused with</th></tr></thead>
                  <tbody>
                    {[
                      ['Workspace', 'Your team’s access boundary. A person can belong to several workspaces.', 'Project — the integration boundary.'],
                      ['Project', 'One application: keys, webhooks and logs.', 'Business — the entity that receives payments.'],
                      ['Business', 'The verified entity that receives payments.', 'Account — where value sits, inside the Business wallet.'],
                      ['Account', 'A division of the wallet, per campaign or store for example.', 'Wallet — the set of the Business’s accounts.'],
                    ].map((r) => (
                      <tr key={r[0]}>{r.map((c, i) => <td key={i} style={i === 0 ? TD_HEAD : TD}>{c}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Callout>
                <strong>Authority comes from the key.</strong> The key identifies the project, and the project determines the Business. The ids you send select your own resources; they never grant access to another project’s.
              </Callout>

              <H2 id="responsibilities">What your application owns and what Banzami owns</H2>
              <div style={{ overflowX: 'auto', maxWidth: '100%', margin: '0 0 14px' }}>
                <table style={TABLE}>
                  <thead><tr style={THEAD}><th style={TH}>Your application</th><th style={TH}>Banzami</th></tr></thead>
                  <tbody>
                    {[
                      ['Customers, orders, campaigns and business rules', 'Payment execution'],
                      ['User experience', 'Balances, accounts and the ledger'],
                      ['The state of your resources (order paid, campaign closed)', 'Pricing and fees'],
                      ['Reconciliation with your own records', 'Receipts and their public verification'],
                      ['The settlement request, when you decide to settle', 'Settlement calculation and execution'],
                    ].map((r, i) => (
                      <tr key={i}><td style={TD}>{r[0]}</td><td style={TD}>{r[1]}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <H2 id="pattern">One pattern for every financial resource</H2>
              <P>Every financial resource is created on your server, confirmed on your server, and visible in the Console.</P>
              <div style={{ overflowX: 'auto', maxWidth: '100%', margin: '0 0 14px' }}>
                <table style={{ ...TABLE, minWidth: 640 }}>
                  <thead><tr style={THEAD}>
                    <th style={TH}>Resource</th>
                    <th style={TH}>Create</th>
                    <th style={TH}>Confirm</th>
                    <th style={TH}>Idempotency</th>
                    <th style={TH}>Console</th>
                  </tr></thead>
                  <tbody>
                    {[
                      ['Payment Session', 'createPaymentSession', 'payment_session.paid · status PAID', 'Idempotency-Key; one session per purpose + reference', 'Transactions'],
                      ['Payment Link', 'POST /v1/payment-links', 'payment_link.paid', 'Idempotency-Key', 'Transactions'],
                      ['QR code', 'included in the session (DYNAMIC_QR or STATIC_QR)', 'the session’s', '—', 'Transactions'],
                      ['Refund', 'createRefund', 'refund.completed · status SUCCEEDED', 'idempotency_key required', 'Transactions'],
                      ['Transfer', 'createTransfer', 'the response · status COMPLETED', 'idempotencyKey required', 'Transactions · Balances'],
                      ['Settlement', 'createBusinessApplicationSettlement', 'application_settlement.completed', 'idempotencyKey required', 'Balances'],
                    ].map((r) => (
                      <tr key={r[0]}>{r.map((c, i) => <td key={i} style={i === 0 ? TD_HEAD : i === 1 ? TD_MONO : TD}>{c}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <H2 id="minor-units">Amounts in minor units</H2>
              <P>
                Every amount is an integer in minor units: <Code>amount_minor: 25000</Code> is 250 Kz, because 100 minor units make 1 Kz.
                Integers avoid the rounding errors of decimal numbers. To display an amount, divide by 100 or use the SDK’s <Code>formatMinor</Code>.
              </P>

              <H2 id="idempotency">Idempotency</H2>
              <P>
                A request that moves money can lose its response to a timeout. Sent again with the same idempotency key, the retry returns the original result
                instead of causing a second effect. <a href="/docs/en/reference#idempotency" style={a}>Idempotency rules</a>
              </P>

              <H2 id="request-id">request_id</H2>
              <P>
                Every response carries a <Code>request_id</Code>. Log it whenever a response is not what you expected: it finds the request in
                <strong> Console → Logs</strong> (kept for 30 days), and it is the first thing support asks for.
              </P>

              <NextStepCards lang="en" items={[
                { href: '/docs/en/get-started', title: 'Quickstart', desc: 'Create and confirm your first payment.' },
                { href: '/docs/en/payments', title: 'Accept payments', desc: 'Sessions, links and QR.' },
                { href: '/docs/en/doa', title: 'Build like DOA', desc: 'The model applied to a complete integration.' },
              ]} />
            </Section>
    </>
  );
}


const SAMPLE_CURL_REALTIME = `curl -N https://sandbox-api.banzami.com/v1/realtime/payment-sessions/payment_session_example \\
  -H "Authorization: Bearer bzst_XXXXXXXXXXXXXXXX" \\
  -H "Accept: text/event-stream"

retry: 3000

event: snapshot
data: {"session_id":"payment_session_example","status":"ACTIVE","terminal":false,…}

: heartbeat

event: status
data: {"session_id":"payment_session_example","status":"PAID","terminal":true,…}`;

export function EnPayments({ copy }: { copy: CopyFn }) {
  const a = { color: LINK, fontWeight: 600, textDecoration: 'none' } as const;
  return (
    <>
<Section id="payments">
              <h1 style={H1_STYLE}>Accept payments</h1>
              <PageLede>Collect a payment with a Payment Session, a reusable Payment Link or a QR code. The payer pays on a Banzami page, and your application receives the confirmation on its server.</PageLede>

              <H2 id="choose">Choose a resource</H2>
              <div style={{ overflowX: 'auto', maxWidth: '100%', margin: '0 0 14px' }}>
                <table style={TABLE}>
                  <thead><tr style={THEAD}><th style={TH}></th><th style={TH}>Payment Session</th><th style={TH}>Payment Link</th></tr></thead>
                  <tbody>
                    {[
                      ['For', 'An order, a donation, a specific request', 'A shareable URL, created once'],
                      ['Your reference', 'purpose + reference_id, returned in events', 'None; tie it by id or slug'],
                      ['Link and QR', 'Link and QR: DYNAMIC_QR for a fixed amount, STATIC_QR for an open amount', 'A link; render the QR from its URL'],
                      ['Destination account', 'The default account or one of yours (wallet_account_id)', 'The project’s default account'],
                      ['Confirmation', 'payment_session.paid and status PAID', 'payment_link.paid'],
                      ['SDK (0.13.0)', 'createPaymentSession', 'HTTP — see the note below'],
                    ].map((r) => (
                      <tr key={r[0]}>{r.map((c, i) => <td key={i} style={i === 0 ? TD_HEAD : TD}>{c}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <P>For most integrations, a Payment Session is the right choice: it ties the payment to your reference and already includes the link and the QR code.</P>

              <H2 id="journey">How a payment flows</H2>
              <ResponsibilityDiagram
                title="How a payment flows"
                desc="Your application creates the session and shows the link or QR code. The payer pays on Banzami’s page. Banzami records the payment and sends the webhook. Your application verifies the webhook and updates its state."
                appLabel="Your application" banzamiLabel="Banzami"
                steps={[
                  { side: 'app', text: 'Creates the session' },
                  { side: 'banzami', text: 'Returns link and QR' },
                  { side: 'app', text: 'Shows link or QR' },
                  { side: 'banzami', text: 'The payer pays' },
                  { side: 'banzami', text: 'Records it, sends webhook' },
                  { side: 'app', text: 'Verifies and confirms' },
                ]} />

              <H2 id="create-session">Create a Payment Session</H2>
              <Callout><strong>Minor units:</strong> <Code>amountMinor: 25000</Code> is 250 Kz (100 = 1 Kz).</Callout>
              <CodeBlock label="ts · create a payment session (@banzami/sdk)" raw={SAMPLE_SESSION} onCopy={copy} {...enCopy} />
              <UL>
                <LI><strong>Payee:</strong> comes from Financial Setup. <Code>merchant_id</Code>, <Code>wallet_id</Code> or <Code>payee</Code> in the request returns <Code>400 PAYEE_NOT_ALLOWED</Code>.</LI>
                <LI><strong>Destination account:</strong> the project’s main account by default. To keep funds apart, pass <Code>walletAccountId</Code> for one of your accounts. <a href="/docs/en/transfers" style={a}>Segregated accounts</a></LI>
                <LI><strong>Reference:</strong> there is one session per <Code>purpose</Code> + <Code>reference_id</Code>. Sending the same reference again returns the existing session (<Code>200</Code>), even with a different amount.</LI>
                <LI><strong>Open amount:</strong> without <Code>amountMinor</Code>, the payer enters the amount, and the QR interface is <Code>STATIC_QR</Code> instead of <Code>DYNAMIC_QR</Code>.</LI>
              </UL>
              <P style={{ fontSize: 13, color: MUT }}><strong>Expected result:</strong> <Code>201</Code>, <Code>status: &quot;ACTIVE&quot;</Code> and <Code>interfaces</Code> with <Code>PAYMENT_LINK</Code> (and <Code>DYNAMIC_QR</Code> for a fixed amount).</P>

              <H2 id="present">Show the link or QR code</H2>
              <UL>
                <LI><strong>Link:</strong> <Code>paymentSessionInterface(session, &apos;PAYMENT_LINK&apos;).value</Code> — an <Code>https://pay.banzami.com/pay/…</Code> URL.</LI>
                <LI><strong>QR code:</strong> <Code>paymentSessionInterface(session, &apos;DYNAMIC_QR&apos;).value</Code> (or <Code>STATIC_QR</Code>, for an open amount) holds the same URL. For the image, call <Code>GET /v1/payment-sessions/{'{'}id{'}'}/qr?format=svg</Code>.</LI>
                <LI>Any phone camera opens the page from the QR code. The page shows “SANDBOX — test environment”.</LI>
              </UL>

              <H2 id="confirm">Confirm the payment</H2>
              <P>
                Always confirm on your server: through the <Code>payment_session.paid</Code> webhook, or by reading the session until <Code>status</Code> is <Code>PAID</Code>.
                A payer returning to your page is not a confirmation.
              </P>
              <div style={{ overflowX: 'auto', maxWidth: '100%', margin: '0 0 14px' }}>
                <table style={TABLE}>
                  <thead><tr style={THEAD}><th style={TH}>Status</th><th style={TH}>Meaning</th><th style={TH}>What to do</th></tr></thead>
                  <tbody>
                    {[
                      ['ACTIVE', 'The session is waiting for payment.', 'Show the link or QR code. This is not an error.'],
                      ['PAID', 'The payment has reached your account.', 'Confirm the order, once.'],
                      ['CANCELLED', 'The session was cancelled and can no longer be paid.', 'Create a new session if you still want to collect.'],
                    ].map((r) => (
                      <tr key={r[0]}>{r.map((c, i) => <td key={i} style={i === 0 ? TD_MONO : TD}>{c}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <H2 id="realtime">Realtime status</H2>
              <P>
                A page showing a QR code or a link can switch to “paid” the moment the payment happens — even when the payer paid on another device.
                Every session read with your key carries <Code>realtime.token</Code>: a status token (<Code>bzst_…</Code>) that opens, read-only and for up to 30 minutes, that session’s public status.
                Hand the token to your page; the page opens <Code>GET /v1/realtime/payment-sessions/{'{id}'}</Code> with the token in the <Code>Authorization</Code> header.
              </P>
              <RealtimeChannelsDiagram l={{
                title: 'Three ways to learn a payment’s status',
                desc: 'The same Payment Session reaches you through three channels. The signed webhook and the read with your key, on your server, are what confirm the order. The realtime status, in the browser, with a status token, only updates the screen.',
                source: 'Payment Session',
                channels: [
                  { name: 'Webhook', who: 'Banzami calls your server', credential: 'banza-signature', use: 'Confirm and fulfil', authority: true },
                  { name: 'GET with your key', who: 'Your server asks', credential: 'bz_test_sk_…', use: 'Confirm and reconcile', authority: true },
                  { name: 'Realtime', who: 'The payer’s page', credential: 'bzst_… · 30 min', use: 'Update the screen', authority: false },
                ],
                authority: 'Authority to fulfil the order',
                screenOnly: 'Screen only',
              }} />
              <UL>
                <LI><strong>The stream:</strong> with <Code>Accept: text/event-stream</Code>, a <Code>snapshot</Code> event with the current status, a <Code>status</Code> on each change, a heartbeat every 5 seconds and an <Code>expired</Code> when the token expires. It closes on a terminal status: <Code>PAID</Code>, <Code>EXPIRED</Code>, <Code>CANCELLED</Code> or <Code>FAILED</Code>. With <Code>Accept: application/json</Code>, a single read.</LI>
                <LI><strong>The token goes in the header, never the URL:</strong> a token in the URL is refused with <Code>400 REALTIME_TOKEN_IN_URL</Code>. That is why the page uses <Code>fetch</Code> with a streaming read rather than <Code>EventSource</Code>, which cannot send headers.</LI>
                <LI><strong>Reconnect:</strong> if the connection drops, open it again — it starts with a fresh snapshot. With an expired token (<Code>401 REALTIME_TOKEN_EXPIRED</Code>), read the session on your server for a new one.</LI>
                <LI><strong>No stream:</strong> if the connection cannot stay up (<Code>503 REALTIME_UNAVAILABLE</Code>, a restricted network), the page asks your server at a modest interval, for example every five seconds.</LI>
                <LI><strong>Limits:</strong> 3 streams per session and 20 per IP (<Code>429 REALTIME_STREAM_LIMIT</Code>). A page needs one.</LI>
              </UL>
              <CodeBlock label="curl · realtime status (stream)" raw={SAMPLE_CURL_REALTIME} onCopy={copy} {...enCopy} />
              <Callout tone="warn">Realtime status is not proof of payment. Fulfil the order on the verified <Code>payment_session.paid</Code> webhook, or on <Code>getPaymentSession</Code> on your server. The token is not a key: never put a secret key in the page.</Callout>

              <H2 id="links">Create a Payment Link</H2>
              <P>
                A Payment Link is a reusable URL you can share without creating a session per customer. With a project key, the request does not name the payee.
              </P>
              <CodeBlock label="curl · create a payment link" raw={SAMPLE_LINK_CURL} onCopy={copy} {...enCopy} />
              <Callout tone="warn">
                <strong>SDK 0.13.0:</strong> <Code>createPaymentLink</Code> and <Code>listPaymentLinks</Code> still require <Code>merchantId</Code> in their types, which a project key cannot send. Use HTTP for links until the next SDK release.
              </Callout>
              <UL>
                <LI><strong>Confirm:</strong> the <Code>payment_link.paid</Code> event, or <Code>GET /v1/payment-links/{'{'}id{'}'}</Code> with the id returned at creation (a slug returns <Code>404</Code>).</LI>
                <LI><strong>Close an unpaid link:</strong> <Code>DELETE /v1/payment-links/{'{'}id{'}'}</Code> returns it with <Code>status: &quot;CANCELLED&quot;</Code>.</LI>
                <LI><strong>List:</strong> <Code>GET /v1/payment-links?limit=20</Code>, with <Code>next_cursor</Code> for the next page.</LI>
              </UL>

              <H2 id="payment-errors">Common errors</H2>
              <div style={{ overflowX: 'auto', maxWidth: '100%', margin: '0 0 14px' }}>
                <table style={TABLE}>
                  <thead><tr style={THEAD}><th style={TH}>Response</th><th style={TH}>Cause</th><th style={TH}>Fix</th></tr></thead>
                  <tbody>
                    {[
                      ['403 PAYMENTS_UNAVAILABLE', 'The project has not completed Financial Setup.', 'Complete Financial Setup.'],
                      ['403 INSUFFICIENT_SCOPE', 'The key lacks payment_sessions:write.', 'Create a key with that scope.'],
                      ['400 PAYEE_NOT_ALLOWED', 'The request names a payee.', 'Remove merchant_id, wallet_id and payee.'],
                      ['400 BAD_REQUEST', 'Zero or negative amount, or a currency that differs from the account.', 'Send a positive integer in minor units.'],
                      ['404 NOT_FOUND', 'wallet_account_id belongs to an account that is not yours.', 'Use one of the project’s accounts.'],
                    ].map((r) => (
                      <tr key={r[0]}>{r.map((c, i) => <td key={i} style={i === 0 ? TD_MONO : TD}>{c}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <H2 id="payment-console">In the Console</H2>
              <P>Payments appear in <strong>Transactions</strong>, with amount and status. Every request made with the key appears in <strong>Logs</strong>, with its <Code>request_id</Code>.</P>

              <NextStepCards lang="en" items={[
                { href: '/docs/en/webhooks', title: 'Set up webhooks', desc: 'Receive payment_session.paid safely.' },
                { href: '/docs/en/refunds', title: 'Refund a payment', desc: 'In full or in part, with idempotency.' },
                { href: '/docs/en/reference#resource-sessions', title: 'Reference: sessions', desc: 'Parameters, responses and errors.' },
              ]} />
            </Section>
    </>
  );
}

export function EnWebhooks({ copy }: { copy: CopyFn }) {
  const a = { color: LINK, fontWeight: 600, textDecoration: 'none' } as const;
  return (
    <>
<Section id="webhooks">
              <h1 style={H1_STYLE}>Webhooks</h1>
              <PageLede>Banzami sends signed events to an HTTPS endpoint on your server when a payment, refund or settlement changes state.</PageLede>

              <H2 id="lifecycle">The life of a delivery</H2>
              <PathDiagram title="The life of a webhook delivery" desc="Banzami records the event and sends it to the endpoint. The endpoint verifies the signature, deduplicates by id, applies the effect and responds 2xx. Without a 2xx, Banzami retries up to five times." steps={['Event', 'Signed delivery', 'Verify', 'Deduplicate', 'Apply', 'Respond 2xx']} highlight={2} />

              <H2 id="recipe">Set up an endpoint, step by step</H2>
              <StepCard lang="en" n={1} of={10} id="webhook-step-1" title="Expose a public HTTPS endpoint"
                what="A POST route on your server, reachable from the internet."
                why="Banzami delivers over the public internet. HTTP, localhost and private addresses are refused at registration."
                success="A test POST to the URL reaches your server."
                next="Register the endpoint.">
                For example <Code>https://www.example.com/api/webhooks/banzami</Code>.
              </StepCard>
              <StepCard lang="en" n={2} of={10} id="webhook-step-2" title="Register the endpoint and store the secret"
                what={<><Code>createWebhookEndpoint</Code> (<Code>POST /v1/webhooks/endpoints</Code>) with the URL and the events you want.</>}
                why="The returned secret is the only way to verify that a delivery comes from Banzami."
                success={<>The response includes <Code>secret</Code>. Store it as <Code>BANZAMI_WEBHOOK_SECRET</Code> — it is not returned again.</>}
                next="Read the raw body.">
                <CodeBlock label="ts · register and rotate the secret" raw={SAMPLE_WEBHOOK_MANAGE} onCopy={copy} {...enCopy} />
              </StepCard>
              <StepCard lang="en" n={3} of={10} id="webhook-step-3" title="Read the raw body"
                what={<><Code>await req.text()</Code>, before any parsing.</>}
                why="The signature covers the bytes received. Parsing and re-serialising the JSON changes those bytes."
                success="You have the body as text, not as an object."
                next="Verify the signature.">
                In frameworks that parse the body automatically, turn that off for this route.
              </StepCard>
              <StepCard lang="en" n={4} of={10} id="webhook-step-4" title="Verify the signature before parsing"
                what={<><Code>banzami.webhooks.constructEvent(raw, signature)</Code>, with the <Code>banza-signature</Code> header.</>}
                why="Anyone can POST to your endpoint. Until the signature checks out, the content cannot be trusted."
                success={<><Code>constructEvent</Code> returns the event. With an invalid signature, it throws.</>}
                next="Reject invalid signatures.">
                <CodeBlock label="ts · verify and handle an event" raw={SAMPLE_WEBHOOK} onCopy={copy} {...enCopy} />
              </StepCard>
              <Callout tone="warn"><strong>Common mistake:</strong> reading the body with <Code>req.json()</Code> and verifying afterwards. Verification fails, and your code has already used unauthenticated data.</Callout>
              <CodeBlock label="ts · wrong and right" raw={SAMPLE_WEBHOOK_WRONG} onCopy={copy} {...enCopy} />
              <StepCard lang="en" n={5} of={10} id="webhook-step-5" title="Reject invalid signatures"
                what={<>Respond <Code>400</Code> with no side effects when <Code>constructEvent</Code> throws.</>}
                why="A genuine delivery that failed is retried by Banzami; a forged request causes nothing."
                success="The request is rejected and nothing is written."
                next="Deduplicate.">
                The header format is <Code>t=&lt;unix&gt;,v1=&lt;hmac_sha256_hex&gt;</Code>. The timestamp tolerance is 5 minutes.
              </StepCard>
              <StepCard lang="en" n={6} of={10} id="webhook-step-6" title="Deduplicate by event id"
                what={<>Record the envelope <Code>id</Code> and ignore an id you have already processed.</>}
                why="Delivery is at-least-once: the same event can arrive more than once."
                success="A second delivery of the same event causes no second effect."
                next="Apply the effect.">
                Store the id in the same transaction that applies the effect.
              </StepCard>
              <StepCard lang="en" n={7} of={10} id="webhook-step-7" title="Apply the business effect"
                what={<>Update your state from <Code>type</Code> and <Code>data</Code>.</>}
                why="The event carries your reference — reference_id, for example — so you can match it to your resource."
                success="The order, donation or settlement is updated exactly once."
                next="Respond quickly.">
                Each event’s fields are listed in <a href="/docs/en/events" style={a}>Events</a>. Do not rely on arrival order.
              </StepCard>
              <StepCard lang="en" n={8} of={10} id="webhook-step-8" title="Respond 2xx quickly"
                what={<>Respond <Code>2xx</Code> and move slow work to a queue.</>}
                why="A slow or non-2xx response counts as a failure and triggers a retry."
                success={<>In <strong>Console → Webhooks</strong>, the delivery shows <Code>2xx</Code>.</>}
                next="Handle failures and replays.">
                Any <Code>2xx</Code> status counts as delivered.
              </StepCard>
              <StepCard lang="en" n={9} of={10} id="webhook-step-9" title="Recover failed deliveries"
                what="List deliveries and replay the ones that failed."
                why="A delivery that failed five times is not retried automatically again."
                success={<>The replayed delivery becomes <Code>SUCCESS</Code>.</>}
                next="Rotate the secret when needed.">
                <Code>listWebhookEvents</Code>, <Code>listWebhookDeliveries(eventId)</Code> and <Code>replayWebhookDelivery(deliveryId)</Code>. A delivery that already succeeded returns <Code>409 DELIVERY_ALREADY_SUCCEEDED</Code>.
              </StepCard>
              <StepCard lang="en" n={10} of={10} id="webhook-step-10" title="Rotate the secret without losing deliveries"
                what={<><Code>rotateWebhookEndpointSecret(id)</Code> returns a new secret, once.</>}
                why="The switch is immediate: the next delivery is signed with the new secret."
                success="Your server accepts deliveries signed with the new secret."
                next="Monitor in Console → Webhooks.">
                Prepare your server for the new secret before rotating. A delivery rejected during the switch is retried by Banzami.
              </StepCard>

              <H2 id="redelivery">Retries and replay</H2>
              <div style={{ overflowX: 'auto', maxWidth: '100%', margin: '0 0 14px' }}>
                <table style={TABLE}>
                  <thead><tr style={THEAD}><th style={TH}>Attempt</th><th style={TH}>When</th></tr></thead>
                  <tbody>
                    {[
                      ['1', 'Immediately after the event'],
                      ['2', '1 minute after the previous failure'],
                      ['3', '5 minutes after the previous failure'],
                      ['4', '30 minutes after the previous failure'],
                      ['5', '2 hours after the previous failure'],
                    ].map((r) => (
                      <tr key={r[0]}><td style={TD_MONO}>{r[0]}</td><td style={TD}>{r[1]}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <P>After the fifth failure, the delivery is <Code>FAILED</Code> and can be replayed. Delivery order is not guaranteed.</P>

              <H2 id="test-event">Test the endpoint without a payment</H2>
              <P>
                In the Sandbox, <strong>Send test event</strong> (Console → Webhooks) or <Code>POST /v1/webhooks/endpoints/{'{id}'}/test</Code> delivers a <Code>webhook.test</Code> event to the endpoint, signed with <Code>banza-signature</Code> like any other.
                Use it to confirm your server reads the raw body, verifies the signature and answers <Code>2xx</Code>. The event is marked <Code>synthetic: true</Code>, describes no payment, cannot be subscribed to and moves nothing; its delivery can be replayed even after it succeeds.
                Handle a <Code>type</Code> you do not know by answering <Code>2xx</Code> with no side effects. A disabled endpoint returns <Code>409 ENDPOINT_DISABLED</Code>.
              </P>

              <H2 id="disable">Disable and re-enable an endpoint</H2>
              <P>
                A disabled endpoint stops receiving events. <strong>Events emitted while it is disabled are never delivered to it</strong>, even after you re-enable it;
                they remain visible under <strong>Events</strong>. Re-enabling applies to the events that follow.
              </P>

              <H2 id="envelope">Envelope format</H2>
              <CodeBlock label="json · event envelope" raw={SAMPLE_WEBHOOK_ENVELOPE} onCopy={copy} {...enCopy} />
              <P style={{ fontSize: 13, color: MUT }}><Code>id</Code> (deduplication), <Code>type</Code> (one of the events), <Code>created_at</Code> (UTC) and <Code>data</Code>. <a href="/docs/en/events" style={a}>Fields for each event</a></P>

              <H2 id="manage-endpoint">Scopes and access</H2>
              <UL>
                <LI><Code>webhooks:read</Code> reads endpoints, events and deliveries. <Code>webhooks:write</Code> registers, disables, replays and rotates the secret.</LI>
                <LI>An endpoint, event or delivery from another project returns <Code>404</Code>.</LI>
                <LI>The owner comes from Financial Setup: no request accepts <Code>merchant_id</Code>.</LI>
              </UL>

              <NextStepCards lang="en" items={[
                { href: '/docs/en/events', title: 'Event reference', desc: 'When each event is emitted and what to do.' },
                { href: '/docs/en/testing#test-webhooks', title: 'Test webhooks', desc: 'Trigger a delivery, a failure and a replay.' },
                { href: '/docs/en/troubleshooting#symptom-webhook-missing', title: 'Webhook not arriving', desc: 'Step-by-step diagnosis.' },
              ]} />
            </Section>
    </>
  );
}

export function EnEvents({ copy }: { copy: CopyFn }) {
  const a = { color: LINK, fontWeight: 600, textDecoration: 'none' } as const;
  return (
    <>
<Section id="events-page">
              <h1 style={H1_STYLE}>Events</h1>
              <PageLede>The seven events Banzami emits: when they happen, the fields they carry, and what your application should do.</PageLede>
              <UL>
                <LI>All of them arrive in the same <a href="/docs/en/webhooks#envelope" style={a}>envelope</a>, signed, delivered at least once and in no guaranteed order.</LI>
                <LI>The listed fields are the contract. A payload may carry other fields for internal audit; do not depend on them.</LI>
                <LI>Amounts are in minor units (100 = 1 Kz); timestamps are UTC.</LI>
              </UL>
              <H2 id="event-catalogue">Catalogue</H2>
              <EventReference lang="en" onCopy={copy} />
              <NextStepCards lang="en" items={[
                { href: '/docs/en/webhooks', title: 'Set up webhooks', desc: 'Verify, deduplicate and respond.' },
                { href: '/docs/en/testing', title: 'Test in the Sandbox', desc: 'Which events you can trigger, and how.' },
              ]} />
            </Section>
    </>
  );
}


export function EnRefunds({ copy }: { copy: CopyFn }) {
  const a = { color: LINK, fontWeight: 600, textDecoration: 'none' } as const;
  return (
    <>
<Section id="refunds">
              <h1 style={H1_STYLE}>Refunds</h1>
              <PageLede>Return all or part of a confirmed payment to the payer. The amount is debited from the account that received the payment.</PageLede>

              <H2 id="refund-flow">How it works</H2>
              <PathDiagram title="How a refund flows" desc="A confirmed payment carries refund_source. Your application creates the refund with that refund_source and an idempotency_key. Banzami debits the receiving account, returns the amount to the payer and emits refund.completed." steps={['Payment PAID', 'refund_source', 'createRefund', 'Account debited', 'refund.completed']} highlight={2} />

              <H2 id="create-refund">Refund a payment</H2>
              <Callout><strong>Minor units:</strong> <Code>amount_minor: 5000</Code> is 50 Kz (100 = 1 Kz).</Callout>
              <StepCard lang="en" n={1} of={3} id="refund-step-1" title="Get the payment source"
                what={<>The payment’s <Code>refund_source</Code>: <Code>{'{'} source_type, source_id {'}'}</Code>.</>}
                why="A refund refers to the payment itself, not to the session or link that led to it."
                success={<>You have <Code>source_type</Code> (<Code>WALLET_PAYMENT</Code>) and <Code>source_id</Code>.</>}
                next="Create the idempotency key.">
                It comes in the <Code>payment_session.paid</Code> or <Code>payment_link.paid</Code> event, and on the session once it is paid.
              </StepCard>
              <StepCard lang="en" n={2} of={3} id="refund-step-2" title="Store an idempotency key"
                what={<>One <Code>idempotency_key</Code> per refund intent, stored before the request.</>}
                why="If the response is lost, retrying with the same key returns the original refund instead of refunding twice."
                success="The key is recorded in your system against the refund."
                next="Create the refund.">
                The SDK does not generate this key: a fresh random value on every attempt would defeat the protection.
              </StepCard>
              <StepCard lang="en" n={3} of={3} id="refund-step-3" title="Create the refund"
                what={<><Code>createRefund</Code>, with the source, amount, currency and key.</>}
                why="The refund executes immediately and emits refund.completed."
                success={<><Code>201</Code> with <Code>status: &quot;SUCCEEDED&quot;</Code>, and a <Code>refund.completed</Code> event whose <Code>trace_id</Code> is your key.</>}
                next="Show the refund to your customer.">
                <CodeBlock label="ts · refund a payment (@banzami/sdk)" raw={SAMPLE_REFUND} onCopy={copy} {...enCopy} />
              </StepCard>

              <H2 id="refund-rules">Rules</H2>
              <UL>
                <LI><strong>Sources:</strong> <Code>WALLET_PAYMENT</Code> for Session and Link payments, and <Code>ACQUIRING_PAYMENT</Code> for payments over an external rail.</LI>
                <LI><strong>Partial refunds:</strong> you can make several refunds against one payment, up to the amount received.</LI>
                <LI><strong>Currency:</strong> must be the payment’s currency.</LI>
                <LI><strong>Balance:</strong> the amount leaves the account that received the payment. If that account no longer holds enough, the request returns <Code>422 REFUND_NOT_FUNDABLE</Code>.</LI>
                <LI><strong>Receipt:</strong> once a payment is fully refunded, its receipt becomes <Code>REVERSED</Code>. <a href="/docs/en/receipts" style={a}>Receipts</a></LI>
                <LI><strong>Access:</strong> the <Code>refunds:write</Code> scope, on <Code>POST /v1/refunds</Code>. Another project’s payment returns <Code>404</Code>.</LI>
              </UL>

              <H2 id="refund-errors">Common errors</H2>
              <div style={{ overflowX: 'auto', maxWidth: '100%', margin: '0 0 14px' }}>
                <table style={TABLE}>
                  <thead><tr style={THEAD}><th style={TH}>Response</th><th style={TH}>Cause</th><th style={TH}>Retry</th></tr></thead>
                  <tbody>
                    {[
                      ['422 REFUND_EXCEEDS_CAPTURED', 'The amount exceeds what is left to refund.', 'With a different amount and a new key.'],
                      ['422 REFUND_NOT_FUNDABLE', 'The receiving account does not hold enough.', 'Once the balance is there, with a new key.'],
                      ['422 INVALID_PAYMENT_STATUS', 'The payment cannot be refunded.', 'No.'],
                      ['422 CURRENCY_MISMATCH', 'The currency is not the payment’s.', 'With the right currency and a new key.'],
                      ['409 IDEMPOTENCY_KEY_CONFLICT', 'The same key was used with a different amount or currency on this payment.', 'With the original request, or with a new key for a different refund.'],
                    ].map((r) => (
                      <tr key={r[0]}>{r.map((c, i) => <td key={i} style={i === 0 ? TD_MONO : TD}>{c}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <H2 id="refund-console">In the Console</H2>
              <P>In <strong>Transactions</strong>, the <strong>Refunds</strong> filter shows every refund. Through the API, <Code>listRefunds({'{'} sourceId {'}'})</Code> lists a payment’s refunds.</P>

              <NextStepCards lang="en" items={[
                { href: '/docs/en/testing#test-refunds', title: 'Test a refund', desc: 'Full, partial and over the limit.' },
                { href: '/docs/en/events#event-refund-completed', title: 'refund.completed', desc: 'The event’s fields.' },
                { href: '/docs/en/reference#resource-refunds', title: 'Reference: refunds', desc: 'Parameters, responses and errors.' },
              ]} />
            </Section>
    </>
  );
}

export function EnSettlements({ copy }: { copy: CopyFn }) {
  const a = { color: LINK, fontWeight: 600, textDecoration: 'none' } as const;
  return (
    <>
<Section id="settlements">
              <h1 style={H1_STYLE}>Settlements</h1>
              <PageLede>Pay out the balance of a segregated account to a beneficiary. Banzami calculates the fee, credits the net amount and reports the result.</PageLede>

              <H2 id="payment-vs-settlement">Payment and settlement</H2>
              <div style={{ overflowX: 'auto', maxWidth: '100%', margin: '0 0 14px' }}>
                <table style={TABLE}>
                  <thead><tr style={THEAD}><th style={TH}></th><th style={TH}>Payment</th><th style={TH}>Settlement</th></tr></thead>
                  <tbody>
                    {[
                      ['Movement', 'From the payer to your account', 'From your account to the beneficiary'],
                      ['Started by', 'The payer', 'Your application, with an explicit request'],
                      ['Fee', 'None', 'Set by the pricing profile Banzami assigned'],
                      ['Automatic', 'Yes, when the payer pays', 'No. It happens only when you request it'],
                      ['Event', 'payment_session.paid', 'application_settlement.completed'],
                    ].map((r) => (
                      <tr key={r[0]}>{r.map((c, i) => <td key={i} style={i === 0 ? TD_HEAD : TD}>{c}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <H2 id="calculation">How the amount is split</H2>
              <Callout><strong>Minor units:</strong> <Code>100000</Code> is 1,000 Kz (100 = 1 Kz).</Callout>
              <SettlementSplitDiagram l={{
                title: 'Settling 1,000 Kz with a 200 bps fee',
                desc: 'The campaign account holds 100000 minor units. At 200 basis points the fee is 2000 and goes to your fee destination; 98000 goes to the beneficiary. The three movements sum to zero.',
                source: 'Campaign account', gross: '100000',
                beneficiary: 'Beneficiary (net)', net: '98000',
                fee: 'Fee destination', feeAmount: '2000',
                sum: '−100000 + 2000 + 98000 = 0',
              }} />
              <UL>
                <LI><strong>Gross:</strong> the account’s whole available balance at the time of the request. The request carries no amount.</LI>
                <LI><strong>Fee:</strong> 200 basis points (bps) = 2%. It comes from the pricing profile Banzami assigned to your Business; a pricing field in the request returns <Code>400 PRICING_FIELD_NOT_ACCEPTED</Code>.</LI>
                <LI><strong>Net:</strong> gross minus fee, credited to the beneficiary.</LI>
              </UL>

              <H2 id="request-settlement">Request a settlement</H2>
              <StepCard lang="en" n={1} of={3} id="settlement-step-1" title="Check the project can settle"
                what={<><Code>getFinancialSetup()</Code> → <Code>settlement.ready</Code> and <Code>settlement.blockers</Code>.</>}
                why="Each blocker is the refusal the settlement would return."
                success={<><Code>settlement.ready</Code> is <Code>true</Code>.</>}
                next="Choose the account and beneficiary.">
                Common blockers: no pricing profile (<Code>PRICING_NOT_CONFIGURED</Code>) or an ineligible fee destination (<Code>FEE_DESTINATION_TYPE_NOT_ALLOWED</Code>).
              </StepCard>
              <StepCard lang="en" n={2} of={3} id="settlement-step-2" title="Store the idempotency key"
                what={<>One <Code>idempotencyKey</Code> per settlement, stored before the request.</>}
                why="If the response is lost, the same key returns the settlement already made, or resumes one that did not complete."
                success="The key is recorded against the campaign or order."
                next="Create the settlement.">
                For example <Code>idem_settlement_campaign_123</Code>.
              </StepCard>
              <StepCard lang="en" n={3} of={3} id="settlement-step-3" title="Create the settlement"
                what={<><Code>createBusinessApplicationSettlement</Code> with the account, the beneficiary and, when there is a fee, the fee destination.</>}
                why="Banzami calculates gross, fee and net, and moves all three in one operation."
                success={<><Code>201</Code> with <Code>status: &quot;COMPLETED&quot;</Code>, <Code>gross_amount_minor</Code>, <Code>application_fee_minor</Code> and <Code>net_amount_minor</Code>. Store the response.</>}
                next="Receive application_settlement.completed.">
                <CodeBlock label="ts · settle an account (@banzami/sdk)" raw={SAMPLE_SETTLE} onCopy={copy} {...enCopy} />
              </StepCard>

              <H2 id="fee-destination">Fee destination</H2>
              <P>
                When the pricing profile resolves a fee, pass <Code>feeDestinationBanzaName</Code>: an @banza of your own Business, of type
                <Code> APPLICATION</Code> or <Code>PLATFORM</Code>, with approved verification and an active wallet. Without it, the settlement returns <Code>422 FEE_DESTINATION_REQUIRED</Code>.
                The APPLICATION classification of an account is assigned by Banzami. In the Sandbox, it is assigned when you choose the <strong>Application or platform</strong> use case, and the project’s own test Business serves as the fee destination without verification — in the Sandbox only.
              </P>

              <H2 id="settlement-errors">Errors and retries</H2>
              <div style={{ overflowX: 'auto', maxWidth: '100%', margin: '0 0 14px' }}>
                <table style={TABLE}>
                  <thead><tr style={THEAD}><th style={TH}>Response</th><th style={TH}>Cause</th><th style={TH}>Idempotency key</th></tr></thead>
                  <tbody>
                    {[
                      ['409 PRICING_NOT_CONFIGURED', 'The Business has no pricing profile yet.', 'New, once Banzami assigns the profile'],
                      ['422 FEE_DESTINATION_REQUIRED', 'There is a fee and no destination.', 'New, with the destination'],
                      ['422 NOTHING_TO_SETTLE', 'The account has no available balance.', 'New, once there is a balance'],
                      ['422 SOURCE_NOT_SEGREGATED', 'The source is the Business’s main account.', 'New, with a segregated account'],
                      ['422 BENEFICIARY_NOT_FOUND', 'The @banza has no active wallet in this currency.', 'New, with another beneficiary'],
                      ['422 SETTLEMENT_NOT_COMPLETED', 'The settlement was created but did not complete.', 'The same — it resumes the settlement'],
                      ['502 · 503', 'A temporary failure.', 'The same'],
                    ].map((r) => (
                      <tr key={r[0]}>{r.map((c, i) => <td key={i} style={i === 0 ? TD_MONO : TD}>{c}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <H2 id="settlement-console">In the Console</H2>
              <UL>
                <LI><strong>Financial Setup</strong> shows settlement readiness, the pricing profile and the fee destination.</LI>
                <LI><strong>Balances</strong> shows the account balance, which drops to zero after the settlement.</LI>
                <LI>The Console does not list settlements, and a project key cannot fetch one by id. Keep the request’s response and the <Code>application_settlement.completed</Code> event.</LI>
              </UL>

              <NextStepCards lang="en" items={[
                { href: '/docs/en/doa#doa-settlement', title: 'Settlement in DOA', desc: 'Closing a campaign and settling it.' },
                { href: '/docs/en/events#event-application_settlement-completed', title: 'Settlement events', desc: 'completed, cancelled and failed.' },
                { href: '/docs/en/reference#ref-settlement-create', title: 'Reference: settlement', desc: 'Parameters, responses and errors.' },
              ]} />
            </Section>
    </>
  );
}

export function EnReceipts({ copy }: { copy: CopyFn }) {
  const a = { color: LINK, fontWeight: 600, textDecoration: 'none' } as const;
  return (
    <>
<Section id="receipts">
              <h1 style={H1_STYLE}>Receipts</h1>
              <PageLede>Every confirmed payment has a receipt with a public reference. Anyone holding the reference can verify the payment, with no account and no key.</PageLede>

              <H2 id="two-references">Transaction reference and proof reference</H2>
              <div style={{ overflowX: 'auto', maxWidth: '100%', margin: '0 0 14px' }}>
                <table style={TABLE}>
                  <thead><tr style={THEAD}><th style={TH}></th><th style={TH}>Transaction reference</th><th style={TH}>Proof reference (SECURE_V1)</th></tr></thead>
                  <tbody>
                    {[
                      ['Example', '5AD6BEA0', 'BZM-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX'],
                      ['What it is', 'The start of the transfer id', 'The receipt’s identifier'],
                      ['Where it appears', 'In the Banzami app’s activity list', 'On the receipt, with a QR code'],
                      ['Publicly verifiable', 'No', 'Yes, at banzami.com/r/{reference} and through the API'],
                      ['Use it to', 'Recognise the transaction in a list', 'Prove the payment exists and what state it is in'],
                    ].map((r) => (
                      <tr key={r[0]}>{r.map((c, i) => <td key={i} style={i === 0 ? TD_HEAD : i === 1 || (i === 2 && r[0] === 'Example') ? TD_MONO : TD}>{c}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <H2 id="format">SECURE_V1 format</H2>
              <UL>
                <LI><Code>BZM-</Code> followed by 24 symbols in six groups of four.</LI>
                <LI>Alphabet: digits and upper-case letters, without I, L, O and U, so no letter is mistaken for a digit.</LI>
                <LI>120 random bits: a reference cannot be guessed or enumerated.</LI>
                <LI>Older eight-symbol references (<Code>BZM-XXXX-XXXX</Code>) remain verifiable.</LI>
              </UL>
              <Callout>Whoever holds the reference sees the amount, both parties’ @banza and the description. Share it with the same care as the receipt itself.</Callout>

              <H2 id="verify">Verify a receipt</H2>
              <P>The receipt’s QR code opens <Code>banzami.com/r/&#123;reference&#125;</Code>, the public verification page. The public API performs the same check, with no authentication.</P>
              <PathDiagram title="Verifying a receipt" desc="A receipt has a reference and a QR code. The QR code opens banzami.com/r/{reference}. The same check is available in the public API, which answers 200, 404 or 503." steps={['Receipt', 'BZM-… reference', 'banzami.com/r/… or API', 'Result']} highlight={2} />
              <CodeBlock label="curl · verify a receipt" onCopy={copy} {...enCopy} raw={`curl https://sandbox-api.banzami.com/v1/public/proofs/BZM-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX`} />
              <div style={{ overflowX: 'auto', maxWidth: '100%', margin: '0 0 14px' }}>
                <table style={TABLE}>
                  <thead><tr style={THEAD}><th style={TH}>HTTP</th><th style={TH}>Response</th><th style={TH}>Meaning</th></tr></thead>
                  <tbody>
                    {[
                      ['200', 'status, amount, parties and date', 'Verified. status: CONFIRMED, PENDING, REVERSED, CANCELLED, FAILED or EXPIRED.'],
                      ['404', 'exists: false, status NOT_FOUND', 'It does not exist, or the reference was altered. Both return the same response.'],
                      ['503', 'exists: false, status UNAVAILABLE', 'Verification is temporarily unavailable. Try again later; it does not mean the receipt is forged.'],
                    ].map((r) => (
                      <tr key={r[0]}><td style={TD_MONO}>{r[0]}</td><td style={TD}>{r[1]}</td><td style={TD}>{r[2]}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <UL>
                <LI><strong>No normalisation:</strong> lower case, spaces or an extra hyphen return <Code>404</Code>. Copy the reference; do not retype it.</LI>
                <LI><strong>Refunds:</strong> a fully refunded payment keeps its receipt, with <Code>status: REVERSED</Code>.</LI>
                <LI><strong>Issuing:</strong> the receipt PDF is issued to the Business in the Banzami Business app. A project key does not download receipts.</LI>
              </UL>

              <NextStepCards lang="en" items={[
                { href: '/docs/en/doa#doa-receipt', title: 'Receipts in DOA', desc: 'Banzami’s receipt and the application’s own.' },
                { href: '/docs/en/reference#ref-public-proof', title: 'Reference: verification', desc: 'GET /v1/public/proofs/{ref}.' },
              ]} />
            </Section>
    </>
  );
}

export function EnTransfers({ copy }: { copy: CopyFn }) {
  const a = { color: LINK, fontWeight: 600, textDecoration: 'none' } as const;
  return (
    <>
<Section id="accounts-transfers">
              <h1 style={H1_STYLE}>Accounts and transfers</h1>
              <PageLede>Keep funds apart per campaign, store or event in segregated accounts, and move value between accounts of the same Business.</PageLede>

              <H2 id="segregated-accounts">Segregated accounts</H2>
              <SegregatedAccountsDiagram l={{
                title: 'One Business, one account per campaign',
                desc: 'The project is connected to a Business through Financial Setup. Inside that Business’s wallet, each campaign has its own account.',
                project: 'Your project',
                owner: 'Business',
                ownerNote: 'set by Financial Setup',
                accounts: ['Campaign A', 'Campaign B', 'Campaign C'],
                accountNote: 'one account per campaign',
              }} />
              <UL>
                <LI><strong>Create:</strong> <Code>createWalletAccount</Code> with a <Code>purpose</Code> and your reference. The request names no wallet and no Business.</LI>
                <LI><strong>Receive:</strong> pass that account’s <Code>walletAccountId</Code> to <Code>createPaymentSession</Code>.</LI>
                <LI><strong>Settle:</strong> the account is the source of <a href="/docs/en/settlements" style={a}>a settlement</a>.</LI>
              </UL>
              <P style={{ fontSize: 13, color: MUT }}>Another project’s account returns <Code>404</Code>, like one that does not exist. Naming the wallet returns <Code>400 PAYEE_NOT_ALLOWED</Code>.</P>

              <H2 id="transfers">Transfer between accounts</H2>
              <Callout><strong>Minor units:</strong> <Code>amountMinor: 50000</Code> is 500 Kz (100 = 1 Kz).</Callout>
              <CodeBlock label="ts · transfer between accounts (@banzami/sdk)" raw={SAMPLE_TRANSFER} onCopy={copy} {...enCopy} />
              <P style={{ fontSize: 13, color: MUT }}><strong>Expected result:</strong> <Code>201</Code> with <Code>status: &quot;COMPLETED&quot;</Code>. Debit and credit are atomic; the Business total does not change.</P>
              <div style={{ overflowX: 'auto', maxWidth: '100%', margin: '0 0 14px' }}>
                <table style={TABLE}>
                  <thead><tr style={THEAD}><th style={TH}>A transfer is</th><th style={TH}>A transfer is not</th></tr></thead>
                  <tbody>
                    <tr><td style={TD}>A move between two accounts of the same Business</td><td style={TD}>A payment to a third party</td></tr>
                    <tr><td style={TD}>Synchronous, confirmed in the response</td><td style={TD}>A settlement with a fee</td></tr>
                    <tr><td style={TD}>Protected by the idempotencyKey</td><td style={TD}>A withdrawal to a bank account</td></tr>
                  </tbody>
                </table>
              </div>
              <UL>
                <LI><strong>Idempotency:</strong> the same key returns the original transfer; the same key with a different request returns <Code>409 IDEMPOTENCY_KEY_REUSED</Code>.</LI>
                <LI><strong>Balance:</strong> without enough funds, the request returns <Code>422 INSUFFICIENT_FUNDS</Code> and nothing moves.</LI>
                <LI><strong>Access:</strong> the <Code>transfers:write</Code> scope, on <Code>POST /v1/wallet-account-transfers</Code>.</LI>
              </UL>

              <NextStepCards lang="en" items={[
                { href: '/docs/en/settlements', title: 'Settle an account', desc: 'From the account balance to the beneficiary.' },
                { href: '/docs/en/reference#resource-accounts', title: 'Reference: accounts', desc: 'Parameters, responses and errors.' },
              ]} />
            </Section>
    </>
  );
}


export function EnDoa({ copy }: { copy: CopyFn }) {
  const a = { color: LINK, fontWeight: 600, textDecoration: 'none' } as const;
  return (
    <>
<Section id="doa">
              <h1 style={H1_STYLE}>Reference implementation — DOA</h1>
              <PageLede>
                <a href="https://www.doadoa.app" style={a}>DOA</a> is an Angolan fundraising application that uses the Banzami Sandbox for its financial flows.
                This guide uses DOA to show how an external application integrates Banzami through the public contracts.
              </PageLede>
              <Callout>
                <strong>DOA is a reference implementation, not a privileged Banzami tenant.</strong> It uses the same public API, SDK, authorisation model,
                webhooks and settlement model available to every developer.
              </Callout>

              <H2 id="doa-what">What DOA demonstrates</H2>
              <UL>
                <LI>One segregated account per campaign, so one campaign’s funds never mix with another’s.</LI>
                <LI>Payments through a Payment Session, with Banzami’s payment page and QR code.</LI>
                <LI>Confirmation by verified webhook, applied exactly once.</LI>
                <LI>Settling a campaign to its beneficiary, with the fee calculated by Banzami.</LI>
                <LI>Reconciliation without keeping balances of its own.</LI>
              </UL>

              <H2 id="doa-architecture">Architecture</H2>
              <PathDiagram title="DOA integration architecture" desc="The donor uses the DOA application. DOA’s server calls the Banzami API through @banzami/sdk. The donor pays at pay.banzami.com. Banzami sends signed webhooks to DOA’s server." steps={['Donor', 'DOA application', '@banzami/sdk', 'Banzami API', 'pay.banzami.com', 'Webhook to DOA']} highlight={3} />

              <H2 id="doa-boundary">Responsibilities</H2>
              <div style={{ overflowX: 'auto', maxWidth: '100%', margin: '0 0 14px' }}>
                <table style={TABLE}>
                  <thead><tr style={THEAD}><th style={TH}>DOA owns</th><th style={TH}>Banzami owns</th></tr></thead>
                  <tbody>
                    {[
                      ['Campaigns', 'Financial execution'],
                      ['The donor experience', 'Balances'],
                      ['Campaign state', 'The ledger'],
                      ['Application business rules', 'Pricing and fees'],
                      ['Application-side reconciliation', 'Receipts and public verification'],
                      ['Requesting settlement', 'Settlement'],
                    ].map((r, i) => (
                      <tr key={i}><td style={TD}>{r[0]}</td><td style={TD}>{r[1]}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <P>DOA never stores a balance. When it needs to know how much a campaign has received, it asks Banzami.</P>

              <H2 id="doa-flow">The integration journey</H2>
              <ResponsibilityDiagram
                title="From donor to settlement: what DOA does and what Banzami does"
                desc="DOA creates the campaign account and the payment session. Banzami returns the link and QR code, takes the payment, issues the receipt and sends the webhook. DOA confirms the donation and, at close, requests settlement. Banzami calculates the fee and settles."
                appLabel="DOA" banzamiLabel="Banzami"
                steps={[
                  { side: 'app', text: 'Campaign account' },
                  { side: 'app', text: 'Payment Session' },
                  { side: 'banzami', text: 'Link, QR code and payment' },
                  { side: 'banzami', text: 'Receipt and webhook' },
                  { side: 'app', text: 'Confirms the donation' },
                  { side: 'app', text: 'Requests settlement' },
                  { side: 'banzami', text: 'Fee and settlement' },
                ]} />

              <H2 id="doa-prepare">1. Prepare the project</H2>
              <ChapterFacts lang="en" appLabel="DOA"
                goal="A project with Financial Setup complete and a key with the scopes it needs."
                app="Creates the workspace and project in the Console, completes Financial Setup, and stores the key and webhook secret on its server."
                banzami="Creates the project’s test Business for the Application or platform use case — or accepts the owner’s consent code — and assigns the classification and pricing profile."
                result={<><Code>getFinancialSetup()</Code> returns <Code>financial_setup.state</Code> <Code>READY</Code> or <Code>SEALED</Code>.</>}
                failure={<><Code>403 PAYMENTS_UNAVAILABLE</Code> when creating a session: Financial Setup is not complete yet.</>} />
              <ol style={{ margin: '0 0 14px', padding: '0 0 0 20px', maxWidth: 660, display: 'flex', flexDirection: 'column', gap: 7 }}>
                <LI>In the <a href="/docs/en/console" style={a}>Console</a>, create a <strong>workspace</strong> and a <strong>project</strong> for the application.</LI>
                <LI>
                  Complete <strong>Financial Setup</strong>: choose the <strong>Application or platform</strong> use case — Banzami creates the test Business with the APPLICATION classification and the reference price, waiting for nobody — or connect an existing Business with the
                  consent code its owner generates. <a href="/docs/en/get-started#financial-setup" style={a}>Financial Setup</a>
                </LI>
                <LI>
                  Create a secret key with <Code>identity:read</Code>, <Code>wallet_accounts:create</Code>, <Code>wallet_accounts:read</Code>,{' '}
                  <Code>payment_sessions:write</Code>, <Code>payment_sessions:read</Code>, <Code>webhooks:write</Code>, <Code>webhooks:read</Code> and{' '}
                  <Code>application_settlements:write</Code>. Settlement has a scope of its own: being able to receive does not grant the ability to settle.
                </LI>
                <LI>Install the SDK on the server: <Code>npm install @banzami/sdk</Code>.</LI>
                <LI>
                  Set <Code>BANZAMI_API_KEY</Code> and <Code>BANZAMI_WEBHOOK_SECRET</Code> (the endpoint secret, returned once at registration). If the pricing profile
                  charges a settlement fee, also set <Code>BANZAMI_FEE_DESTINATION</Code>, the @banza of your Business that receives it.
                </LI>
                <LI>Before activating a campaign, confirm with <Code>getFinancialSetup()</Code> that the project can receive payments.</LI>
              </ol>

              <H2 id="doa-accounts">2. Create the campaign account</H2>
              <ChapterFacts lang="en" appLabel="DOA"
                goal="One segregated account per campaign."
                app="Creates the account when the campaign is activated, and stores its id with the campaign."
                banzami="Opens the account in the project’s Business wallet."
                result={<><Code>201</Code> with the account <Code>id</Code> and <Code>status: &quot;ACTIVE&quot;</Code>.</>}
                failure={<><Code>400 PAYEE_NOT_ALLOWED</Code> if the request names the wallet.</>} />
              <CodeBlock label="ts · one account per campaign" onCopy={copy} {...enCopy} raw={`// When the campaign is activated, open the account that will receive it.
const account = await banzami.createWalletAccount({
  purpose:       'CAMPAIGN',
  referenceType: 'CAMPAIGN',
  referenceId:   campaign.id,      // your application's reference
  label:         campaign.title,
});

// Store the id: it is the settlement source.
await db.campaigns.update(campaign.id, { banzami_wallet_account_id: account.id });`} />

              <H2 id="doa-payment">3. Create the payment</H2>
              <Callout><strong>Minor units:</strong> <Code>amountMinor: 500000</Code> is 5,000 Kz (100 = 1 Kz).</Callout>
              <ChapterFacts lang="en" appLabel="DOA"
                goal="One Payment Session per donation, credited to the campaign account."
                app="Creates the session with the donation intent id as its reference."
                banzami="Creates the link and QR code, both tied to the campaign account."
                result={<><Code>201</Code> with <Code>status: &quot;ACTIVE&quot;</Code> and a <Code>pay.banzami.com/pay/…</Code> link.</>}
                failure="Sending the same reference again returns the existing session, even with a different amount." />
              <CodeBlock label="ts · one session per donation" onCopy={copy} {...enCopy} raw={`const session = await banzami.createPaymentSession({
  walletAccountId: campaign.banzami_wallet_account_id,
  purpose:         'DONATION',
  referenceType:   'DONATION',
  referenceId:     intent.id,       // returned in payment_session.paid
  amountMinor:     500000,          // 5,000 Kz
  currency:        'AOA',
  description:     'Donation to ' + campaign.title,
});
const link = banzami.paymentSessionInterface(session, 'PAYMENT_LINK');`} />

              <H2 id="doa-page">4. Payment page and QR code</H2>
              <P>
                The donor pays on a Banzami page. The session returns a link to <Code>pay.banzami.com/pay/…</Code> and a QR code that encodes the same address;
                DOA shows one of them. The donor returning to DOA does not confirm the payment: the confirmation arrives by webhook, or by reading the session on the server.
              </P>

              <H2 id="doa-webhook">5. Receive the webhook</H2>
              <ChapterFacts lang="en" appLabel="DOA"
                goal="Confirm each donation exactly once, from a verified event."
                app="Verifies the signature over the raw body, deduplicates by event id, and confirms the donation."
                banzami="Signs and delivers payment_session.paid, and retries if it does not receive a 2xx."
                result="The donation is confirmed once, even when the event arrives more than once."
                failure="Parsing the JSON before verifying: the signature check fails." />
              <CodeBlock label="ts · webhook" onCopy={copy} {...enCopy} raw={`export async function POST(req) {
  // 1. The raw body: re-serialising the JSON changes the signed bytes.
  const raw = await req.text();

  // 2. Verify before reading. constructEvent verifies the signature and only then
  //    returns the event. (client created with { apiKey, webhookSecret })
  let event;
  try {
    event = banzami.webhooks.constructEvent(raw, req.headers.get('banza-signature') ?? '');
  } catch {
    return new Response('invalid signature', { status: 400 });
  }

  // 3. Idempotent by event id: delivery is at-least-once.
  if (await db.events.exists(event.id)) return new Response('ok');
  await db.events.record(event.id);

  // 4. The business effect.
  if (event.type === 'payment_session.paid') {
    // reference_id is the reference given when the session was created.
    await confirmDonation(event.data.reference_id);
  }

  // 5. Respond 2xx quickly; slow work goes to a queue.
  return new Response('ok');
}`} />

              <H2 id="doa-state">6. Update application state</H2>
              <UL>
                <LI><strong>The donation</strong> becomes confirmed when the event is applied. DOA confirms by donation intent, once, whether the confirmation comes through <Code>payment_session.paid</Code> or <Code>payment_link.paid</Code>.</LI>
                <LI><strong>The campaign total</strong> is not a balance DOA stores: it reads it from Banzami with <Code>getWalletAccount</Code>.</LI>
                <LI><strong>The campaign state</strong> (active, closed, settled) belongs to DOA. The state of the money belongs to Banzami.</LI>
              </UL>

              <H2 id="doa-receipt">7. Receipt</H2>
              <P>
                The payment receipt is issued by Banzami, with a public <Code>BZM-…</Code> reference and a QR code that opens <Code>https://banzami.com/r/&#123;reference&#125;</Code>.
                The donation receipt DOA sends is an application document, which can quote that reference.
              </P>
              <P>
                Verification is public: <Code>GET /v1/public/proofs/&#123;reference&#125;</Code> returns <Code>200</Code> with the status and amount, or <Code>404</Code>.{' '}
                <a href="/docs/en/receipts" style={a}>Receipts</a>
              </P>

              <H2 id="doa-close">8. Close the campaign</H2>
              <P>
                Closing a campaign is DOA’s decision, and it is when DOA requests settlement. Until then, the balance stays in the campaign account.
                A closed campaign with a pending settlement is a normal state, and the application should present it as one.
              </P>

              <H2 id="doa-settlement">9. Settle the campaign</H2>
              <ChapterFacts lang="en" appLabel="DOA"
                goal="Pay out the campaign balance to the beneficiary."
                app="Requests settlement of the campaign account with one idempotency key per campaign, and stores the settlement id."
                banzami="Reads the balance, applies the pricing profile, credits the fee and the net, and emits application_settlement.completed."
                result={<><Code>201</Code> with <Code>gross_amount_minor</Code>, <Code>application_fee_minor</Code> and <Code>net_amount_minor</Code>.</>}
                failure={<><Code>422 FEE_DESTINATION_REQUIRED</Code>: the pricing profile has a fee and the request names no destination.</>} />
              <CodeBlock label="ts · settlement" onCopy={copy} {...enCopy} raw={`const settlement = await banzami.createBusinessApplicationSettlement({
  sourceAccountId:         campaign.banzami_wallet_account_id,
  beneficiaryBanzaName:    campaign.beneficiary_banza,    // the @banza that receives
  // An @banza of your Business (APPLICATION or PLATFORM) when the profile has a fee.
  feeDestinationBanzaName: process.env.BANZAMI_FEE_DESTINATION,
  referenceType:           'CAMPAIGN',
  referenceId:             campaign.id,
  // One key per campaign, stored before the request.
  idempotencyKey:          'idem_settlement_' + campaign.id,
});

// Result, calculated by Banzami:
// {
//   gross_amount_minor:     100000,   // the account balance
//   application_fee_minor:    2000,   // 200 bps
//   net_amount_minor:        98000,   // to the beneficiary
//   currency: "AOA", status: "COMPLETED"
// }`} />
              <P>
                The three movements sum to zero: <Code>-100000 + 2000 + 98000 = 0</Code>. The request carries no amount and no fee; settlement is never automatic.{' '}
                <a href="/docs/en/settlements" style={a}>Settlements</a>
              </P>

              <H2 id="doa-reconciliation">10. Reconcile</H2>
              <div style={{ overflowX: 'auto', maxWidth: '100%', margin: '0 0 14px' }}>
                <table style={TABLE}>
                  <thead><tr style={THEAD}><th style={TH}>Check</th><th style={TH}>Source at Banzami</th></tr></thead>
                  <tbody>
                    {[
                      ['Every confirmed donation matches a payment', 'payment_session.paid and getPaymentSession'],
                      ['The campaign total', 'getWalletAccount (the account balance)'],
                      ['A settlement’s gross, fee and net', 'The createBusinessApplicationSettlement response and application_settlement.completed'],
                      ['A specific request', 'request_id in Console → Logs'],
                    ].map((r, i) => (
                      <tr key={i}><td style={TD}>{r[0]}</td><td style={TD}>{r[1]}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <H2 id="doa-credentials">11. Rotate and revoke credentials</H2>
              <UL>
                <LI><strong>API key:</strong> create a new key with the same scopes, deploy it, confirm <Code>GET /v1/me</Code>, then revoke the old one. Revocation is immediate: the old key starts returning <Code>401</Code>.</LI>
                <LI><strong>Webhook secret:</strong> <Code>rotateWebhookEndpointSecret</Code> returns a new secret, once. The switch is immediate; prepare your server before rotating.</LI>
                <LI><strong>Suspected exposure:</strong> revoke first, investigate second. A revoked key cannot be reactivated.</LI>
              </UL>

              <H2 id="doa-lessons">What to reuse in your application</H2>
              <UL>
                <LI><strong>One account per business unit from the start.</strong> Separating funds after they are mixed is far harder.</LI>
                <LI><strong>No duplicated balances.</strong> Show the amount Banzami returns.</LI>
                <LI><strong>Financial readiness is a condition.</strong> Check it before offering payment, rather than waiting for the 403.</LI>
                <LI><strong>Log the request_id</strong> of every unexpected response.</LI>
              </UL>
              <P style={{ fontSize: 13, color: MUT }}>The examples use fictitious identifiers and contain no keys, secrets or internal ids.</P>

              <NextStepCards lang="en" items={[
                { href: '/docs/en/get-started', title: 'Quickstart', desc: 'The same steps, for your application.' },
                { href: '/docs/en/settlements', title: 'Settlements', desc: 'Calculation, fee destination and errors.' },
                { href: '/docs/en/troubleshooting', title: 'Troubleshooting', desc: 'By symptom, with what to check.' },
              ]} />
            </Section>
    </>
  );
}


export function EnConsole({ copy }: { copy: CopyFn }) {
  const a = { color: LINK, fontWeight: 600, textDecoration: 'none' } as const;
  return (
    <>
<Section id="console">
              <h1 style={H1_STYLE}>The Console</h1>
              <PageLede>The Console, at <Code>developers.banzami.com</Code>, is where you manage workspaces, projects, Financial Setup, keys, webhooks and logs.</PageLede>

              <H2 id="model">The model</H2>
              <P>Person, workspace, project and Business are distinct concepts. <a href="/docs/en/concepts#model" style={a}>The integration model</a></P>

              <H2 id="account">Account</H2>
              <P>Your personal account is at <Code>/conta</Code>. You sign in with your email and a six-digit code; there is no password.</P>
              <UL>
                <LI><strong>Profile</strong> — the name shown to members of your workspaces. Your email is your identifier and cannot be changed.</LI>
                <LI><strong>Security</strong> — describes how sign-in works: a code by email and a cookie session. There is no password or MFA to configure.</LI>
                <LI><strong>Sessions</strong> — open sessions, with origin and last use, and an option to end all others.</LI>
                <LI><strong>Sign out</strong> — asks for confirmation and ends the current session.</LI>
              </UL>

              <H2 id="workspace">Workspaces, members and roles</H2>
              <P>A workspace defines who has access. Creating one is immediate.</P>
              <div style={{ overflowX: 'auto', maxWidth: '100%', margin: '0 0 14px' }}>
                <table style={TABLE}>
                  <thead><tr style={THEAD}><th style={TH}>Role</th><th style={TH}>Permissions</th></tr></thead>
                  <tbody>
                    {[
                      ['Owner', 'Everything, including inviting, changing roles, archiving and deleting. The last Owner cannot leave.'],
                      ['Admin', 'Manage members, projects and keys. Cannot change or remove Owners or other Admins, and cannot appoint Admins.'],
                      ['Developer', 'Create and manage projects, keys and webhooks. Does not manage members.'],
                      ['Finance', 'View balances, transactions and settlements. Does not create keys.'],
                      ['Viewer', 'Read-only.'],
                    ].map((r) => (
                      <tr key={r[0]}><td style={TD_HEAD}>{r[0]}</td><td style={TD}>{r[1]}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <UL>
                <LI><strong>Invite</strong> generates a link the Console copies for you. The invitation sets the role; whoever accepts signs in with their own email.</LI>
                <LI><strong>Leaving a workspace</strong> is always possible, except for the last Owner.</LI>
                <LI><strong>Transferring ownership</strong> takes two steps: an Owner gives another member the Owner role, then leaves or changes their own role. The workspace is never without an Owner.</LI>
                <LI><strong>Archive</strong> is refused while projects are active; the Console says how many.</LI>
                <LI><strong>Delete</strong> is possible only for a workspace with no history. A workspace with history is archived.</LI>
              </UL>

              <H2 id="activity">Workspace activity</H2>
              <P>
                Under <Code>Settings · Activity</Code>, the workspace’s administrative record: invitations, joins and departures, role changes, and changes to the workspace,
                its projects and its keys. A role change shows both the previous and the new role.
              </P>
              <div style={{ overflowX: 'auto', maxWidth: '100%', margin: '0 0 14px' }}>
                <table style={TABLE}>
                  <thead><tr style={THEAD}><th style={TH}></th><th style={TH}>Activity</th><th style={TH}>Logs</th></tr></thead>
                  <tbody>
                    {[
                      ['Answers', 'Who changed what in the workspace', 'What your application asked the API'],
                      ['Scope', 'The workspace', 'One project'],
                      ['Who sees it', 'Owners and Admins', 'Members with access to the project'],
                      ['Retention', 'Permanent; survives deleted projects', '30 days'],
                      ['Secrets', 'Never: no key values or prefixes', 'Never: no Authorization header, no request bodies'],
                    ].map((r) => (
                      <tr key={r[0]}>{r.map((c, i) => <td key={i} style={i === 0 ? TD_HEAD : TD}>{c}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <P style={{ fontSize: 13, color: MUT }}>Personal sessions, sign-in codes and account settings are not in Activity; they belong to <Code>/conta</Code>.</P>

              <H2 id="project">Projects</H2>
              <UL>
                <LI><strong>Project ID</strong> — does not change when you rename the project.</LI>
                <LI><strong>Delete</strong> — possible while the project has no history: no key ever issued, no request logged, no Financial Setup.</LI>
                <LI><strong>Archive</strong> — for projects with history. Revokes active keys; from then on they return <Code>401</Code>.</LI>
                <LI>Archived projects appear under <strong>Show archived</strong>.</LI>
              </UL>

              <H2 id="financial">Financial Setup</H2>
              <P>
                Connects the project to the Business that receives its payments. In the Sandbox, choose the use case — <strong>Store, service or business</strong> or <strong>Application or platform</strong> — and Banzami creates a test Business with that use’s classification and price; or connect an existing Business with its consent code.
                It shows the Business (a test Business appears as not verified), settlement readiness, the pricing profile and the fee destination. The use case can change until the first payment is issued, and
                <strong> Generate connection code</strong> lets another project of yours use the same test Business. <a href="/docs/en/get-started#financial-setup" style={a}>The two paths</a>
              </P>
              <P style={{ fontSize: 13, color: MUT }}>The same state is available through the API at <Code>GET /v1/financial-setup</Code>.</P>

              <H2 id="keys">API keys</H2>
              <UL>
                <LI><strong>Name</strong> — identifies the key in the list and in Activity; it does not change permissions.</LI>
                <LI><strong>Scopes</strong> — set at creation and immutable.</LI>
                <LI><strong>Secret</strong> — starts with <Code>bz_test_sk_</Code> and is shown once, in the creation dialog. Afterwards the list shows only the prefix and a mask.</LI>
                <LI><strong>Rotate</strong> — creates the successor and revokes the previous key in one step. For a switch without downtime, create a new key first, deploy it, then revoke the old one.</LI>
                <LI><strong>Revoke</strong> — immediate: the next request with that key returns <Code>401</Code>.</LI>
                <LI><strong>Last used</strong> — shows which keys are no longer in use.</LI>
              </UL>
              <P>Each endpoint requires one scope. Give each key only the scopes its server needs:</P>
              <ScopeTable lang="en" />
              <P><a href="/docs/en/trust#keys" style={a}>Where to store keys</a></P>

              <H2 id="console-webhooks">Webhooks</H2>
              <UL>
                <LI><strong>Register</strong> an HTTPS endpoint; the signing secret is returned once.</LI>
                <LI><strong>Events</strong> lists your project’s events; each event shows its deliveries, with status and response code.</LI>
                <LI><strong>Replay</strong> repeats the same delivery.</LI>
                <LI><strong>Send test event</strong> sends <Code>webhook.test</Code> to the endpoint, signed and marked as a test; it moves nothing and can be replayed.</LI>
                <LI><strong>Rotate secret</strong> issues a new secret, shown once; the endpoint stays the same.</LI>
                <LI><strong>Disable</strong> stops sending events to the endpoint without deleting it. Events emitted while it is disabled are not delivered to it later.</LI>
              </UL>
              <P><a href="/docs/en/webhooks" style={a}>Set up webhooks</a></P>

              <H2 id="logs">Balances, transactions and logs</H2>
              <UL>
                <LI><strong>Balances</strong> — the accounts of the Business connected to the project, and the balance of each.</LI>
                <LI><strong>Transactions</strong> — payments, refunds and transfers between accounts of the Business connected to the project, including those started by other projects of the same Business.</LI>
                <LI><strong>Logs</strong> — every request made with the project’s keys, with <Code>request_id</Code>, status and latency, kept for 30 days. Filter by method and by source: the integration’s keys or the API Explorer.</LI>
              </UL>

              <H2 id="console-test-data">Test data and API Explorer</H2>
              <UL>
                <LI><strong>Overview</strong> — the steps to get started in the Sandbox, ticked from what the project has already done, and the two environments: Sandbox available; Live unavailable, requiring institutional approval.</LI>
                <LI><strong>Test data</strong> — test payers (create, top up, pay as, retire), the scenarios and <strong>Reset the Sandbox</strong>.</LI>
                <LI><strong>API Explorer</strong> — runs the v1 API against the Sandbox with no key in the browser: each request uses a 60-second key holding only the operation’s scope.</LI>
              </UL>
              <P><a href="/docs/en/testing" style={a}>Sandbox testing</a></P>
              <P style={{ fontSize: 13, color: MUT }}>No Console page shows illustrative data. An empty list means there is nothing recorded yet.</P>

              <NextStepCards lang="en" items={[
                { href: '/docs/en/get-started', title: 'Quickstart', desc: 'From account to first payment.' },
                { href: '/docs/en/trust', title: 'Security', desc: 'Keys, secrets and permissions.' },
                { href: '/docs/en/troubleshooting', title: 'Troubleshooting', desc: 'What to check in the Console, by symptom.' },
              ]} />
            </Section>
    </>
  );
}

export function EnReference({ copy }: { copy: CopyFn }) {
  const a = { color: LINK, fontWeight: 600, textDecoration: 'none' } as const;
  return (
    <>
<Section id="api-reference">
              <h1 style={H1_STYLE}>API reference</h1>
              <PageLede>Banzami’s public API v1, endpoint by endpoint: authentication, scope, parameters, response, errors, events and the matching SDK method.</PageLede>
              <div style={{ overflowX: 'auto', maxWidth: '100%', margin: '0 0 14px' }}>
                <table style={TABLE}>
                  <tbody>
                    {[
                      ['Base URL', 'https://sandbox-api.banzami.com/v1'],
                      ['Authentication', 'Authorization: Bearer bz_test_sk_…'],
                      ['Format', 'JSON; UTC timestamps (RFC 3339); amounts in minor units'],
                      ['Version', 'v1'],
                      ['Recommended SDK', '@banzami/sdk'],
                      ['Specification', 'OpenAPI at /developers/openapi/banzami-sandbox.openapi.json'],
                    ].map((r) => (
                      <tr key={r[0]}><td style={TD_HEAD}>{r[0]}</td><td style={TD_MONO}>{r[1]}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <H2 id="authentication">Authentication</H2>
              <UL>
                <LI>Send the secret key in the <Code>Authorization: Bearer bz_test_sk_…</Code> header. There is no token exchange.</LI>
                <LI><Code>bz_live_</Code> keys are refused. <a href="/docs/en/concepts#sandbox-live" style={a}>Sandbox and Live</a></LI>
                <LI>A revoked or rotated key returns <Code>401 UNAUTHORIZED</Code>.</LI>
                <LI>Workspaces, projects, members and keys are managed in the Console; they are not part of this API.</LI>
              </UL>

              <H2 id="credentials">Capabilities by credential</H2>
              <div style={{ overflowX: 'auto', maxWidth: '100%', margin: '0 0 14px' }}>
                <table style={TABLE}>
                  <thead><tr style={THEAD}><th style={TH}>Capability</th><th style={TH}>Credential</th><th style={TH}>Status</th></tr></thead>
                  <tbody>
                    {([
                      ['Console — workspaces, projects, members, keys', 'Session (email + code)', 'Available in Sandbox'],
                      ['GET /v1/me', 'Project key (identity:read)', 'Available in Sandbox'],
                      ['Payment Sessions', 'Project key (payment_sessions:write / :read) and completed Financial Setup', 'Available in Sandbox'],
                      ['Payment Links', 'Project key (payment_links:write / :read) and completed Financial Setup', 'Available in Sandbox'],
                      ['Webhooks', 'Project key (webhooks:write / :read)', 'Available in Sandbox'],
                      ['Refunds', 'Project key (refunds:write / :read)', 'Available in Sandbox'],
                      ['Transfers between accounts', 'Project key (transfers:write)', 'Available in Sandbox'],
                      ['Settlements', 'Project key (application_settlements:write)', 'Available in Sandbox'],
                      ['Financial Live', '—', 'Unavailable (fail-closed)'],
                    ] as [string, string, string][]).map(([cap, cred, st]) => (
                      <tr key={cap}><td style={TD_HEAD}>{cap}</td><td style={TD}>{cred}</td><td style={TD}>{st}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <H2 id="idempotency">Idempotency <Badge tone="ok">{BADGE_LABELS_EN.ok}</Badge></H2>
              <UL>
                <LI><strong>Timeout or network error:</strong> retry with the same key and the same body. A new key makes it a second request.</LI>
                <LI><strong><Code>Idempotency-Key</Code> header:</strong> on any write, the original response (2xx or 4xx) is replayed for the same key for 24 hours, per credential, method and path.</LI>
                <LI><strong>5xx:</strong> never replayed; the request can be retried with the same key.</LI>
                <LI><strong>Concurrent requests</strong> with the same key: the second gets <Code>409 IDEMPOTENCY_CONFLICT</Code>. Wait, then retry with the same key.</LI>
                <LI><strong>The same key with a different body</strong> gets <Code>409 IDEMPOTENCY_KEY_REUSED</Code>: it is a different request and needs a different key.</LI>
                <LI><strong>Refunds, transfers and settlements</strong> also require an <Code>idempotency_key</Code> in the body, which protects the money movement.</LI>
              </UL>
              <CodeBlock label="curl · safe retry with Idempotency-Key" raw={SAMPLE_IDEM_RETRY} onCopy={copy} {...enCopy} />

              <H2 id="rate-limits">Rate limits</H2>
              <P>
                Limits apply per IP address and per key. When you exceed them, the API returns <Code>429 RATE_LIMITED</Code> with a <Code>Retry-After</Code> header, in seconds, and does not execute the request.
                The limit values may change; this behaviour does not.
              </P>
              <H2 id="time">Dates and times</H2>
              <P>
                All timestamps are UTC, in RFC 3339 (<Code>2026-07-11T11:45:00Z</Code>). The Console displays them in your browser’s time zone, and the public receipt verification
                page in Luanda time.
              </P>
              <H2 id="identifiers">Identifiers to store</H2>
              <UL>
                <LI><strong>Project ID</strong> — unchanged when the project is renamed.</LI>
                <LI><strong>Resource ids</strong> — <Code>session_id</Code>, account, refund, endpoint — to look them up.</LI>
                <LI><strong><Code>reference_id</Code></strong> — your reference, returned on resources and events.</LI>
                <LI><strong>Each event’s <Code>id</Code></strong> — to deduplicate deliveries.</LI>
                <LI><strong>The <Code>BZM-…</Code> reference</strong> — the one that verifies publicly.</LI>
                <LI><strong><Code>request_id</Code></strong> — of every unexpected response.</LI>
              </UL>
              <P style={{ fontSize: 13, color: MUT }}>An id grants no access: another project’s resource returns <Code>404</Code>.</P>

              <H2 id="resource-reference">Endpoints</H2>
              <ResourceReference lang="en" onCopy={copy} />

              <NextStepCards lang="en" items={[
                { href: '/docs/en/errors', title: 'Error catalogue', desc: 'Every code, what it means and what to do.' },
                { href: '/docs/en/events', title: 'Event reference', desc: 'Fields and expected action.' },
                { href: '/docs/en/artifacts', title: 'OpenAPI and Postman', desc: 'The same endpoints, machine-readable.' },
              ]} />
              </Section>
    </>
  );
}

export function EnErrors({ copy }: { copy: CopyFn }) {
  const a = { color: LINK, fontWeight: 600, textDecoration: 'none' } as const;
  return (
    <>
<Section id="errors">
              <h1 style={H1_STYLE}>Errors</h1>
              <PageLede>Every error response uses the same envelope. Handle it by HTTP status first, then by the <Code>code</Code> field — never by the message.</PageLede>
              <CodeBlock label="json · error envelope" raw={SAMPLE_ERROR} onCopy={copy} {...enCopy} />
              <UL>
                <LI><Code>code</Code> — stable; the field to branch on in your application.</LI>
                <LI><Code>message</Code> — an English explanation for logs. It may change.</LI>
                <LI><Code>request_id</Code> — finds the request in <strong>Console → Logs</strong> for 30 days. Logs never store the <Code>Authorization</Code> header, keys, secrets, cookies, OTP codes or request bodies.</LI>
              </UL>

              <H2 id="by-status">By HTTP status</H2>
              <HttpClassTable lang="en" />

              <H2 id="error-catalogue">By error code</H2>
              <P>Every code a project key can receive in the Sandbox, and only those. Search by code or word, or filter by HTTP status and domain.</P>
              <ErrorCatalogue lang="en" />

              <H2 id="console-errors">Console errors</H2>
              <div style={{ overflowX: 'auto', maxWidth: '100%', margin: '0 0 14px' }}>
                <table style={TABLE}>
                  <thead><tr style={THEAD}><th style={TH}>Code</th><th style={TH}>What to do</th></tr></thead>
                  <tbody>
                    {[
                      ['INVALID_EMAIL / INVALID_CODE', 'Correct the email, or request a new code.'],
                      ['RATE_LIMITED', 'Wait before requesting another code.'],
                      ['UNAUTHENTICATED', 'The session expired: sign in again.'],
                      ['FORBIDDEN', 'Your role does not allow the action, or the request failed the origin check.'],
                      ['CONFLICT / LAST_OWNER', 'The state changed, or the action would leave the workspace without an Owner.'],
                      ['INVITE_INVALID', 'The invitation expired, was revoked or was already used: ask for a new one.'],
                      ['VALIDATION', 'Correct the fields indicated.'],
                    ].map((r) => (
                      <tr key={r[0]}><td style={TD_MONO}>{r[0]}</td><td style={TD}>{r[1]}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <NextStepCards lang="en" items={[
                { href: '/docs/en/troubleshooting', title: 'Troubleshooting', desc: 'Start from the symptom instead of the code.' },
                { href: '/docs/en/reference#idempotency', title: 'Idempotency', desc: 'When to retry with the same key.' },
                { href: '/docs/en/support', title: 'Support', desc: 'What to send, and what never to send.' },
              ]} />
            </Section>
    </>
  );
}


export function EnSdk({ copy }: { copy: CopyFn }) {
  const a = { color: LINK, fontWeight: 600, textDecoration: 'none' } as const;
  return (
    <>
<Section id="sdks">
              <h1 style={H1_STYLE}>SDKs</h1>
              <PageLede>The official SDKs handle authentication, idempotency, retries and webhook verification. They are the recommended path; the HTTP API is there for diagnostics and specific integrations.</PageLede>

              <H2 id="sdk-maturity">Available SDKs</H2>
              <div style={{ overflowX: 'auto', maxWidth: '100%', margin: '0 0 14px' }}>
                <table style={{ ...TABLE, minWidth: 560 }}>
                  <thead><tr style={THEAD}><th style={TH}>Package</th><th style={TH}>Language</th><th style={TH}>Status</th><th style={TH}>Install</th></tr></thead>
                  <tbody>
                    {SDKS.map((s) => (
                      <tr key={s.name}><td style={TD_MONO}>{s.name}</td><td style={TD}>{s.lang}</td><td style={TD}>{s.state}</td><td style={TD_MONO}>{s.consume}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <UL>
                <LI><Code>@banzami/sdk</Code> (npm) is the server SDK and uses the secret key.</LI>
                <LI><Code>banzami_client</Code> (pub.dev) is the client SDK and uses only the read-only publishable key.</LI>
                <LI>The Python, PHP and Go SDKs are not published; these docs show no install command for packages no registry offers.</LI>
              </UL>

              <H2 id="sdk-first">What the SDK handles for you</H2>
              <UL>
                <LI>Authentication with your key, and environment separation.</LI>
                <LI>An <Code>Idempotency-Key</Code> on every write, and retries on <Code>429</Code>, <Code>502</Code>, <Code>503</Code> and <Code>504</Code>.</LI>
                <LI>Typed errors: <Code>BanzamiApiError</Code> with <Code>status</Code> and <Code>code</Code>.</LI>
                <LI>Webhook signature verification: <Code>webhooks.constructEvent</Code>.</LI>
              </UL>
              <P style={{ fontSize: 13, color: MUT }}>
                Refunds, transfers and settlements require an idempotency key of your own: the SDK does not generate one, because a new key on every attempt would defeat the protection.
              </P>

              <H2 id="sdk-preview">Current version</H2>
              <P>
                <Code>@banzami/sdk</Code> 0.13.0. In 0.13.0, <Code>createPaymentLink</Code> and <Code>listPaymentLinks</Code> still require <Code>merchantId</Code> in their types; with a project key,
                use HTTP for Payment Links. <a href="/docs/en/payments#links" style={a}>Payment Links</a>
              </P>
              <P>
                Complete example: <a href="/developers/examples/sdk/typescript-payment-session.example.ts" style={a}>typescript-payment-session.example.ts</a>. The TypeScript examples in these docs
                are compiled against the published package.
              </P>

              <H2 id="sdk-families">Status by family</H2>
              <div style={{ overflowX: 'auto', maxWidth: '100%', margin: '0 0 14px' }}>
                <table style={{ ...TABLE, minWidth: 560 }}>
                  <thead><tr style={THEAD}><th style={TH}>Family</th><th style={TH}>Status</th><th style={TH}>Public package</th><th style={TH}>Use</th></tr></thead>
                  <tbody>
                    {([
                      ['JavaScript / TypeScript', 'Published', '@banzami/sdk', 'Server — secret key'],
                      ['Dart / Flutter (client)', 'Published', 'banzami_client', 'Client — publishable key, read-only'],
                      ['Python', 'Not published', '—', 'Source code'],
                      ['PHP', 'Not published', '—', 'Source code'],
                    ] as [string, string, string, string][]).map((r) => (
                      <tr key={r[0]}><td style={TD_HEAD}>{r[0]}</td><td style={TD}>{r[1]}</td><td style={TD_MONO}>{r[2]}</td><td style={TD}>{r[3]}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <P>
                Machine-readable contracts:{' '}
                <a href="/developers/artifacts/sdk-contract.json" style={a}>sdk-contract.json</a> ·{' '}
                <a href="/developers/artifacts/sdk-first-manifest.json" style={a}>sdk-first-manifest.json</a>.
              </P>

              <H2 id="before-you-integrate">Reference implementation</H2>
              <P>
                <strong>DOA</strong> uses <Code>@banzami/sdk</Code> to create accounts and sessions, resolve <Code>@banza</Code>, verify webhooks and request settlements, with no direct HTTP calls.{' '}
                <a href="/docs/en/doa" style={a}>Build like DOA</a>
              </P>

              <NextStepCards lang="en" items={[
                { href: '/docs/en/get-started', title: 'Quickstart', desc: 'Install the SDK and create your first payment.' },
                { href: '/docs/en/reference', title: 'API reference', desc: 'Every endpoint, with its SDK method.' },
                { href: '/docs/en/support', title: 'Support', desc: 'Report a problem with the SDK.' },
              ]} />
              </Section>
    </>
  );
}

export function EnArtifacts({ copy }: { copy: CopyFn }) {
  const a = { color: LINK, fontWeight: 600, textDecoration: 'none' } as const;
  return (
    <>
<Section id="artifacts-page">
              <h1 style={H1_STYLE}>Artifacts</h1>
              <PageLede>The same API in formats for tooling: OpenAPI, Postman, examples and manifests. They describe the Sandbox.</PageLede>
<H2 id="artifacts">Available files</H2>
              <div style={{ overflowX: 'auto', maxWidth: '100%', margin: '0 0 14px' }}>
                <table style={TABLE}>
                  <thead><tr style={THEAD}><th style={TH}>Artifact</th><th style={TH}>Use it to</th></tr></thead>
                  <tbody>
                    <tr><td style={TD}><a href="/developers/openapi/banzami-sandbox.openapi.json" style={a}>OpenAPI 3</a></td><td style={TD}>Generate clients, validate requests, import into tools. Public endpoints only.</td></tr>
                    <tr><td style={TD}><a href="/developers/postman/banzami-sandbox.postman_collection.json" style={a}>Postman collection</a></td><td style={TD}>Explore the API by hand.</td></tr>
                    <tr><td style={TD}><a href="/developers/examples/curl/get-me.sh" style={a}>get-me.sh</a> · <a href="/developers/examples/curl/create-payment-session.sh" style={a}>create-payment-session.sh</a></td><td style={TD}>Diagnose with curl.</td></tr>
                    <tr><td style={TD}><a href="/developers/availability/banzami-developers-availability.json" style={a}>Availability matrix</a></td><td style={TD}>Each capability’s status, as JSON.</td></tr>
                    <tr><td style={TD}><a href="/developers/artifacts/manifest.json" style={a}>manifest.json</a> · <a href="/developers/artifacts/sdk-first-manifest.json" style={a}>sdk-first-manifest.json</a></td><td style={TD}>Index of the artifacts and published SDKs.</td></tr>
                    <tr><td style={TD}><a href="/llms.txt" style={a}>llms.txt</a></td><td style={TD}>A plain-text index of the documentation, for tools and assistants.</td></tr>
                  </tbody>
                </table>
              </div>
              <P style={{ fontSize: 13, color: MUT }}>The artifacts do not describe Financial Live, which is not available.</P>
              <NextStepCards lang="en" items={[
                { href: '/docs/en/reference', title: 'API reference', desc: 'The same surface, explained.' },
                { href: '/docs/en/changelog', title: 'Changelog', desc: 'What changed, and when.' },
              ]} />
</Section>
    </>
  );
}

const RECIPES_NOTE = 'The examples use a test key from your project. Nothing done in the Sandbox moves real money.';

const SAMPLE_CURL_TEST_PAYER_PAY = `curl -X POST https://sandbox-api.banzami.com/v1/sandbox/test-payers/tp_example/payments \\
  -H "Authorization: Bearer bz_test_sk_XXXXXXXXXXXXXXXX" \\
  -H "Idempotency-Key: payment_001" \\
  -H "Content-Type: application/json" \\
  -d '{"payment_session_id":"payment_session_example","via":"QR"}'

# 200
# { "test_payer_id": "tp_example", "via": "QR", "status": "PAID",
#   "transfer_id": "transfer_example", "proof_reference": "BZM-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX",
#   "simulated": false, … }`;

export function EnTesting({ copy }: { copy: CopyFn }) {
  const a = { color: LINK, fontWeight: 600, textDecoration: 'none' } as const;
  return (
    <>
<Section id="testing">
              <h1 style={H1_STYLE}>Sandbox testing</h1>
              <PageLede>The Sandbox is self-service: you set it up, get test payers and reset it without asking Banzami for anything. For each scenario: how to trigger it, the expected response, the event, where to check in the Console, and how to clean up.</PageLede>
              <Callout>The Sandbox has no special amounts, cards or references that force an outcome. Every scenario uses the API’s real behaviour; only an external network’s outcomes are simulated, and only when the request says so with <Code>simulate</Code>.</Callout>
              <P style={{ fontSize: 13, color: MUT }}>{RECIPES_NOTE}</P>

              <H2 id="sandbox-self-service">What the Sandbox gives you</H2>
              <div style={{ overflowX: 'auto', maxWidth: '100%', margin: '0 0 14px' }}>
                <table style={TABLE}>
                  <thead><tr style={THEAD}><th style={TH}>Capability</th><th style={TH}>Where</th><th style={TH}>Limits</th></tr></thead>
                  <tbody>
                    {[
                      ['A test Business for the project', 'Console → Financial Setup: choose the use case', 'One per project. Not verified, and it does not exist outside the Sandbox.'],
                      ['Test payers with fictitious value', 'Console → Test data, or /v1/sandbox/test-payers', 'Up to 10 active per project; up to 10,000 Kz to start; top-ups up to 25,000 Kz, a 50,000 Kz balance, 20 top-ups and 100,000 Kz a day.'],
                      ['External-network outcomes', 'simulate on a test payer’s payment', 'DECLINED, PROVIDER_UNAVAILABLE and TIMEOUT. The response carries simulated: true.'],
                      ['API Explorer', 'Console → API Explorer', 'Requests with a 60-second key, Sandbox only; 30 a minute per project.'],
                      ['Test webhook event', 'Console → Webhooks, or POST /v1/webhooks/endpoints/{id}/test', 'webhook.test, marked synthetic; moves nothing.'],
                      ['Reset the test data', 'Console → Test data → Reset the Sandbox', 'Up to 5 times a day. Nothing is deleted.'],
                    ].map((r) => (
                      <tr key={r[0]}>{r.map((c, i) => <td key={i} style={i === 0 ? TD_HEAD : TD}>{c}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <P>The full, machine-readable list is at <Code>GET /v1/sandbox/scenarios</Code> (scope <Code>sandbox:read</Code>): each scenario has an id, how to trigger it and the outcome. The ids appear on each recipe below.</P>

              <H2 id="test-payers">Test payers</H2>
              <P>
                A test payer is a Sandbox customer of your project, with a wallet and a fictitious balance. It pays your sessions and links through the same path a real customer uses — the session becomes <Code>PAID</Code>, the event is emitted and the receipt is issued.
                A payer of project A does not exist for project B, and pays only its own project’s sessions and links.
              </P>
              <P>
                In the Console, open <strong>Test data</strong>: create a payer, top it up and pay a session by its <Code>session_id</Code>. Through the API, with a key holding <Code>sandbox:write</Code>:
                <Code>POST /v1/sandbox/test-payers</Code>, <Code>POST /v1/sandbox/test-payers/{'{id}'}/fund</Code> (with an <Code>Idempotency-Key</Code>) and <Code>POST /v1/sandbox/test-payers/{'{id}'}/payments</Code>.
                The payer’s PIN comes only in the creation response, for signing in as that payer on the payment page. <a href="/docs/en/reference#resource-sandbox" style={a}>Test data reference</a>
              </P>
              <CodeBlock label="curl · pay a session as a test payer" raw={SAMPLE_CURL_TEST_PAYER_PAY} onCopy={copy} />

              <H2 id="recipe-basics">Keys and readiness</H2>
              <RecipeCard lang="en" r={{ id: 'first-call', title: 'The key works',
                trigger: <><Code>GET /v1/me</Code> with the key.</>,
                api: <><Code>200</Code> with <Code>environment: &quot;SANDBOX&quot;</Code> and the scopes.</>,
                event: 'None.', console: 'Logs: the request, with its request_id.', cleanup: 'None.' }} />
              <RecipeCard lang="en" r={{ id: 'invalid-key', title: 'Invalid or revoked key', scenario: 'INVALID_KEY',
                trigger: 'Revoke a test key in the Console and use it.',
                api: <><Code>401 UNAUTHORIZED</Code>.</>,
                event: 'None.', console: 'API keys: the key shown as revoked.', cleanup: 'None; the revoked key stays in the history.' }} />
              <RecipeCard lang="en" r={{ id: 'missing-scope', title: 'Missing scope', scenario: 'MISSING_SCOPE',
                trigger: <>Create a key with only <Code>identity:read</Code> and try to create a session.</>,
                api: <><Code>403 INSUFFICIENT_SCOPE</Code>.</>,
                event: 'None.', console: 'Logs: the refused request.', cleanup: 'Revoke the test key.' }} />
              <RecipeCard lang="en" r={{ id: 'no-setup', title: 'Project without Financial Setup', scenario: 'FINANCIAL_SETUP_NOT_READY',
                trigger: 'In a new project, create a payment session before setting up the Sandbox.',
                api: <><Code>403 PAYMENTS_UNAVAILABLE</Code>; <Code>getFinancialSetup()</Code> returns <Code>UNCONFIGURED</Code>.</>,
                event: 'None.', console: 'Financial Setup: not configured.', cleanup: 'Set up the Sandbox, or delete the project if it has no other history.' }} />
              <RecipeCard lang="en" r={{ id: 'live-refused', title: 'A Live key in the Sandbox', scenario: 'LIVE_FAIL_CLOSED',
                trigger: <>Call <Code>GET /v1/me</Code> with a key starting <Code>bz_live_</Code>.</>,
                api: <><Code>401 UNAUTHORIZED</Code>. Live is not available and no Live key is issued.</>,
                event: 'None.', console: 'Nothing: the request is refused before it reaches the project.', cleanup: 'None.' }} />

              <H2 id="recipe-payments">Payments</H2>
              <RecipeCard lang="en" r={{ id: 'create-session-test', title: 'Create a session',
                trigger: <><Code>createPaymentSession</Code> with <Code>amountMinor: 25000</Code> (250 Kz).</>,
                api: <><Code>201</Code>, <Code>status: &quot;ACTIVE&quot;</Code>, <Code>PAYMENT_LINK</Code> and <Code>DYNAMIC_QR</Code> interfaces, and <Code>realtime.token</Code>.</>,
                event: <><Code>payment_session.created</Code>.</>,
                console: 'Webhooks → Events: the event.',
                cleanup: 'Not needed: an unpaid session has no financial effect.' }} />
              <RecipeCard lang="en" r={{ id: 'pay-session', title: 'Pay a session', scenario: 'PAYMENT_SUCCESS',
                trigger: <>Create a test payer and pay the session with <Code>POST /v1/sandbox/test-payers/{'{id}'}/payments</Code>, <Code>payment_session_id</Code> and <Code>via</Code> <Code>LINK</Code> or <Code>QR</Code> — or, in the Console, under Test data.</>,
                api: <><Code>200</Code> with <Code>transfer_id</Code> and <Code>proof_reference</Code>; <Code>getPaymentSession</Code> returns <Code>status: &quot;PAID&quot;</Code> and <Code>refund_source</Code>.</>,
                event: <><Code>payment_session.paid</Code> and <Code>payment_link.paid</Code>.</>,
                console: 'Transactions: the payment; Balances: the account holding the amount.',
                cleanup: 'Refund the payment, or reset the Sandbox.' }} />
              <RecipeCard lang="en" r={{ id: 'insufficient-funds', title: 'Insufficient funds', scenario: 'INSUFFICIENT_FUNDS',
                trigger: <>Create the payer with <Code>initial_balance_minor: 0</Code> and pay a session.</>,
                api: <><Code>422 INSUFFICIENT_FUNDS</Code>; the session stays <Code>ACTIVE</Code>.</>,
                event: 'None.', console: 'Logs: the refused request.', cleanup: 'Top the payer up, or retire it.' }} />
              <RecipeCard lang="en" r={{ id: 'simulated-decline', title: 'External network decline', scenario: 'PAYMENT_DECLINED',
                trigger: <>Pay as a test payer with <Code>simulate: &quot;DECLINED&quot;</Code>.</>,
                api: <><Code>402 PAYMENT_DECLINED</Code> with <Code>simulated: true</Code>. Nothing moves.</>,
                event: 'None.', console: 'Logs: the request, with the 402 response.', cleanup: 'None.' }} />
              <RecipeCard lang="en" r={{ id: 'provider-unavailable', title: 'Provider unavailable', scenario: 'PROVIDER_UNAVAILABLE',
                trigger: <>Pay as a test payer with <Code>simulate: &quot;PROVIDER_UNAVAILABLE&quot;</Code>.</>,
                api: <><Code>503 PROVIDER_UNAVAILABLE</Code> with <Code>Retry-After</Code> and <Code>simulated: true</Code>. Nothing moves.</>,
                event: 'None.', console: 'Logs: the request, with the 503 response.', cleanup: 'None.' }} />
              <RecipeCard lang="en" r={{ id: 'no-answer', title: 'No answer in time', scenario: 'AMBIGUOUS_TIMEOUT',
                trigger: <>Pay as a test payer with <Code>simulate: &quot;TIMEOUT&quot;</Code> and an <Code>Idempotency-Key</Code>; then repeat the request with the same key.</>,
                api: <>First <Code>504 SANDBOX_SIMULATED_TIMEOUT</Code> — but the payment was made. The repeat answers <Code>200</Code> with the real result and does not pay again.</>,
                event: <><Code>payment_session.paid</Code>, once.</>,
                console: 'Transactions: a single payment.', cleanup: 'Refund the payment, or reset the Sandbox.',
                limits: 'This is the case to handle in production: a timeout does not say whether the payment happened. Retry with the same key; never create a new payment.' }} />
              <RecipeCard lang="en" r={{ id: 'test-idempotency', title: 'Retry a request safely', scenario: 'IDEMPOTENT_REPLAY IDEMPOTENCY_PAYLOAD_CONFLICT CONCURRENT_DUPLICATE',
                trigger: <>Send the same POST twice with the same <Code>Idempotency-Key</Code>; then the same key with a different body.</>,
                api: <>The second response matches the first. With a different body: <Code>409 IDEMPOTENCY_KEY_REUSED</Code>. Two concurrent requests: <Code>409 IDEMPOTENCY_CONFLICT</Code>.</>,
                event: 'A single event, for the first request.',
                console: 'Logs: the requests sharing the key.',
                cleanup: 'None.' }} />
              <RecipeCard lang="en" r={{ id: 'invalid-amount', title: 'Invalid amount', scenario: 'INVALID_PARAMETER',
                trigger: <><Code>amount_minor: 0</Code>. (Omitting the amount is not an error: it creates an open-amount session.)</>,
                api: <><Code>400 BAD_REQUEST</Code>.</>,
                event: 'None.', console: 'Logs: the refused request.', cleanup: 'None.' }} />
              <RecipeCard lang="en" r={{ id: 'invalid-cursor', title: 'Invalid pagination cursor', scenario: 'INVALID_CURSOR',
                trigger: <><Code>GET /v1/payment-links?cursor=abc</Code>, or <Code>limit=500</Code>. A valid cursor is the previous page’s <Code>next_cursor</Code>, unchanged.</>,
                api: <><Code>400 INVALID_PARAM</Code>, with a message naming the parameter.</>,
                event: 'None.', console: 'Logs: the refused request.', cleanup: 'None.' }} />
              <RecipeCard lang="en" r={{ id: 'realtime-status', title: 'Realtime status', scenario: 'REALTIME_STATUS',
                trigger: <>Open the status stream with the session’s <Code>realtime.token</Code> and pay it with a test payer.</>,
                api: <>A <Code>snapshot</Code> with <Code>ACTIVE</Code>, then a <Code>status</Code> with <Code>PAID</Code>, and the stream closes.</>,
                event: <><Code>payment_session.paid</Code>, at your webhook — the confirmation to fulfil the order on.</>,
                console: 'API Explorer: read the session and choose “Watch the realtime status”.', cleanup: 'None.',
                limits: <>The token lasts up to 30 minutes; read the session again for another. <a href="/docs/en/payments#realtime" style={a}>Realtime status</a></> }} />

              <H2 id="test-webhooks">Webhooks</H2>
              <RecipeCard lang="en" r={{ id: 'webhook-test-event', title: 'Test event', scenario: 'WEBHOOK_SUCCESS',
                trigger: <>In the Console, under Webhooks, choose <strong>Send test event</strong> — or <Code>POST /v1/webhooks/endpoints/{'{id}'}/test</Code>.</>,
                api: <><Code>202</Code> with <Code>type: &quot;webhook.test&quot;</Code> and <Code>synthetic: true</Code>.</>,
                event: <><Code>webhook.test</Code>, signed like the others, to this endpoint only. It describes no payment.</>,
                console: 'Webhooks → Events: the event, marked as a test, with its delivery.',
                cleanup: 'None. The delivery can be replayed even after it succeeds.' }} />
              <RecipeCard lang="en" r={{ id: 'webhook-delivery', title: 'Receive a delivery',
                trigger: <>Register a public HTTPS endpoint for <Code>payment_session.created</Code> and create a session. No payer needed.</>,
                api: <><Code>createWebhookEndpoint</Code> returns <Code>201</Code> with <Code>secret</Code>.</>,
                event: <><Code>payment_session.created</Code>, signed, at your endpoint.</>,
                console: 'Webhooks: the delivery with its 2xx response.',
                cleanup: <><Code>deactivateWebhookEndpoint</Code>.</> }} />
              <RecipeCard lang="en" r={{ id: 'webhook-failure', title: 'Failure and replay', scenario: 'WEBHOOK_RETRY WEBHOOK_REPLAY',
                trigger: <>Make the endpoint return <Code>500</Code> and create a session. Fix the endpoint and replay.</>,
                api: <><Code>listWebhookDeliveries</Code> shows the attempts; <Code>replayWebhookDelivery</Code> puts the delivery back in <Code>PENDING</Code>. Replaying a successful delivery returns <Code>409 DELIVERY_ALREADY_SUCCEEDED</Code>, except a test event’s.</>,
                event: 'The same event, with the same id, again.',
                console: 'Webhooks: each attempt, with the status code returned.',
                cleanup: <><Code>deactivateWebhookEndpoint</Code>.</>,
                limits: 'Automatic retries follow the real schedule: the second attempt comes a minute after the first failure.' }} />
              <RecipeCard lang="en" r={{ id: 'webhook-signature', title: 'Invalid signature', scenario: 'WEBHOOK_SIGNATURE_INVALID',
                trigger: <>POST to your own endpoint with a made-up <Code>banza-signature</Code>.</>,
                api: <><Code>constructEvent</Code> throws; the endpoint responds <Code>400</Code> with no side effects.</>,
                event: 'None — the request did not come from Banzami.', console: 'Nothing: the test is local.', cleanup: 'None.' }} />
              <RecipeCard lang="en" r={{ id: 'webhook-disabled', title: 'Disabled endpoint',
                trigger: 'Disable the endpoint and create a session.',
                api: <>The event appears in <Code>listWebhookEvents</Code>, with no delivery to that endpoint. A test event returns <Code>409 ENDPOINT_DISABLED</Code>.</>,
                event: 'Not delivered, even after re-enabling.',
                console: 'Webhooks → Events: the event with no delivery.',
                cleanup: 'Re-enable the endpoint in the Console if you want to keep it.' }} />

              <H2 id="test-refunds">Refunds, transfers and settlements</H2>
              <RecipeCard lang="en" r={{ id: 'partial-refund', title: 'Full, partial and excessive refund', scenario: 'REFUND_FULL REFUND_PARTIAL REFUND_CUMULATIVE_LIMIT',
                trigger: <>After <a href="#pay-session" style={a}>paying a session</a>, refund part of it, then the rest, then once more.</>,
                api: <><Code>201</Code> with <Code>SUCCEEDED</Code> twice; the third returns <Code>422 REFUND_EXCEEDS_CAPTURED</Code>.</>,
                event: <><Code>refund.completed</Code> for each refund made.</>,
                console: 'Transactions → Refunds.', cleanup: 'None: the payment ends fully refunded.' }} />
              <RecipeCard lang="en" r={{ id: 'refund-not-eligible', title: 'Refunding something that is not yours', scenario: 'REFUND_NOT_ELIGIBLE',
                trigger: <>Refund with another project’s <Code>refund_source</Code>, or an unpaid session’s.</>,
                api: <><Code>404 NOT_FOUND</Code> or <Code>422</Code>; nothing moves.</>,
                event: 'None.', console: 'Logs: the refused request.', cleanup: 'None.' }} />
              <RecipeCard lang="en" r={{ id: 'transfer-no-funds', title: 'Transfer without funds',
                trigger: <>Create two accounts and transfer from the empty one.</>,
                api: <><Code>422 INSUFFICIENT_FUNDS</Code>; nothing moves.</>,
                event: 'None.', console: 'Balances: both accounts at zero.', cleanup: 'None.' }} />
              <RecipeCard lang="en" r={{ id: 'settlement-test', title: 'Settlement', scenario: 'SETTLEMENT_SUCCESS SETTLEMENT_REPLAY',
                trigger: <>In a project set up for <strong>Application or platform</strong>, settle an account with no balance; then an account holding a test payment; then repeat with the same <Code>idempotency_key</Code>.</>,
                api: <>No balance: <Code>422 NOTHING_TO_SETTLE</Code>. With a balance: <Code>201</Code> with gross, fee and net. The repeat returns the same settlement.</>,
                event: <><Code>application_settlement.completed</Code>, once.</>,
                console: 'Balances: the account at zero; Financial Setup: readiness.',
                cleanup: 'None.',
                limits: <>The <Code>application_settlement.cancelled</Code> and <Code>.failed</Code> events result from Banzami’s decisions and cannot be triggered for testing.</> }} />

              <H2 id="test-other">Receipts and limits</H2>
              <RecipeCard lang="en" r={{ id: 'receipt-test', title: 'Verify a receipt', scenario: 'RECEIPT_VALID RECEIPT_NOT_FOUND',
                trigger: <>Verify the <Code>BZM-…</Code> reference of a test payment; then the same reference with one character changed.</>,
                api: <><Code>200</Code> with <Code>CONFIRMED</Code>; changed: <Code>404</Code>.</>,
                event: 'None.', console: 'Transactions: the matching payment.', cleanup: 'None.',
                limits: <>A <Code>503</Code> response cannot be triggered.</> }} />
              <RecipeCard lang="en" r={{ id: 'rate-limit', title: 'Rate limit', scenario: 'RATE_LIMIT',
                trigger: <>Test your handling of <Code>429</Code> and <Code>Retry-After</Code> with a mocked response in your own code.</>,
                api: <><Code>429 RATE_LIMITED</Code> with <Code>Retry-After</Code>.</>,
                event: 'None.', console: 'Logs.', cleanup: 'None.',
                limits: 'Do not hit the limit against the Sandbox on purpose: it is shared with other integrations.' }} />

              <H2 id="explorer">API Explorer</H2>
              <P>
                In the Console, <strong>API Explorer</strong> runs the published v1 API operations against the Sandbox, with the active project. No key passes through the browser: for each request, Banzami creates a key on the server that is valid for 60 seconds and holds only that operation’s scope, makes the request and revokes it.
                The response shows the status, the <Code>request_id</Code>, the latency and the body; a signing secret is hidden. The requests appear in <strong>Logs</strong> with the source <strong>API Explorer</strong>.
              </P>
              <P>Write operations carry an <Code>Idempotency-Key</Code> that the Console generates and shows: repeating with the same key returns the original response. When you read a session, you can open its realtime status and pay it under Test data to watch it change.</P>

              <H2 id="reset">Reset the Sandbox</H2>
              <P>
                Under <strong>Test data → Reset the Sandbox</strong> (Owner or Admin, typing <Code>RESET</Code>): the project’s test payers are retired and, in the project’s own test Business, open sessions and links are cancelled, the fictitious balance is retired and the extra accounts are closed.
                Nothing is deleted: payments, refunds, receipts, events, logs and the ledger stay. Keys, webhooks and Financial Setup remain. A project connected to another project’s Business resets only its own payers. Up to 5 times a day.
              </P>

              <NextStepCards lang="en" items={[
                { href: '/docs/en/going-live', title: 'Prepare for Live', desc: 'The readiness checklist for your integration.' },
                { href: '/docs/en/troubleshooting', title: 'Troubleshooting', desc: 'When a scenario does not give the expected result.' },
              ]} />
            </Section>
    </>
  );
}

export function EnGoingLive({ copy }: { copy: CopyFn }) {
  const a = { color: LINK, fontWeight: 600, textDecoration: 'none' } as const;
  return (
    <>
<Section id="going-live">
              <h1 style={H1_STYLE}>From Sandbox toward Live</h1>
              <PageLede>Financial Live is not available. What your Sandbox work already establishes, and what to check before your integration goes into use.</PageLede>

              <H2 id="live-status">Current status</H2>
              <P>
                One developer platform, two financial environments. The <strong>Sandbox</strong> is available and self-service: fictitious value, <Code>bz_test_</Code> keys, no approval by Banzami.
                <strong> Live</strong> is the same platform and the same contracts, with real value, and requires institutional approval: it is not ready and refuses everything (fail-closed). A Sandbox key does not open Live, and no Live key can be created in the Sandbox.
              </P>
              <UL>
                <LI>No real-money rails are active, and no <Code>bz_live_</Code> keys are issued.</LI>
                <LI>There is no Live application process and no waiting list.</LI>
                <LI>There is no automatic migration from the Sandbox to Live.</LI>
              </UL>

              <H2 id="what-carries">What your Sandbox work already establishes</H2>
              <P>Your integration, webhook handling, idempotency, error handling and reconciliation follow the API v1 contracts, which are the contracts documented here.</P>

              <H2 id="checklist">Checklist</H2>
              <UL>
                <LI><strong>Identity:</strong> <Code>GET /v1/me</Code> succeeds with the key your application uses.</LI>
                <LI><strong>Readiness:</strong> your application calls <Code>getFinancialSetup()</Code> and knows what to show when the project cannot receive payments.</LI>
                <LI><strong>Payments:</strong> creation, showing the link or QR code, and server-side confirmation are tested.</LI>
                <LI><strong>Idempotency:</strong> a retry with the same key is tested; concurrent requests are understood.</LI>
                <LI><strong>Errors:</strong> a <Code>400</Code> and a <Code>401</Code> are tested, with the <Code>request_id</Code> in your logs.</LI>
                <LI><strong>Webhooks:</strong> the signature is verified before parsing, duplicates are ignored, failure and replay are tested.</LI>
                <LI><strong>Secrets:</strong> the key and webhook secret live only on the server, and rotation is tested.</LI>
                <LI><strong>Reconciliation:</strong> your records match Transactions and Balances in the Console.</LI>
              </UL>

              <H2 id="follow">Follow changes</H2>
              <P>Changes to the API contract and the Sandbox are published in the <a href="/docs/en/changelog" style={a}>changelog</a>, with their impact and the action required.</P>

              <NextStepCards lang="en" items={[
                { href: '/docs/en/testing', title: 'Sandbox testing', desc: 'A test scenario for each checklist item.' },
                { href: '/docs/en/trust', title: 'Security', desc: 'Keys and secrets in your production setup.' },
              ]} />
            </Section>
    </>
  );
}

export function EnTrust({ copy }: { copy: CopyFn }) {
  const a = { color: LINK, fontWeight: 600, textDecoration: 'none' } as const;
  return (
    <>
<Section id="trust-page">
              <h1 style={H1_STYLE}>Security</h1>
              <PageLede>Where to store keys and secrets, how to limit permissions, and how to rotate credentials.</PageLede>

              <H2 id="keys">Store the secret key</H2>
              <P>A <Code>bz_test_sk_…</Code> key authorises everything the project can do, including refunds and settlements. Keep it in a server environment variable supplied by your platform’s secret manager.</P>
              <DoDont lang="en"
                dos={[
                  'Keep the key in a server environment variable.',
                  'Create one key per system, with the minimum scopes.',
                  'Rotate the key when someone with access leaves the team.',
                  'Log the request_id, never the key.',
                ]}
                donts={[
                  <>Put the key in browser code, <Code>localStorage</Code> or a <Code>NEXT_PUBLIC_*</Code> variable.</>,
                  'Ship it inside a mobile app.',
                  'Commit it to a repository or a versioned .env file.',
                  'Send it by email, chat, ticket or screenshot.',
                ]} />

              <H2 id="reveal-once">Revealed once</H2>
              <P>The full key appears once, in the creation dialog. Afterwards the Console shows only the prefix and a mask. If you lose the key, revoke it and create another.</P>

              <H2 id="least-privilege">Limit scopes</H2>
              <P>Scopes are set at creation and never change. A read-only key can never write, even if the code using it has a bug.</P>
              <UL>
                <LI>One key per integrating system.</LI>
                <LI>No <Code>:write</Code> when the system only reads.</LI>
                <LI>A compromised key can be revoked without affecting other systems.</LI>
              </UL>

              <H2 id="rotation">Rotate and revoke keys</H2>
              <PathDiagram title="Rotating a key without downtime" desc="Create a new key with the same scopes, deploy it on the server, confirm with GET /v1/me, and only then revoke the previous key." steps={['Create new key', 'Deploy it', 'Confirm /v1/me', 'Revoke the old key']} highlight={3} />
              <UL>
                <LI><strong>Rotate in the Console</strong> creates the successor and revokes the previous key in one step; to avoid failures, follow the sequence above.</LI>
                <LI><strong>Revoke</strong> is immediate: the key starts returning <Code>401</Code>.</LI>
                <LI><strong>Suspected exposure:</strong> revoke immediately, then investigate.</LI>
              </UL>

              <H2 id="webhook-secret">The webhook secret</H2>
              <div style={{ overflowX: 'auto', maxWidth: '100%', margin: '0 0 14px' }}>
                <table style={TABLE}>
                  <thead><tr style={THEAD}><th style={TH}></th><th style={TH}>Secret key</th><th style={TH}>Webhook secret</th></tr></thead>
                  <tbody>
                    {[
                      ['Purpose', 'Authenticate your application to the API', 'Verify that a delivery comes from Banzami'],
                      ['Used in', 'Your application’s requests to Banzami', 'Your application’s webhook endpoint'],
                      ['Revealed', 'Once, at creation', 'Once, at registration and on each rotation'],
                      ['Rotation', 'New key, then revoke the old one', 'rotateWebhookEndpointSecret; immediate switch'],
                    ].map((r) => (
                      <tr key={r[0]}>{r.map((c, i) => <td key={i} style={i === 0 ? TD_HEAD : TD}>{c}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <P>Verify the signature over the raw body, before parsing the event, with the SDK’s verifier. <a href="/docs/en/webhooks#recipe" style={a}>Set up webhooks</a></P>

              <H2 id="sandbox-guarantees">What the Sandbox guarantees</H2>
              <UL>
                <LI>Payment, refund, settlement and webhook flows follow the same rules as in production, with fictitious money.</LI>
                <LI>Webhook delivery is real, over the public internet.</LI>
                <LI>A project key reaches only the endpoints in the OpenAPI document; routes for other credential types return <Code>401</Code> or <Code>403</Code>.</LI>
                <LI>Treat test data like customer data: do not use real people’s personal details.</LI>
              </UL>

              <H2 id="vulnerabilities">Report a vulnerability</H2>
              <P>Email <MailLink to="security@banzami.com" style={a} />. For anything else, use <a href="/docs/en/support" style={a}>support</a>.</P>

              <NextStepCards lang="en" items={[
                { href: '/docs/en/webhooks', title: 'Set up webhooks', desc: 'Verification and secret rotation.' },
                { href: '/docs/en/support', title: 'Support', desc: 'What to send without exposing secrets.' },
              ]} />
            </Section>
    </>
  );
}

export function EnTroubleshooting({ copy }: { copy: CopyFn }) {
  const a = { color: LINK, fontWeight: 600, textDecoration: 'none' } as const;
  return (
    <>
<Section id="troubleshooting">
              <h1 style={H1_STYLE}>Troubleshooting</h1>
              <PageLede>Start from what you are seeing. Each symptom lists the likely causes, what to check, where to look in the Console, and whether to retry.</PageLede>
              <Troubleshooting lang="en" />
              <NextStepCards lang="en" items={[
                { href: '/docs/en/errors', title: 'Error catalogue', desc: 'Every code, searchable.' },
                { href: '/docs/en/support', title: 'Support', desc: 'When the symptom is not listed here.' },
              ]} />
            </Section>
    </>
  );
}

export function EnSupport({ copy }: { copy: CopyFn }) {
  const a = { color: LINK, fontWeight: 600, textDecoration: 'none' } as const;
  return (
    <>
<Section id="support">
              <h1 style={H1_STYLE}>Support</h1>
              <PageLede>Email <MailLink to="developers@banzami.com" style={a} /> from your account address. A person reads and answers every message; there is no ticket system.</PageLede>

              <H2 id="before">Before you write</H2>
              <UL>
                <LI><a href="/docs/en/troubleshooting" style={a}>Troubleshooting</a>, starting from the symptom.</LI>
                <LI><a href="/docs/en/errors" style={a}>Error catalogue</a>, starting from the code.</LI>
                <LI><strong>Console → Logs</strong>, starting from the <Code>request_id</Code>.</LI>
              </UL>

              <H2 id="include">What to include</H2>
              <UL>
                <LI>The <Code>request_id</Code> from the response.</LI>
                <LI>The date and time, with time zone.</LI>
                <LI>The environment (<Code>SANDBOX</Code>), the Project ID and the operation.</LI>
                <LI>The SDK version, if you used one.</LI>
                <LI>The request body without credentials, if relevant.</LI>
              </UL>

              <H2 id="never">What never to send</H2>
              <Callout tone="warn">Never send API keys, webhook secrets, OTP codes or session tokens, to anyone. Support never needs a secret.</Callout>

              <H2 id="security-support">Vulnerabilities</H2>
              <P>Report vulnerabilities to <MailLink to="security@banzami.com" style={a} />.</P>

              <NextStepCards lang="en" items={[
                { href: '/docs/en/troubleshooting', title: 'Troubleshooting', desc: 'By symptom.' },
                { href: '/docs/en/trust', title: 'Security', desc: 'Keys, secrets and rotation.' },
              ]} />
            </Section>
    </>
  );
}

export function EnChangelog({ copy }: { copy: CopyFn }) {
  const a = { color: LINK, fontWeight: 600, textDecoration: 'none' } as const;
  return (
    <>
<Section id="changelog">
              <h1 style={H1_STYLE}>Changelog</h1>
              <PageLede>Changes to the API contract, the SDK, the Sandbox and the documentation, with their impact on your integration and the action required.</PageLede>
              <div style={{ overflowX: 'auto', maxWidth: '100%', margin: '0 0 14px' }}>
                <table style={{ ...TABLE, minWidth: 680 }}>
                  <thead><tr style={THEAD}><th style={TH}>Date</th><th style={TH}>Area</th><th style={TH}>Change</th><th style={TH}>Impact</th><th style={TH}>Action</th></tr></thead>
                  <tbody>
                    {([
                      ['14 Sep 2026', 'Sandbox', 'Self-service Sandbox: a test Business by use case, test payers, explicit simulations, API Explorer, a webhook test event and reset.', 'A new project receives in the Sandbox with no application and no review.', 'None; projects already set up stay as they are.'],
                      ['14 Sep 2026', 'API', 'Realtime status: GET /v1/realtime/payment-sessions/{id}, with each session’s realtime.token in the Authorization header.', 'A page can show the payment the moment it happens.', 'None; the webhook remains the confirmation.'],
                      ['13 Sep 2026', 'Docs', 'Session reference corrected: wallet_account_id is accepted with a project key, to choose one of your own accounts.', 'You can segregate payments by account.', 'None.'],
                      ['13 Sep 2026', 'Docs', 'Refund response corrected: status SUCCEEDED.', 'Code comparing against COMPLETED does not recognise the refund.', 'Compare against SUCCEEDED.'],
                      ['13 Sep 2026', 'SDK', 'createPaymentLink and listPaymentLinks no longer require merchantId (next @banzami/sdk release).', 'In 0.13.0, a project key cannot create links through the SDK.', 'Until the next release, use HTTP for links.'],
                      ['13 Sep 2026', 'Docs', 'Documentation reorganised by task, with an event reference, a searchable error catalogue and test scenarios.', '/docs/guides addresses redirect to the new pages.', 'Update bookmarks, if you have any.'],
                      ['13 Sep 2026', 'API', 'GET /v1/public/proofs/{ref} published in the reference and the OpenAPI document.', 'Public receipt verification is documented.', 'None.'],
                      ['12 Sep 2026', 'SDK', '@banzami/sdk 0.13.0; createApplicationSettlement removed in favour of createBusinessApplicationSettlement.', 'Calls to the removed method fail.', 'Migrate to createBusinessApplicationSettlement.'],
                      ['11 Sep 2026', 'API', 'POST /v1/payment-links/{id}/mark-used retired: returns 410 ROUTE_RETIRED.', 'A link is marked paid only by a payment.', 'Use DELETE /v1/payment-links/{id} to close a link.'],
                      ['10 Sep 2026', 'Sandbox', 'Financial Setup by reviewed application or consent code; one-click setup removed.', 'New projects must complete Financial Setup to receive payments.', 'Complete Financial Setup.'],
                      ['11 Jul 2026', 'Docs', 'Per-resource reference, testing guide, authentication and webhook envelope.', '—', 'None.'],
                      ['July 2026', 'Sandbox', 'Sandbox Console: email-and-code sign-in, workspaces, projects, test keys, roles and invitations.', '—', 'None.'],
                    ] as [string, string, string, string, string][]).map((r, i) => (
                      <tr key={i}>
                        <td style={{ ...TD_MONO, whiteSpace: 'nowrap' }}>{r[0]}</td>
                        <td style={TD_HEAD}>{r[1]}</td>
                        <td style={{ ...TD, overflowWrap: 'anywhere' }}>{r[2]}</td>
                        <td style={TD}>{r[3]}</td>
                        <td style={TD}>{r[4]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <P style={{ fontSize: 13, color: MUT }}>Breaking changes are marked as such and always state the action required. There are no production releases: Financial Live is not available.</P>
              <NextStepCards lang="en" items={[
                { href: '/docs/en/artifacts', title: 'Artifacts', desc: 'Updated OpenAPI and manifests.' },
                { href: '/docs/en/sdk', title: 'SDKs', desc: 'Published versions.' },
              ]} />
            </Section>
    </>
  );
}

export function EnGlossary({ copy }: { copy: CopyFn }) {
  return (
    <>
<Section id="glossary-page">
<div id="concepts" style={{ scrollMarginTop: 72 }}>
              <h1 style={H1_STYLE}>Glossary</h1>
              <PageLede>The terms used in this documentation, in Banzami’s context.</PageLede>
              <dl style={{ margin: 0, maxWidth: 660, display: 'flex', flexDirection: 'column', gap: 12 }}>
                {CONCEPTS.map((e) => (
                  <div key={e.term}>
                    <dt style={{ margin: 0 }}>
                      {e.code ? (
                        <code style={{ fontFamily: mono, fontSize: 13, background: '#F6F2F2', color: INK, padding: '1px 6px', borderRadius: 6, fontWeight: 600 }}>{e.term}</code>
                      ) : (
                        <span style={{ fontSize: 14, fontWeight: 700, color: INK }}>{e.term}</span>
                      )}
                    </dt>
                    <dd style={{ margin: '4px 0 0', fontSize: 14, lineHeight: 1.6, color: BODY }}>{e.def}</dd>
                  </div>
                ))}
              </dl>
              <NextStepCards lang="en" items={[
                { href: '/docs/en/concepts', title: 'How Banzami works', desc: 'The concepts, in context.' },
              ]} />
            </div>
</Section>
    </>
  );
}
