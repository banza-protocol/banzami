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
  "project": "my-project",
  "scopes": ["identity:read"],
  "key_status": "ACTIVE"
}`;

const SAMPLE_KEYS = `bz_test_pk_XXXXXXXXXXXXXXXX   # publishable — may live client-side
bz_test_sk_XXXXXXXXXXXXXXXX   # secret — server only, revealed exactly once`;

const SAMPLE_ERROR = `# Canonical error envelope (Sandbox)
{
  "code": "VALIDATION_ERROR",
  "message": "amount_minor must be a positive integer",
  "request_id": "req_XXXXXXXX"
}`;

const SAMPLE_WEBHOOK_ENVELOPE = `# Event envelope delivered to your endpoint (implemented in Sandbox)
{
  "id": "evt_XXXXXXXX",
  "type": "payment_session.paid",
  "created_at": "2026-07-11T11:46:02Z",
  "data": { /* event object */ }
}`;

const SAMPLE_IDEM_RETRY = `# Safe retry: the SAME Idempotency-Key replays the original response
curl -X POST https://sandbox-api.banzami.com/v1/business/payment-sessions \\
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
  { name: '@banzami/sdk', lang: 'TypeScript / Node', state: 'Complete (source code)' },
  { name: 'banzami-python', lang: 'Python', state: 'Complete (source code)' },
  { name: 'banzami/sdk', lang: 'PHP (+ Laravel)', state: 'Complete (source code)' },
  { name: 'banzami_flutter', lang: 'Dart / Flutter', state: 'Complete (used by the mobile app)' },
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
                  <Badge tone="prep">Sandbox / Preview</Badge>
                </div>
                <UL>
                  <LI>This is <strong>Sandbox / Preview</strong> documentation. Sandbox capability is limited to controlled test flows.</LI>
                  <LI><strong>Production and real-money rails are not available.</strong> Public pay/checkout, live rails and external providers are not available.</LI>
                  <LI>The Console’s <strong>visual</strong> pages (dashboard, webhooks, logs) are <strong>demo previews, not operational</strong>, unless explicitly stated otherwise. The tested scope is the API/SDK Sandbox flow plus workspace, project, member and key management.</LI>
                </UL>
              </div>

              <H3>Three layers</H3>
              <UL>
                <LI><strong>Banzami Developers Console</strong> — where you sign in with email + OTP, create workspaces, Sandbox projects and <strong>test keys</strong>, and manage members and roles. The Console is not a public API for third parties to call directly; its other visual pages (dashboard, webhooks, logs) are demo previews with illustrative data — not operational.</LI>
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
                <strong>Recommended path: approved SDK preview.</strong> Until public SDK packages are published, use curl
                only to validate the protocol, diagnose Sandbox behaviour, or audit low-level calls.
              </Callout>
              <P>From first sign-in to a validated payment journey, in the Sandbox:</P>
              <ol style={{ margin: '0 0 16px', padding: '0 0 0 20px', maxWidth: 660, display: 'flex', flexDirection: 'column', gap: 7 }}>
                <LI>Sign in to the Console at <Code>developers.banzami.com/login</Code> with email + code (OTP).</LI>
                <LI>Create or pick a <strong>workspace</strong>.</LI>
                <LI>Create a <strong>Sandbox project</strong>.</LI>
                <LI>Create a <strong>test key</strong>.</LI>
                <LI>Save the <strong>secret</strong> key when it appears — it is shown exactly once.</LI>
                <LI><strong>Verify the key</strong> against the Sandbox API with <Code>curl</Code>: <Code>GET /v1/me</Code> returns the key’s environment, project, scopes and status. This is your first successful call — <strong>no SDK required</strong>.</LI>
                <LI>To implement, use the <strong>approved SDK preview</strong> (recommended path). Until public packages are published, use <Code>curl</Code>/HTTP only to validate the protocol, diagnose Sandbox behaviour, or audit low-level calls.</LI>
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
                Banzami is <strong>SDK-first</strong>, but the SDKs are <strong>not yet published</strong> to npm, PyPI,
                Packagist or pub.dev — so this quickstart demonstrates the protocol with <strong>reference/diagnostic</strong>{' '}
                curl examples until official publication, unless you are working from an approved internal SDK package — see{' '}
                <a href="/docs/en/sdk" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>SDKs</a>.
                Do not run <Code>npm install @banzami/sdk</Code> — that package is not published yet.
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
              <PageLede><strong>SDK-first</strong> model, SDKs in controlled preview (not published), the expected SDK contract, per-family status and intended-ergonomics examples.</PageLede>
              <NextSteps label="Next:" links={[{ href: '/docs/en/guides', text: 'Guides' }, { href: '/docs/en/testing', text: 'Sandbox testing' }, { href: '/docs/en/trust', text: 'Trust and readiness' }]} />
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
                At this stage, SDKs are not yet publicly published to npm, PyPI, Packagist or pub.dev. Therefore, this
                documentation does not provide public package installation commands. SDK access should be treated as
                controlled preview until official publication.
              </P>

              <H3 id="sdk-maturity">SDK maturity matrix</H3>
              <P>
                The SDKs handle authentication, idempotency, retries and webhook signature verification. Today they are
                consumed as <strong>source code</strong> (for example vendored into the application, as DOA does); they are{' '}
                <strong>not yet published</strong> to npm, PyPI, Packagist or pub.dev. Banzami is SDK-first: the curl examples
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

              <H3 id="sdk-preview">SDKs in controlled preview</H3>
              <P>
                Banzami SDKs are the recommended path for future production integrations, but they are not publicly
                published yet. At this stage, SDK access must be treated as controlled preview.
              </P>
              <P>
                This documentation describes the expected SDK contract: authentication, session creation, idempotency,
                response validation, errors, webhooks and availability limits. It does not provide public installation
                commands because the packages are not yet published to npm, PyPI, Packagist or pub.dev.
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
                    {['JavaScript/TypeScript', 'Python', 'PHP', 'Flutter'].map((fam) => (
                      <tr key={fam}>
                        <td style={{ padding: '9px 10px', borderBottom: '1px solid #F5E9E7', fontWeight: 700, color: INK }}>{fam}</td>
                        <td style={{ padding: '9px 10px', borderBottom: '1px solid #F5E9E7', color: '#5a4a4e' }}>controlled preview / not publicly published</td>
                        <td style={{ padding: '9px 10px', borderBottom: '1px solid #F5E9E7', color: '#5a4a4e' }}>none</td>
                        <td style={{ padding: '9px 10px', borderBottom: '1px solid #F5E9E7', color: '#5a4a4e' }}>not available</td>
                        <td style={{ padding: '9px 10px', borderBottom: '1px solid #F5E9E7', color: '#5a4a4e' }}>do not install from public registries yet</td>
                        <td style={{ padding: '9px 10px', borderBottom: '1px solid #F5E9E7', color: '#5a4a4e' }}>use only through approved preview access</td>
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
                <a href="/developers/examples/sdk-preview/typescript-payment-session.example.ts" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>TypeScript</a>
                {' '}·{' '}
                <a href="/developers/examples/sdk-preview/python-payment-session.example.py" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>Python</a>
                {' '}·{' '}
                <a href="/developers/examples/sdk-preview/php-payment-session.example.php" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>PHP</a>.
              </P>
              <Callout>
                The SDK-style examples describe intended ergonomics. They are not installation instructions and do not
                prove public package publication.
              </Callout>

              <H3 id="preview-onboarding">SDK preview onboarding</H3>
              <P>
                The Banzami SDK preview is controlled. It is not a public self-service signup, does not publish packages to
                public registries, and does not activate Production rails.
              </P>
              <P>
                The goal of onboarding is to allow approved partners to validate the SDK-first integration in Sandbox, with
                clear limits, verifiable technical artifacts, structured feedback, and review before any regulatory or
                operational step forward.
              </P>

              <H3 id="sandbox-journey">Sandbox integration journey</H3>
              <div style={{ overflowX: 'auto', maxWidth: '100%', margin: '0 0 14px' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 640, fontSize: 12.5 }}>
                  <thead>
                    <tr style={{ textAlign: 'left', color: '#a89a9e' }}>
                      {['Stage', 'Objective', 'Partner', 'Banzami', 'Output', 'Not included'].map((h) => (
                        <th key={h} style={{ padding: '8px 8px', fontWeight: 800, borderBottom: '1px solid #F2E2E0' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {([
                      ['1. Eligibility', 'Confirm the use case fits the Sandbox/Preview scope.', 'Describe the use case.', 'Assess the fit.', 'Eligibility decision.', 'SDK or credential access.'],
                      ['2. Preview approval', 'Formalise controlled access.', 'Accept the preview limits.', 'Approve and define the scope.', 'Recorded approval.', 'Production approval.'],
                      ['3. Technical preparation', 'Prepare environment and team.', 'Sandbox workspace/project, test key.', 'Up-to-date documentation.', 'First identity call validated.', 'Real or customer data.'],
                      ['4. Controlled SDK access', 'Provide the SDK as controlled preview.', 'Use only the approved channel.', 'Provide controlled access where approved.', 'SDK available to the project.', 'Public package publication.'],
                      ['5. Sandbox integration', 'Implement the SDK-first flow.', 'Sessions, idempotency, errors, webhooks.', 'Maintain the Sandbox and limits.', 'Working Sandbox integration.', 'Real money or public customers.'],
                      ['6. Technical validation', 'Complete the validation checklist.', 'Run and record evidence (request_id).', 'Clear criteria and checklist.', 'Checklist completed.', 'Live rails activation.'],
                      ['7. Feedback and fixes', 'Report issues and fix.', 'Structured reports.', 'Review the feedback.', 'Issues resolved or recorded.', 'SLA commitments.'],
                      ['8. Readiness review', 'Review evidence against the criteria.', 'Submit the evidence.', 'Review and communicate the outcome.', 'Readiness assessment.', 'Production approval or regulatory authorization.'],
                    ] as string[][]).map((row) => (
                      <tr key={row[0]}>
                        {row.map((cell, i) => (
                          <td key={i} style={{ padding: '8px 8px', borderBottom: '1px solid #F5E9E7', color: i === 0 ? INK : '#5a4a4e', fontWeight: i === 0 ? 700 : 500 }}>{cell}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Callout tone="warn">
                Preview approval does not mean Production approval. Sandbox validation does not mean live rails activation.
                SDK preview access does not mean public SDK publication. Technical readiness does not mean regulatory
                authorization.
              </Callout>

              <H3 id="partner-resp">Partner responsibilities during preview</H3>
              <UL>
                <LI>Protect preview credentials and artifacts; never expose secret keys in browsers/mobile apps.</LI>
                <LI>Use only approved Sandbox environments; keep test data non-sensitive.</LI>
                <LI>Report bugs with <Code>request_id</Code> and timestamp.</LI>
                <LI>Do not process real money; do not onboard public customers.</LI>
                <LI>Do not market preview access as live availability; do not claim BNA approval/admission based on preview.</LI>
                <LI>Validate idempotency, error handling and webhook handling; respect availability/capability limits.</LI>
              </UL>

              <H3 id="banzami-resp">Banzami responsibilities during preview</H3>
              <UL>
                <LI>Provide controlled access where approved; maintain the Sandbox/Preview documentation and the protocol reference artifacts.</LI>
                <LI>Document known limitations; keep SDK status honest; update the availability matrices.</LI>
                <LI>Review integration feedback; maintain the claim-safety tests; avoid production/live overclaims.</LI>
                <LI>Provide clear readiness criteria. No SLA promises, no 24/7 support promise, no Production go-live promise.</LI>
              </UL>

              <H3 id="report-preview">How to report preview issues</H3>
              <P>Report through the approved preview support channel provided during onboarding. Every report should include:</P>
              <UL>
                <LI>Environment (<Code>Sandbox/Preview</Code>), SDK family and preview version, if applicable.</LI>
                <LI><Code>request_id</Code>, timestamp, endpoint or SDK method, and the <Code>Idempotency-Key</Code> if relevant.</LI>
                <LI>Expected vs observed result; sanitized request/response excerpt (placeholders only).</LI>
                <LI>Reproduction steps and severity.</LI>
              </UL>

              <H3 id="sandbox-checklist">Sandbox validation checklist</H3>
              <UL>
                <LI>Identity/authentication, payment session creation/retrieval, payment link and QR payload retrieval (where applicable) validated.</LI>
                <LI>Idempotency retry tested; duplicate/concurrent request handling understood.</LI>
                <LI>Validation errors and <Code>unauthorized/forbidden</Code> handling tested; <Code>request_id</Code> captured in logs.</LI>
                <LI>Webhook signature verification design reviewed; outbound limitation understood; refunds/transfers limitation understood.</LI>
                <LI>SDK not used from a public registry; no real money used; no public customers onboarded; no production/live claims made.</LI>
              </UL>

              <H3 id="readiness">Readiness review criteria</H3>
              <UL>
                <LI>Sandbox integration evidence collected; <Code>request_id</Code> logging present.</LI>
                <LI>Idempotency, error-handling and webhook-handling strategies documented; secrets management reviewed with no client-side exposure.</LI>
                <LI>No unsupported capability dependency, no real-money assumption, no production/live claim, no regulatory approval assumption; known limitations accepted.</LI>
              </UL>
              <Callout tone="warn">
                Readiness review is not Production approval. Readiness review is not regulatory authorization. Readiness
                review is not live rails activation.
              </Callout>

              <P>
                Onboarding artifacts:{' '}
                <a href="/developers/onboarding/sdk-preview-onboarding.json" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>onboarding</a>
                {' '}·{' '}
                <a href="/developers/onboarding/sandbox-validation-checklist.json" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>validation checklist</a>
                {' '}·{' '}
                <a href="/developers/onboarding/partner-responsibilities.json" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>partner responsibilities</a>
                {' '}·{' '}
                <a href="/developers/onboarding/preview-issue-report-template.md" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>issue report template</a>
                {' '}·{' '}
                <a href="/developers/onboarding/readiness-review-checklist.json" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>readiness review</a>.
                {' '}These artifacts support Sandbox preview onboarding. They are not Production contracts, do not activate
                live rails, and do not represent regulatory approval.
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
                <LI><strong>Testable in Sandbox:</strong> create sessions/links, present the QR, confirm the payment and issue the receipt.</LI>
                <LI><strong>Reserved for Production:</strong> real-money movement — <em>Production in preparation</em>.</LI>
              </UL>

              <H3 id="transfers">Transfers <Badge tone="ok">Available in Sandbox</Badge></H3>
              <P>
                Move value between Banzami accounts. An authenticated user sends to the recipient&rsquo;s <Code>@banza</Code>, with the
                amount in minor units (AOA) and an idempotency key. In the Sandbox the transfer confirms synchronously,
                reaching <strong>COMPLETED</strong>, with atomic debit and credit in the ledger and an official receipt available.
              </P>
              <P style={{ fontSize: 13, color: '#a89a9e' }}>
                Credential note: the verified path uses an authenticated user. The developer-key scopes (<Code>transfers:*</Code>)
                are <strong>Pending E2E</strong> — see the{' '}
                <a href="/docs/en/reference#credentials" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>credential matrix</a>.
                Never real money — <em>Production in preparation</em>.
              </P>

              <H3 id="refunds">Refunds <Badge tone="val">Under continuous validation in Sandbox</Badge></H3>
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
                Technical reference: the payment source is typed per BANZA ADR-017. Credential note: the verified path uses a
                merchant credential; the developer-key scope (<Code>refunds:write</Code>) is <strong>Pending E2E</strong> — a
                developer-key refund request is rejected (403). See the{' '}
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
              <Callout tone="warn">
                <strong>Honest scope.</strong> In the platform’s public E2E suite (Phase 0), outbound delivery to an external
                public HTTPS sink was <strong>simulated</strong> — emission, HMAC signing and the retry contract were verified;
                the DOA journey is the verified delivery path. <strong>We do not claim webhook delivery as public Production
                availability.</strong>
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
                      ['Console visual pages (dashboard, webhooks, logs)', '—', 'Demo / preview — not operational'],
                      ['GET /v1/me (key identity)', 'Developer key bz_test_ (identity:read scope)', 'Available in controlled Sandbox'],
                      ['Payment sessions', 'Developer key (payment_sessions scope, project with an ACTIVE binding) or merchant credential', 'Available in controlled Sandbox'],
                      ['Payment links', 'Developer key (payment_links scope, project with an ACTIVE binding) or merchant credential', 'Available in controlled Sandbox'],
                      ['Webhook endpoint registration (API)', 'Merchant credential', 'Documented, not public'],
                      ['Outbound webhook delivery', '—', 'Simulated in the public E2E; DOA journey verified'],
                      ['Refunds (POST /v1/refunds)', 'Merchant credential (verified). Developer refunds:write scope', 'Pending E2E for developer keys — a developer-key request is rejected (403)'],
                      ['Transfers', 'Authenticated user (verified). Developer transfers:* scopes', 'Pending E2E for developer keys'],
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
                Credential note: refunds and transfers were verified with merchant/user credentials; the developer-key scopes
                (<Code>refunds:write</Code>, <Code>transfers:*</Code>) remain <strong>Pending E2E</strong> — a developer-key
                refund request is rejected (403). Never present these as fully available to developer keys.
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
              <PageLede>How to validate the integration in the Sandbox, and its limits. <strong>No real money ever moves</strong> and <strong>public customer onboarding is not allowed</strong> in preview.</PageLede>
              <NextSteps label="Next:" links={[{ href: '/docs/en/trust', text: 'Trust and readiness' }, { href: '/docs/en/guides', text: 'Guides' }]} />
              <P><strong>What the Sandbox is:</strong> a complete integration environment with test accounts, sessions, links, QR and webhooks — flows behave like the real ones, but <strong>no real money ever moves</strong>.</P>
              <P><strong>What the Sandbox is not:</strong> there are no live rails, no external providers activated, and no Production key issuance. All test credentials in these examples are placeholders.</P>
              <UL>
                <LI><strong>1. First call:</strong> <Code>GET /v1/me</Code> with your key — success is <Code>200</Code> with <Code>environment: SANDBOX</Code>; the typical failure is <Code>401 UNAUTHORIZED</Code> (wrong/revoked key).</LI>
                <LI><strong>2. Create a session:</strong> <Code>POST /v1/business/payment-sessions</Code> — success is <Code>201</Code> with <Code>status: ACTIVE</Code> and the link/QR interfaces.</LI>
                <LI><strong>3. Test idempotency:</strong> repeat the same POST with the same <Code>Idempotency-Key</Code> — you should receive the original response with no duplicated effect; send two concurrently and one gets <Code>409 CONFLICT</Code>.</LI>
                <LI><strong>4. Test errors:</strong> omit <Code>amount_minor</Code> to see <Code>400 MISSING_FIELD</Code>; use an invalid key to see <Code>401</Code>; always keep the <Code>request_id</Code> from the response.</LI>
                <LI><strong>5. Interpreting results:</strong> any response carrying the error envelope (see <a href="/docs/en/reference#errors" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>Errors</a>) is actionable via its <Code>code</Code>.</LI>
              </UL>
              <Callout tone="warn">
                Internal Sandbox funding/simulation utilities exist but are <strong>internal — not public</strong>; they are
                not part of the documented surface. Outbound webhook delivery to external sinks remains <strong>simulated</strong>{' '}
                in the public E2E suite — see <a href="/docs/en/guides#webhooks" style={{ color: '#B8770A', fontWeight: 800, textDecoration: 'none' }}>Webhooks</a>.
              </Callout>
            </Section>
    </>
  );
}

export function EnTrust({ copy }: { copy: CopyFn }) {
  return (
    <>
<Section id="trust-page">
              <H2>Trust and readiness</H2>
              <PageLede>Readiness, evidence, risks and decision gates for approved partners. <strong>It does not represent Production approval or regulatory authorization.</strong></PageLede>
              <NextSteps label="Related:" links={[{ href: '/docs/en/artifacts', text: 'Artifacts' }, { href: '/docs/en/testing', text: 'Sandbox testing' }, { href: '/docs/en/changelog', text: 'Changelog' }]} />
<H3 id="trust">Technical trust and readiness</H3>
              <P>
                This section summarizes the technical state of Banzami Developers documentation for approved partners. The
                goal is to clearly separate what is available in Sandbox/Preview, what is simulated, what is pending, what is
                not available, and what must not be interpreted as Production approval, live rails activation, or regulatory
                authorization.
              </P>
              <div style={{ overflowX: 'auto', maxWidth: '100%', margin: '0 0 14px' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 560, fontSize: 12.5 }}>
                  <thead>
                    <tr style={{ textAlign: 'left', color: '#a89a9e' }}>
                      <th style={{ padding: '8px 10px', fontWeight: 800, borderBottom: '1px solid #F2E2E0' }}>Capability</th>
                      <th style={{ padding: '8px 10px', fontWeight: 800, borderBottom: '1px solid #F2E2E0' }}>State</th>
                    </tr>
                  </thead>
                  <tbody>
                    {([
                      ['SDK-first integration model', 'documented_preview'],
                      ['SDK controlled preview', 'not_public'],
                      ['HTTP/OpenAPI protocol reference', 'documented_preview'],
                      ['Sandbox API routes', 'available_controlled_sandbox'],
                      ['Payment sessions', 'available_controlled_sandbox'],
                      ['Payment links', 'available_controlled_sandbox'],
                      ['QR payload', 'available_controlled_sandbox'],
                      ['Webhook signature/reference', 'documented_preview'],
                      ['Webhook outbound delivery', 'simulated'],
                      ['Refunds (developer key)', 'pending_e2e'],
                      ['Transfers (developer key)', 'pending_e2e'],
                      ['Developer Console (visual pages)', 'documented_preview'],
                      ['Production/live rails', 'not_available'],
                      ['Pay/checkout/live rails', 'not_approved'],
                      ['External provider rails', 'not_approved'],
                    ] as [string, string][]).map(([cap, st]) => (
                      <tr key={cap}>
                        <td style={{ padding: '8px 10px', borderBottom: '1px solid #F5E9E7', fontWeight: 700, color: INK }}>{cap}</td>
                        <td style={{ padding: '8px 10px', borderBottom: '1px solid #F5E9E7', fontFamily: mono, fontSize: 12, color: '#9A1B22' }}>{st}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <H3 id="evidence-map">Sandbox evidence map</H3>
              <P>Public/repository artifacts that support this documentation:</P>
              <UL>
                <LI>OpenAPI and Postman Sandbox references; availability matrix; SDK-first manifest; SDK contract.</LI>
                <LI>Onboarding artifacts; examples and fixtures (curl, requests/responses, error and webhook envelopes).</LI>
                <LI>Documentation claim-safety tests — the P0/P1/P2A/P2B/P2C/P2D suites.</LI>
              </UL>
              <Callout tone="warn">
                Evidence-backed documentation does not mean live production availability. Repository artifacts do not mean
                regulatory authorization. Passing documentation tests does not activate payment rails.
              </Callout>

              <H3 id="risk-matrix">Risk and limitation matrix</H3>
              <div style={{ overflowX: 'auto', maxWidth: '100%', margin: '0 0 14px' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 640, fontSize: 12.5 }}>
                  <thead>
                    <tr style={{ textAlign: 'left', color: '#a89a9e' }}>
                      {['Risk / limitation', 'Status', 'Partner implication', 'Expected handling'].map((h) => (
                        <th key={h} style={{ padding: '8px 8px', fontWeight: 800, borderBottom: '1px solid #F2E2E0' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {([
                      ['SDK packages not publicly published', 'not_public', 'Do not install from public registries.', 'Controlled access via onboarding.'],
                      ['Preview access is controlled, not self-service', 'not_public', 'No public signup; wait for approval.', 'Documented eligibility and approval process.'],
                      ['HTTP/OpenAPI is reference, not recommended path', 'documented_preview', 'Direct HTTP for diagnostics/audits only.', 'SDK-first; artifacts labelled protocol_reference.'],
                      ['Webhook outbound delivery simulated', 'simulated', 'Do not assume guaranteed public delivery.', 'Retry contract documented; DOA journey verified.'],
                      ['Refunds/transfers pending E2E (developer keys)', 'pending_e2e', 'Developer-key requests rejected (403).', 'Credential↔capability matrix; future verification.'],
                      ['Console visual pages demo/non-operational', 'documented_preview', 'Do not rely on those pages\u2019 data.', 'Labelled in the documentation.'],
                      ['Production/live rails not available', 'not_available', 'No real money; no live keys.', 'bz_live_ rejected fail-closed.'],
                      ['External provider rails not active', 'not_approved', 'Do not assume external integrations.', 'Separate governance decision.'],
                      ['Stage C not implemented/approved', 'not_approved', 'Additional public routes do not exist yet.', 'Decision gates and explicit approvals.'],
                      ['Regulatory approval not claimed', 'not_approved', 'No regulatory claims based on the preview.', 'Claim-safety wording and tests.'],
                      ['Real-money payments not available', 'not_available', 'Controlled test flows only.', 'Sandbox-only across the documentation.'],
                      ['Public customer onboarding not allowed in preview', 'not_approved', 'Do not expose the preview to end customers.', 'Partner responsibilities; readiness review.'],
                    ] as string[][]).map((row) => (
                      <tr key={row[0]}>
                        {row.map((cell, i) => (
                          <td key={i} style={{ padding: '8px 8px', borderBottom: '1px solid #F5E9E7', color: i === 0 ? INK : i === 1 ? '#9A1B22' : '#5a4a4e', fontWeight: i === 0 ? 700 : 500, fontFamily: i === 1 ? mono : undefined, fontSize: i === 1 ? 11.5 : undefined }}>{cell}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <H3 id="readiness-package">Readiness package for approved partners</H3>
              <P>
                The package gathers: SDK preview onboarding, Sandbox validation checklist, partner responsibilities, the
                issue report template, the readiness review checklist, the SDK contract, the availability matrix and the
                protocol references (OpenAPI and Postman).
              </P>
              <Callout tone="warn">
                The readiness package is Sandbox/Preview only. It is not Production approval, not regulatory authorization,
                does not activate live rails, and does not grant public SDK package access.
              </Callout>

              <H3 id="decision-gates">Decision gates before any next phase</H3>
              <div style={{ overflowX: 'auto', maxWidth: '100%', margin: '0 0 14px' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 640, fontSize: 12.5 }}>
                  <thead>
                    <tr style={{ textAlign: 'left', color: '#a89a9e' }}>
                      {['Gate', 'Purpose', 'Required evidence', 'Pass condition', 'Does not authorize'].map((h) => (
                        <th key={h} style={{ padding: '8px 8px', fontWeight: 800, borderBottom: '1px solid #F2E2E0' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {([
                      ['1. Documentation honesty', 'Documentation reflects evidence.', 'Claim-safety test suites passing.', 'All documentation tests green.', 'Package publication or live availability.'],
                      ['2. SDK preview access', 'Approved controlled access.', 'Recorded preview approval.', 'Access granted to the project.', 'Public SDK publication.'],
                      ['3. Sandbox validation', 'Integration validated in Sandbox.', 'Validation checklist with evidence.', 'Checklist complete.', 'Live rails activation.'],
                      ['4. Security/secrets handling', 'Credential management reviewed.', 'Documented secrets review.', 'No client-side exposure.', 'Production security certification.'],
                      ['5. Error/idempotency handling', 'Correct handling confirmed.', 'Documented, tested strategies.', 'Safe retries demonstrated.', 'Production guarantees.'],
                      ['6. Webhook handling design', 'Verification and dedupe reviewed.', 'Documented design.', 'Signature + idempotency reviewed.', 'Guaranteed public delivery.'],
                      ['7. Capability limitation acceptance', 'Documented limits accepted.', 'Limitations acknowledged in writing.', 'Recorded acceptance.', 'Lifting of the limitations.'],
                      ['8. Operational readiness review', 'Complete evidence reviewed.', 'Readiness package submitted.', 'Readiness assessment issued.', 'Production approval.'],
                      ['9. Regulatory/legal review', 'Framing before any supervised phase.', 'Own regulatory/legal review.', 'Outside this documentation\u2019s scope.', 'Regulatory authorization.'],
                      ['10. Explicit approval for any future live/Production phase', 'Explicit, separate decision.', 'Recorded formal approval.', 'Future decision, not included here.', 'Nothing in this documentation grants it.'],
                    ] as string[][]).map((row) => (
                      <tr key={row[0]}>
                        {row.map((cell, i) => (
                          <td key={i} style={{ padding: '8px 8px', borderBottom: '1px solid #F5E9E7', color: i === 0 ? INK : '#5a4a4e', fontWeight: i === 0 ? 700 : 500 }}>{cell}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Callout tone="warn">
                No gate in this documentation authorizes live rails, real-money payments, public launch, production key
                issuance, or regulatory approval.
              </Callout>

              <H3 id="security-posture">Preview security posture summary</H3>
              <UL>
                <LI>Secret keys never in browser/mobile clients; preview artifacts use placeholders only; test data must be non-sensitive.</LI>
                <LI><Code>request_id</Code> captured for debugging; idempotency used for mutating operations; webhook signatures verified before trusting events.</LI>
                <LI>Partner protects preview credentials and artifacts; availability limits respected; SDK packages are not public; live rails are not active.</LI>
              </UL>
              <P style={{ fontSize: 13, color: '#a89a9e' }}>
                This summary covers only the Sandbox/Preview scope supported by the documentation — no certification,
                external audit or uptime claims.
              </P>

              <P>
                Trust/readiness artifacts:{' '}
                <a href="/developers/trust/developer-trust-summary.json" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>trust summary</a>
                {' '}·{' '}
                <a href="/developers/trust/sandbox-evidence-map.json" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>evidence map</a>
                {' '}·{' '}
                <a href="/developers/trust/risk-limitations-matrix.json" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>risk matrix</a>
                {' '}·{' '}
                <a href="/developers/trust/partner-readiness-package.json" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>readiness package</a>
                {' '}·{' '}
                <a href="/developers/trust/decision-gates.json" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>decision gates</a>
                {' '}·{' '}
                <a href="/developers/trust/preview-security-posture.json" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>security posture</a>
                {' '}·{' '}
                <a href="/developers/trust/trust-readiness-summary.md" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>summary (MD)</a>.
                {' '}These artifacts support technical assessment for approved partners in Sandbox/Preview. They are not
                Production contracts, do not activate live rails, do not authorize real money, and do not represent
                regulatory approval.
              </P>
            </Section>
    </>
  );
}

export function EnArtifacts({ copy }: { copy: CopyFn }) {
  return (
    <>
<Section id="artifacts-page">
              <H2>Artifacts</H2>
              <PageLede>Public <strong>Sandbox/Preview reference</strong> artifacts — OpenAPI, Postman, availability matrix, manifests and examples. Not Production contracts.</PageLede>
              <NextSteps label="Related:" links={[{ href: '/docs/en/reference', text: 'API Reference' }, { href: '/docs/en/trust', text: 'Trust and readiness' }, { href: '/docs/en/changelog', text: 'Changelog' }]} />
<H3 id="artifacts">Technical reference artifacts</H3>
              <P>
                The same documented surface exists in <strong>machine-readable</strong> form — <strong>protocol reference
                artifacts</strong>, published as static files. They are <strong>not the primary integration recommendation</strong>{' '}
                (Banzami is SDK-first), describe only the current Sandbox/Preview scope, are{' '}
                <strong>not Production contracts</strong>, not live rails, not regulatory approval, and not a replacement for
                the SDKs:
              </P>
              <UL>
                <LI><strong>OpenAPI</strong> (protocol reference) — <a href="/developers/openapi/banzami-sandbox.openapi.json" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>/developers/openapi/banzami-sandbox.openapi.json</a> — verified endpoints only; refunds/transfers absent while Pending E2E for developer keys.</LI>
                <LI><strong>Postman collection</strong> (protocol reference) — <a href="/developers/postman/banzami-sandbox.postman_collection.json" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>/developers/postman/banzami-sandbox.postman_collection.json</a>.</LI>
                <LI><strong>curl examples</strong> (diagnostic / protocol reference) — <a href="/developers/examples/curl/get-me.sh" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>get-me.sh</a> · <a href="/developers/examples/curl/create-payment-session.sh" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>create-payment-session.sh</a>; full fixtures in <Code>docs/developer/examples/</Code>.</LI>
                <LI><strong>Availability matrix</strong> — <a href="/developers/availability/banzami-developers-availability.json" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>/developers/availability/banzami-developers-availability.json</a> (the machine-readable source of this documentation's states, checked by tests).</LI>
                <LI><strong>Manifests</strong> — <a href="/developers/artifacts/manifest.json" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>manifest.json</a> · <a href="/developers/artifacts/sdk-first-manifest.json" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>sdk-first-manifest.json</a> (machine-readable SDK-first model; no SDK package published).</LI>
              </UL>
                          <P style={{ fontSize: 13, color: '#a89a9e' }}>
                The <a href="/developers/artifacts/manifest.json" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>artifact manifest</a> indexes every
                public artifact — including the <a href="/docs/en/sdk" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>SDK preview onboarding</a> and
                the <a href="/docs/en/trust" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>trust/readiness</a> sets — all Sandbox/Preview, none a Production contract.
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
              <NextSteps label="Next:" links={[{ href: '/docs/en/artifacts', text: 'Artifacts' }, { href: '/docs/en/trust', text: 'Trust and readiness' }]} />
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

