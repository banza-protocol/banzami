'use client';

// EN documentation content, split by area (P3A information architecture).
// Every block below was MOVED VERBATIM from the previous single EN page —
// same components, same styles, same claim-safety wording. Cross-area anchors
// were remapped to their new routes. See content-map.ts.

import { BADGE_LABELS_EN, Badge, Callout, Code, CodeBlock, H2, H3, INK, LI, MUT, NextSteps, P, PageLede, RED, Section, UL, mono } from './ui';
import { ResourceReference } from './reference';
import type { CopyFn } from './content-pt';

// English concepts (translations of the canonical PT glossary — same 19 terms).
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
];

// -- Code samples (placeholders only, Sandbox-only) ------------------------------
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
  "code": "VALIDATION_ERROR",
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
const EVENTS: string[] = [
  'payment_session.paid',
  'payment_link.paid',
  'application_settlement.completed',
  'application_settlement.cancelled',
  'application_settlement.failed',
];

const SDKS: { name: string; lang: string; state: string }[] = [
  { name: '@banzami/sdk', lang: 'TypeScript / Node', state: 'Published — npm, server SDK, recommended path' },
  { name: 'banzami-python', lang: 'Python', state: 'Complete (source code)' },
  { name: 'banzami/sdk', lang: 'PHP (+ Laravel)', state: 'Complete (source code)' },
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
                  <LI><strong>Production and real-money rails are not available.</strong> Public pay/checkout, live rails and external providers are not available.</LI>
                  <LI>The Console is <strong>operational in Sandbox</strong>: email + OTP sign-in, sessions, workspaces, projects, members and the full API-key lifecycle are exercised end to end against the deployed environment, including cross-tenant isolation. The Overview, Balances, Transactions, Webhooks and Logs derive from the project&rsquo;s own data — no Console page renders illustrative data, and nothing is shown that the platform cannot answer for.</LI>
                </UL>
              </div>

              <H3>Three layers</H3>
              <UL>
                <LI><strong>Banzami Developers Console</strong> — where you sign in with email + OTP, create workspaces, Sandbox projects and <strong>test keys</strong>, and manage members and roles. The Console is not a public API for third parties to call directly. The Overview, Balances, Transactions, Webhooks and Logs show your project&rsquo;s real data: Balances the accounts of the payee the project is bound to, Transactions the payments, refunds and transfers that happened, and Logs every request made with one of the project&rsquo;s keys. There is no customer directory and no status page — neither exists as a product.</LI>
                <LI><strong>Banzami integration layer</strong> — what your application uses for payments: payment links, sessions, QR, confirmation, receipts, signed webhooks and operator-controlled settlement.</LI>
                <LI><strong>Banzami Operator / Core</strong> — the financial layer: it executes payments and owns balances and integrity. Your application never creates or manages its own financial ledger.</LI>
              </UL>

              <P>
                <strong>DOA is the reference integration.</strong> A real application that runs its own business logic
                (campaigns and donations) while delegating everything financial to Banzami. It is currently operational in
                the Sandbox environment and is used to continuously validate the integration model.
              </P>

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
              <P>From first sign-in to a validated payment journey, in the Sandbox:</P>
              <ol style={{ margin: '0 0 16px', padding: '0 0 0 20px', maxWidth: 660, display: 'flex', flexDirection: 'column', gap: 7 }}>
                <LI>Sign in to the Console at <Code>developers.banzami.com/login</Code> with email + code (OTP).</LI>
                <LI>Create or pick a <strong>workspace</strong>.</LI>
                <LI>Create a <strong>Sandbox project</strong>.</LI>
                <LI>Create a <strong>test key</strong>.</LI>
                <LI>Save the <strong>secret</strong> key when it appears — it is shown exactly once.</LI>
                <LI><strong>Verify the key</strong> against the Sandbox API with <Code>curl</Code>: <Code>GET /v1/me</Code> returns the key’s environment, project, scopes and status. This is your first successful call — <strong>no SDK required</strong>.</LI>
                <LI>Install the SDK — <Code>npm install @banzami/sdk</Code> — and create the client with your key and <Code>environment: &apos;sandbox&apos;</Code>. That is the implementation path; the <Code>curl</Code> above only confirmed the key.</LI>
                <LI>Create a <strong>payment session</strong> and present the link/QR.</LI>
                <LI>Track the confirmation and issue the receipt.</LI>
                <LI>Validate signed webhooks where applicable.</LI>
              </ol>
              <CodeBlock label="curl · first call (GET /v1/me)" raw={SAMPLE_CURL_ME} onCopy={copy} {...enCopy} />
              <Callout>
                Every example uses <strong>placeholder keys and identifiers</strong> and is <strong>Sandbox-only</strong> —
                no real money ever moves. Replace the values with your own Sandbox project’s.
              </Callout>
              <CodeBlock label="test keys" raw={SAMPLE_KEYS} onCopy={copy} {...enCopy} />
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
                <LI>Errors: a validation <Code>422</Code> and a <Code>401</Code> tested, with the <Code>request_id</Code> reaching your logs.</LI>
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
              <CodeBlock label="model" onCopy={copy} raw={`Person (email + code)
  └── is a member of ──▶ Workspace        ← who has access to what
                           └── contains ──▶ Project          ← the unit of integration
                                              ├── Financial Setup ──▶ Business   ← who receives the money
                                              │                         └── Wallet ──▶ Accounts
                                              ├── API keys                       ← how your app authenticates
                                              └── Webhook endpoints              ← where events go`} />
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
                      ['Admin', 'Manage members, projects and keys. Cannot remove an owner.'],
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
                <LI><strong>Archiving</strong> a workspace is refused while it still has active projects, and the refusal says how many. Archive those first.</LI>
                <LI><strong>Deleting</strong> is only possible when the workspace is genuinely empty. A workspace with history is archived; one that never held anything disappears.</LI>
              </UL>

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
                <LI><strong>Scopes</strong> are chosen at creation and do not change. A read-only key will never write.</LI>
                <LI>The secret appears <strong>exactly once</strong>, in the creation dialog, with a copy button. After that the list shows the prefix and a mask.</LI>
                <LI><strong>Rotating</strong> creates the successor and revokes the predecessor in the same step — there is no window without a valid credential.</LI>
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
                <LI><strong>Disabling</strong> stops deliveries without deleting the endpoint or its history.</LI>
              </UL>

              <H3 id="logs">Balances, transactions and logs</H3>
              <UL>
                <LI><strong>Balances</strong> shows the accounts of the owner your project is bound to, and what is in each.</LI>
                <LI><strong>Transactions</strong> shows the project&rsquo;s real movement — not a sample, not an example.</LI>
                <LI><strong>Logs</strong> lists the requests your key made to the API, with <Code>request_id</Code>. It is the first place to open when something answered what you did not expect.</LI>
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

              <H3 id="charges">Create a charge <Badge tone="val">Under continuous validation in Sandbox</Badge></H3>
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
                {' '}<strong>same owner</strong> that your project&rsquo;s binding fixes — Campaign A to Campaign B of the
                same organisation, say. Nothing crosses the owner boundary: it is not a payout, not an application
                settlement (ADR-029), not a consumer-to-consumer P2P transfer. Naming an account that is not yours
                answers <Code>404</Code>, indistinguishable from one that does not exist.
              </Callout>
              <P style={{ fontSize: 13, color: '#a89a9e' }}>
                Credential: a project key with the <Code>transfers:write</Code> scope, on{' '}
                <Code>POST /v1/wallet-account-transfers</Code>. The owner comes from the binding — no request field can
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
              </UL>
              <P>
                <strong>Request fields:</strong> <Code>source_type</Code> (<Code>ACQUIRING_PAYMENT</Code> or
                {' '}<Code>WALLET_PAYMENT</Code>), <Code>source_id</Code>, <Code>amount_minor</Code>, <Code>currency</Code>
                {' '}and <Code>idempotency_key</Code>.
              </P>
              <P style={{ fontSize: 13, color: '#a89a9e' }}>
                Technical reference: the payment source is typed per BANZA ADR-017. Credential: a project key with the
                {' '}<Code>refunds:write</Code> scope, on <Code>POST /v1/refunds</Code>. The refund debits the account
                that <strong>received</strong> the payment — not the owner&rsquo;s general balance — and another
                project&rsquo;s payment answers <Code>404</Code>. See the{' '}
                <a href="/docs/en/reference#credentials" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>credential matrix</a>.
                Never real money — <em>Production in preparation</em>.
              </P>
</Section>
<Section id="webhooks">
              <H2>Webhooks <Badge tone="ok">{BADGE_LABELS_EN.ok}</Badge></H2>
              <P>
                Use webhooks to confirm events on your server without relying on the browser or polling alone. Banzami signs
                every event; your endpoint verifies the signature and reacts idempotently.
              </P>
              <Callout>
                <strong>Honest scope.</strong> Outbound delivery is real and verified end to end: Banzami emits{' '}
                <Code>payment_session.paid</Code> because money moved, its outbox delivers over the public internet to the
                registered HTTPS endpoint, and the reference application accepts it. This section used to say delivery to an
                external sink remained simulated — true when written, and no longer. What still does not exist is{' '}
                <strong>Production</strong>: this is the Sandbox, and no real money ever moves.
              </Callout>
              <H3>How it works</H3>
              <UL>
                <LI>Banzami sends a <Code>POST</Code> to your endpoint with the event body as JSON.</LI>
                <LI>The signature travels in the <Code>banza-signature</Code> header, formatted <Code>t=&lt;unix&gt;,v1=&lt;hmac_sha256_hex&gt;</Code>.</LI>
                <LI>The signature is HMAC-SHA256 over <Code>&quot;{'{'}t{'}'}.{'{'}body{'}'}&quot;</Code>, with a <strong>5-minute</strong> replay tolerance.</LI>
                <LI>Process <strong>idempotently</strong> and answer <Code>2xx</Code> fast; delivery is at-least-once, unordered, with redelivery on failure.</LI>
              </UL>
              <CodeBlock label="json · event envelope (implemented in Sandbox)" raw={SAMPLE_WEBHOOK_ENVELOPE} onCopy={copy} {...enCopy} />
              <P style={{ fontSize: 13, color: '#a89a9e' }}>
                The envelope above is the shape implemented in the Sandbox: <Code>id</Code> (dedupe on it), <Code>type</Code>{' '}
                (one of the verified catalogue below), <Code>created_at</Code> and <Code>data</Code> with the event object.
              </P>
              <H3 id="redelivery">Redelivery contract</H3>
              <UL>
                <LI>At-least-once delivery, no ordering guarantee — handle every event <strong>idempotently</strong> (dedupe by event id).</LI>
                <LI>Signature in <Code>banza-signature</Code> with a <strong>5-minute</strong> timestamp (replay) tolerance.</LI>
                <LI>Implemented in the Sandbox: up to <strong>5 attempts</strong> per delivery, with growing backoff of{' '}
                  <Code>1&nbsp;min</Code> → <Code>5&nbsp;min</Code> → <Code>30&nbsp;min</Code> → <Code>2&nbsp;h</Code> → <Code>8&nbsp;h</Code> after each failure.</LI>
                <LI>Any <Code>2xx</Code> from your endpoint counts as delivered; answer fast and process asynchronously.</LI>
                <LI><em>Note:</em> this is the contract implemented and verified in the Sandbox; Production behaviour is not claimed (Production in preparation).</LI>
              </UL>
              <H3>Events</H3>
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
              <P>
                DOA never stores a balance of its own. When it needs to know what a campaign has
                received, it asks Banzami — because the alternative is two numbers that one day
                diverge, and on that day one of them is wrong and nobody knows which.
              </P>

              <H3 id="doa-flow">The whole journey</H3>
              <CodeBlock label="flow" onCopy={copy} raw={`Donor
  │
  ├─▶ DOA: picks a campaign, enters an amount          (DOA business logic)
  │
  ├─▶ Banzami: payment session created                 POST /v1/payment-sessions
  │            link + QR returned                      GET  /v1/payment-sessions/{id}/link · /qr
  │
  ├─▶ Donor pays                                       (Banzami surface)
  │
  ├─▶ Banzami: money moves, financial truth recorded
  │
  ├─▶ webhook  payment_session.paid  ──▶ DOA           (signed, at-least-once)
  │            DOA verifies the signature, processes idempotently,
  │            marks the donation confirmed             (DOA state)
  │
  ├─▶ DOA: campaign closes                             (DOA's decision)
  │
  └─▶ Banzami: settlement                              POST /v1/application-settlements
               gross read from Banzami, fee to DOA,
               net to the beneficiary
               webhook application_settlement.completed ──▶ DOA`} />

              <H3 id="doa-accounts">One account per campaign</H3>
              <P>
                Every DOA campaign has its own segregated account under DOA&rsquo;s wallet. That is
                why a campaign&rsquo;s balance is a question with an answer, rather than a running
                total the application has to maintain.
              </P>
              <CodeBlock label="account per campaign" onCopy={copy} raw={`// When the campaign is activated, DOA opens the account that will receive it.
const account = await banzami.walletAccounts.create({
  purpose:        'CAMPAIGN',
  reference_type: 'CAMPAIGN',
  reference_id:   campaign.id,      // YOUR reference, not ours
  label:          campaign.title,
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

  // 2. Verify BEFORE looking at the contents.
  try {
    banzami.webhooks.verify(raw, req.headers.get('banza-signature'), process.env.BANZAMI_WEBHOOK_SECRET);
  } catch {
    return new Response('invalid signature', { status: 400 });
  }

  const event = JSON.parse(raw);

  // 3. Idempotent on the event id. Delivery is at-least-once:
  //    this same event WILL arrive again, sooner or later.
  if (await db.events.seen(event.id)) return new Response('ok');
  await db.events.record(event.id);

  // 4. Only now the business effect.
  if (event.type === 'payment_session.paid') {
    await confirmDonation(event.data.reference);
  }

  // 5. 2xx quickly. Slow work goes on a queue, not in here.
  return new Response('ok');
}`} />
              <Callout tone="warn">
                Steps 1 and 3 are the ones people forget. Without the raw body the signature fails
                for a reason that looks like a Banzami bug; without deduplication on the event id,
                an ordinary redelivery duplicates the donation.
              </Callout>

              <H3 id="doa-settlement">Settlement, and who decides what</H3>
              <P>
                When a campaign closes, DOA requests settlement of that campaign&rsquo;s account.
                The request carries neither an amount nor a rate — and that is not an omission for
                convenience, it is the design.
              </P>
              <CodeBlock label="settlement" onCopy={copy} raw={`const settlement = await banzami.applicationSettlements.create({
  wallet_account_id: campaign.banzami_wallet_account_id,
  beneficiary:       campaign.payout_banza,   // the @banza receiving it
  owner_ref:         campaign.id,             // your reference, returned on the webhook
});

// What comes back is already the result, computed by Banzami:
// {
//   gross_amount_minor:         10000000,   // read from the account balance, not sent by you
//   application_fee_minor:        200000,   // the pricing assigned to the Business (200 bps)
//   net_amount_minor:            9800000,   // what goes to the beneficiary
//   currency: "AOA", status: "COMPLETED"
// }`} />
              <P>
                And the three parts sum to zero against the movement, which is the property that
                makes this auditable: <Code>-10000000 + 200000 + 9800000 = 0</Code>.
              </P>
              <Callout>
                <strong>A payment is not a settlement.</strong> A confirmed payment puts money in
                the campaign&rsquo;s account. Settlement is a second act, requested by you, that
                takes the money out. DOA requests it after the campaign closes — it does not
                happen on its own.
              </Callout>

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
              <P>
                Your application authenticates by sending the Sandbox <Code>bz_test_</Code> API key directly in the{' '}
                <Code>Authorization: Bearer …</Code> header and calls the integration layer at <Code>sandbox-api.banzami.com</Code>.
                <Code>bz_live_</Code> keys are <strong>rejected fail-closed</strong> — there is no Production key issuance.
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
                      ['Console — sign in, workspaces, projects, members, keys', 'OTP session (email + code)', 'Available in controlled Sandbox'],
                      ['Developer Console (sign-in, workspaces, projects, keys)', '—', 'Operational in Sandbox — verified end to end'],
                      ['Console — Webhooks and Activity pages', 'OTP session (email + code)', 'The project’s own real data'],
                      ['GET /v1/me (key identity)', 'Developer key bz_test_ (identity:read scope)', 'Available in controlled Sandbox'],
                      ['Payment sessions', 'Developer key (payment_sessions scope, project with an ACTIVE binding) or merchant credential', 'Available in controlled Sandbox'],
                      ['Payment links', 'Developer key (payment_links scope, project with an ACTIVE binding) or merchant credential', 'Available in controlled Sandbox'],
                      ['Webhook endpoint registration (POST /v1/webhooks/endpoints)', 'Project key (webhooks:write); reads with webhooks:read', 'Available in Sandbox — the secret is returned exactly once'],
                      ['Outbound webhook delivery', '—', 'Verified in Sandbox — signature confirmed independently and delivery accepted by a public receiver'],
                      ['Refunds (POST /v1/refunds)', 'Project key (refunds:write) or merchant credential', 'Available in Sandbox — the refund debits the account that received the payment'],
                      ['Transfers (POST /v1/wallet-account-transfers)', 'Project key (transfers:write)', 'Available in Sandbox — between accounts of the project’s own owner'],
                      ['Production / live rails / external providers', '—', 'Not available · Not approved'],
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
                requests with the same key get <Code>409 CONFLICT</Code> until the first finishes — wait and retry with the{' '}
                <em>same</em> key.
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
              <H3>Codes by HTTP status (observed in the Sandbox)</H3>
              <div style={{ overflowX: 'auto', maxWidth: '100%', margin: '0 0 14px' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 480, fontSize: 13 }}>
                  <thead>
                    <tr style={{ textAlign: 'left', color: '#a89a9e' }}>
                      <th style={{ padding: '8px 10px', fontWeight: 800, borderBottom: '1px solid #F2E2E0' }}>Status</th>
                      <th style={{ padding: '8px 10px', fontWeight: 800, borderBottom: '1px solid #F2E2E0' }}>Typical codes</th>
                      <th style={{ padding: '8px 10px', fontWeight: 800, borderBottom: '1px solid #F2E2E0' }}>What to do</th>
                    </tr>
                  </thead>
                  <tbody>
                    {([
                      ['400', 'INVALID_BODY · MISSING_FIELD · VALIDATION_ERROR · INVALID_PARAM · INVALID_AMOUNT', 'Fix the request; do not retry unchanged.'],
                      ['401', 'UNAUTHORIZED', 'Missing/invalid/revoked key — check your bz_test_ key.'],
                      ['403', 'FORBIDDEN', 'Insufficient scope or project without an active binding.'],
                      ['404', 'NOT_FOUND', 'Resource missing or outside your scope.'],
                      ['409', 'CONFLICT', 'Idempotency-Key in flight or state conflict — wait and retry with the same key.'],
                      ['429', 'RATE_LIMITED', 'Slow down and retry with backoff.'],
                      ['5xx', 'INTERNAL_ERROR · UPSTREAM_ERROR · UNAVAILABLE', 'Transient — retry with the same Idempotency-Key.'],
                    ] as [string, string, string][]).map(([st, codes, act]) => (
                      <tr key={st}>
                        <td style={{ padding: '9px 10px', borderBottom: '1px solid #F5E9E7', fontFamily: mono, fontWeight: 700, color: INK }}>{st}</td>
                        <td style={{ padding: '9px 10px', borderBottom: '1px solid #F5E9E7', fontFamily: mono, fontSize: 12, color: '#9A1B22' }}>{codes}</td>
                        <td style={{ padding: '9px 10px', borderBottom: '1px solid #F5E9E7', color: '#5a4a4e' }}>{act}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <P style={{ fontSize: 13, color: '#a89a9e' }}>
                This table describes behaviour observed in the <strong>Sandbox</strong>; exact Production behaviour is not
                claimed (Production in preparation).
              </P>
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
                <LI><strong>3. Test idempotency:</strong> repeat the same POST with the same <Code>Idempotency-Key</Code> — you should receive the original response with no duplicated effect; send two concurrently and one gets <Code>409 CONFLICT</Code>.</LI>
                <LI><strong>4. Test errors:</strong> omit <Code>amount_minor</Code> to see <Code>400 MISSING_FIELD</Code>; use an invalid key to see <Code>401</Code>; always keep the <Code>request_id</Code> from the response.</LI>
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
                Rotating a key creates the successor and revokes the predecessor in the same
                step, so there is no window without a valid credential. The predecessor stops
                authenticating immediately: a call with it answers <Code>401</Code>, and the
                failure belongs to the key, not to the request.
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
                <LI><strong>The public surface is the OpenAPI document, and nothing else.</strong> There are no additional public routes waiting to be discovered: what is not in the document is not mounted, and answers <Code>404</Code>.</LI>
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
                <LI><strong>Manifests</strong> — <a href="/developers/artifacts/manifest.json" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>manifest.json</a> · <a href="/developers/artifacts/sdk-first-manifest.json" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>sdk-first-manifest.json</a> (machine-readable SDK-first model; no SDK package published).</LI>
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
                    <span style={{ fontSize: 14, lineHeight: 1.55, color: '#5a4a4e', fontWeight: 500 }}>{what}</span>
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

