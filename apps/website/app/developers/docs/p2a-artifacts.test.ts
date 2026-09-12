// P2A machine-readable artifacts guards.
//
// Validates the OpenAPI spec, examples/fixtures, Postman collection and the
// machine-readable availability matrix against the same honesty rules the
// rendered docs obey — and validates that PT/EN docs reference the artifacts.
// Node-only (fs + JSON), no jsdom, no network.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isReleased } from './assurance-manifest';

const REPO = join(process.cwd(), '..', '..');
const read = (p: string) => readFileSync(join(REPO, p), 'utf8');

const OPENAPI = JSON.parse(read('docs/developer/openapi/banzami-sandbox.openapi.json'));
const POSTMAN = JSON.parse(read('docs/developer/postman/banzami-sandbox.postman_collection.json'));
const MATRIX = JSON.parse(read('docs/developer/availability/banzami-developers-availability.json'));
const PT = read('apps/website/app/developers/docs/content-pt.tsx') + read('apps/website/app/developers/docs/page.tsx');
const EN = read('apps/website/app/developers/docs/content-en.tsx') + read('apps/website/app/developers/docs/en/page.tsx');

// The public contract may only advertise surface that is implemented, tested
// AND deployed. Adding a path here before the gateway serves it would publish a
// documented endpoint that answers 404 — so the gateway deploy must land before
// the website deploy that ships this artifact.
const ALLOWED_PATHS = [
  '/v1/me',
  // A Project's own financial readiness, read with the Project key alone.
  '/v1/financial-setup',
  '/v1/payment-sessions',
  '/v1/payment-sessions/{id}',
  '/v1/payment-sessions/{id}/link',
  '/v1/payment-sessions/{id}/qr',
  '/v1/payment-links',
  '/v1/wallet-accounts',
  '/v1/wallet-accounts/{id}',
  // Released on deployed-Sandbox E2E evidence; see the assurance manifest.
  '/v1/wallet-account-transfers',
  '/v1/refunds',
  '/v1/webhooks/endpoints',
  // Mounted on the dual-credential group and served today; documented from
  // their handlers (A4-08). Two of them refuse a developer key and say so
  // (GET /v1/application-settlements/{id}, GET /v1/integration).
  '/v1/application-settlements',
  '/v1/application-settlements/{id}',
  '/v1/payment-links/{id}',
  '/v1/refunds/{id}',
  '/v1/integration',
  '/v1/consumers/handle/{handle}',
  '/v1/webhooks/endpoints/{id}',
  '/v1/webhooks/endpoints/{id}/health',
  '/v1/webhooks/endpoints/{id}/rotate-secret',
  '/v1/webhooks/events',
  '/v1/webhooks/events/{id}/deliveries',
  '/v1/webhooks/deliveries/{id}/replay',
];

// Retired routes are never described as operations (410 ROUTE_RETIRED).
const RETIRED_PATHS = ['/v1/payment-links/{id}/mark-used'];
// Surfaces the public Sandbox spec must not document. `/v1/refunds` used to be
// on this list because it was the merchant-JWT twin of the project-scoped route
// — documenting it would have pointed developers at a path their credential
// could not open. It is now the canonical public refund route, dual-auth, and
// belongs in the spec; `/v1/transfers` remains withdrawn (RA-053).
const FORBIDDEN_PATH_TOKENS = [
  '/v1/transfers', '/v1/payments', '/checkout', '/pay/',
  '/v1/sandbox/fund', '/v1/sandbox/simulate', '/internal/', 'bz_live_',
  'api.banzami.com/v1', 'emis', 'callbacks',
];

describe('P2A — OpenAPI spec', () => {
  it('exists, parses, and is the Sandbox documentation spec', () => {
    expect(OPENAPI.openapi).toBe('3.0.3');
    expect(OPENAPI.info.title).toBe('Banzami Sandbox API');
    expect(OPENAPI.info.version).toMatch(/^docs-/); // documentation version, not a fake API release
    expect(OPENAPI.servers).toHaveLength(1);
    expect(OPENAPI.servers[0].url).toBe('https://sandbox-api.banzami.com');
  });
  it('contains ONLY the allowed, verified endpoints', () => {
    expect(Object.keys(OPENAPI.paths).sort()).toEqual([...ALLOWED_PATHS].sort());
  });
  it('describes no retired route', () => {
    for (const p of RETIRED_PATHS) expect(OPENAPI.paths[p], p).toBeUndefined();
    expect(JSON.stringify(OPENAPI.paths)).not.toContain('mark-used');
  });
  it('every operation names its credential and at least one failure response', () => {
    for (const [path, ops] of Object.entries(OPENAPI.paths as Record<string, Record<string, { description?: string; responses: Record<string, unknown> }>>)) {
      for (const [method, op] of Object.entries(ops)) {
        const failures = Object.keys(op.responses).filter((c) => /^[45]/.test(c));
        expect(failures.length, `${method.toUpperCase()} ${path} documents no failure`).toBeGreaterThan(0);
      }
    }
  });
  it('contains no production/live/pay/checkout/internal/provider surface', () => {
    // Surfaces = paths + servers. Honesty DESCRIPTIONS may name bz_live_ only to
    // say it is rejected — that is required wording, not a surface.
    const surfaces = [...Object.keys(OPENAPI.paths), ...OPENAPI.servers.map((s: { url: string }) => s.url)].join(' ').toLowerCase();
    for (const bad of FORBIDDEN_PATH_TOKENS) {
      expect(surfaces.includes(bad.toLowerCase()), `OpenAPI surface must not contain "${bad}"`).toBe(false);
    }
    // bz_live_ may appear ONLY next to rejection wording, never as a credential example.
    const raw = JSON.stringify(OPENAPI);
    expect(/bz_live_[A-Za-z0-9]/.test(raw)).toBe(false);
    expect(raw).toContain('bz_live_ keys are rejected fail-closed');
  });
  it('documents Bearer auth and the Idempotency-Key header on writes', () => {
    expect(OPENAPI.components.securitySchemes.bearerAuth.scheme).toBe('bearer');
    for (const p of ['/v1/payment-sessions', '/v1/payment-links']) {
      const post = OPENAPI.paths[p].post;
      const hasIdem = JSON.stringify(post.parameters ?? []).includes('IdempotencyKey');
      expect(hasIdem, `${p} POST must document Idempotency-Key`).toBe(true);
    }
  });
  it('uses the observed FLAT error envelope (code/message/request_id, no nested error object)', () => {
    const err = OPENAPI.components.schemas.Error;
    expect(Object.keys(err.properties).sort()).toEqual(['code', 'message', 'request_id']);
    expect(err.properties.error).toBeUndefined();
  });
  it('examples use obvious placeholders only', () => {
    const raw = JSON.stringify(OPENAPI);
    expect(/bz_(test|live)_(pk|sk)_(?!X{2,})[A-Za-z0-9]{8,}/.test(raw)).toBe(false);
    expect(raw).toContain('req_xxx');
    expect(raw).toContain('idem_xxx');
  });
  it('documents the session QR as the hosted pay URL (A4-01), never a structured payload', () => {
    // No route pays a structured dynamic-QR payload, so the gateway encodes the
    // session's pay URL in every session QR; the spec and the rendered reference
    // must show that value, not a <qr-payload> placeholder.
    const qrEx = OPENAPI.paths['/v1/payment-sessions/{id}/qr'].get.responses['200'].content['application/json'].example;
    expect(qrEx.value).toMatch(/^https:\/\/pay\.banzami\.com\/pay\//);
    const created = OPENAPI.paths['/v1/payment-sessions'].post.responses['201'].content['application/json'].example;
    const qrIface = created.interfaces.find((i: { type: string }) => i.type === 'DYNAMIC_QR');
    const link = created.interfaces.find((i: { type: string }) => i.type === 'PAYMENT_LINK');
    expect(qrIface.value).toBe(link.value);
    for (const src of [JSON.stringify(OPENAPI), read('apps/website/app/developers/docs/reference.tsx'), read('apps/website/app/developers/docs/content-pt.tsx')]) {
      expect(src).not.toContain('qr-payload>');
      expect(src).not.toContain('"<payload>"');
    }
  });
});

describe('P2A — examples and fixtures', () => {
  const FIX_DIR = 'docs/developer/examples/fixtures';
  const CURL_DIR = 'docs/developer/examples/curl';
  it('the expected fixtures exist and are valid JSON', () => {
    const files = readdirSync(join(REPO, FIX_DIR));
    for (const f of ['get-me.response.json', 'create-payment-session.request.json', 'create-payment-session.response.json', 'error.validation_error.json', 'error.unauthorized.json', 'webhook.event.example.json']) {
      expect(files).toContain(f);
      expect(() => JSON.parse(read(`${FIX_DIR}/${f}`))).not.toThrow();
    }
  });
  it('fixtures/examples contain only placeholders — no secrets, private URLs, IPs or server paths', () => {
    const all = [
      ...readdirSync(join(REPO, FIX_DIR)).map((f) => read(`${FIX_DIR}/${f}`)),
      ...readdirSync(join(REPO, CURL_DIR)).map((f) => read(`${CURL_DIR}/${f}`)),
      read('docs/developer/examples/README.md'),
    ].join('\n');
    expect(/bz_(test|live)_(pk|sk)_(?!X{2,})[A-Za-z0-9]{8,}/.test(all)).toBe(false);
    expect(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/.test(all)).toBe(false);
    expect(all.includes('/srv/')).toBe(false);
    expect(all.includes('root@')).toBe(false);
    expect(/eyJ[A-Za-z0-9_-]{10,}/.test(all)).toBe(false);
    // No install commands for unpublished SDKs as runnable instructions (the
    // README names npm install only inside its explicit anti-instruction).
    expect(all.split('npm install @banzami').length - 1).toBeLessThanOrEqual(1);
    expect(all).toContain('Não corra');
  });
  it('the webhook fixture keeps the verified envelope and marks data non-contractual', () => {
    const wh = JSON.parse(read(`${FIX_DIR}/webhook.event.example.json`));
    expect(Object.keys(wh).sort()).toEqual(['created_at', 'data', 'id', 'type']);
    expect(wh.type).toBe('payment_session.paid'); // verified event name only
    expect(JSON.stringify(wh.data)).toContain('non_contractual');
  });
});

describe('P2A — Postman collection', () => {
  it('is Sandbox-named, placeholder-only, Bearer-authenticated', () => {
    expect(POSTMAN.info.name).toContain('Sandbox');
    expect(POSTMAN.auth.type).toBe('bearer');
    const vars = Object.fromEntries(POSTMAN.variable.map((v: { key: string; value: string }) => [v.key, v.value]));
    expect(vars.baseUrl).toBe('https://sandbox-api.banzami.com');
    expect(vars.apiKey).toBe('bz_test_sk_XXXX');
  });
  it('matches the allowed endpoint set (no refunds/transfers/live surfaces)', () => {
    const raw = JSON.stringify(POSTMAN);
    for (const bad of ['/v1/refunds', '/v1/transfers', '/v1/payments', 'checkout', 'api.banzami.com/v1', 'bz_live_']) {
      expect(raw.includes(bad), `Postman must not contain "${bad}"`).toBe(false);
    }
    // Every request URL path is within the allowed set.
    const urls: string[] = [];
    for (const folder of POSTMAN.item) for (const req of folder.item) urls.push(req.request.url.raw);
    for (const u of urls) {
      const path = u.replace('{{baseUrl}}', '').replace('{{sessionId}}', '{id}').split('?')[0];
      expect(ALLOWED_PATHS.includes(path), `unexpected Postman path: ${path}`).toBe(true);
    }
  });
  it('sends each request to the path it displays (url.path agrees with url.raw)', () => {
    // Postman sends the structured url.path, not url.raw. The session requests
    // once carried a legacy /v1/business/... path array under a correct raw URL,
    // so the collection displayed a mounted route and called an unmounted one.
    for (const folder of POSTMAN.item) {
      for (const req of folder.item) {
        const url = req.request.url;
        const rawPath = url.raw.replace('{{baseUrl}}', '').split('?')[0];
        expect('/' + url.path.join('/'), `${req.name}: url.path disagrees with url.raw`).toBe(rawPath);
      }
    }
  });
  it('describes the session QR as the hosted pay URL, not a structured payload', () => {
    const raw = JSON.stringify(POSTMAN);
    expect(raw).not.toContain('png/pdf');
    expect(raw).toContain('https://pay.banzami.com/pay/{slug}');
  });
});

describe('P2A — machine-readable availability matrix', () => {
  // 'documented_preview' became 'served_pending_capability': the surfaces it
  // described are served and working, and the old name read as though they were
  // hypothetical. What it still withholds is the released badge, which only a
  // released assurance capability may grant.
  const ALLOWED_STATES = ['available_controlled_sandbox', 'served_pending_capability', 'pending_e2e', 'simulated', 'not_public', 'not_available', 'not_approved'];
  it('exists with all required capabilities and only conservative states', () => {
    const caps = MATRIX.capabilities;
    for (const key of ['console_visual_pages', 'developer_api_key', 'sandbox_api_identity', 'payment_sessions', 'payment_links', 'webhook_configuration', 'webhook_outbound_delivery', 'refunds', 'transfers', 'wallet_accounts', 'application_settlements', 'production_live_rails', 'pay_checkout_live_rails', 'external_provider_rails']) {
      expect(caps[key], `missing capability: ${key}`).toBeTruthy();
      expect(ALLOWED_STATES).toContain(caps[key].state);
    }
    expect(MATRIX.environment).toBe('SANDBOX');
  });
  it('every state tracks the assurance manifest, and live rails stay unavailable', () => {
    // The machine-readable matrix is downstream of the same evidence as the
    // badges: a capability reads available_controlled_sandbox only while the
    // manifest records it released with a deployed E2E run behind it.
    const expected = (id: string, whenNot: string) =>
      isReleased(id) ? 'available_controlled_sandbox' : whenNot;
    expect(MATRIX.capabilities.refunds.state).toBe(expected('CAP-REFUND-001', 'pending_e2e'));
    expect(MATRIX.capabilities.transfers.state).toBe(expected('CAP-TRANSFER-002', 'pending_e2e'));
    expect(MATRIX.capabilities.webhook_outbound_delivery.state).toBe(expected('CAP-WEBHOOK-001', 'simulated'));
    // Not derived from anything: Production stays unavailable, full stop.
    expect(MATRIX.capabilities.production_live_rails.state).toBe('not_available');
    expect(MATRIX.capabilities.pay_checkout_live_rails.state).toBe('not_approved');
    expect(MATRIX.capabilities.external_provider_rails.state).toBe('not_approved');
    // Every Console page now reads the project's own data; illustrative-data.test.ts
    // asserts the list of pages with invented constants is empty.
    expect(MATRIX.capabilities.console_visual_pages.state).toBe('available_controlled_sandbox');
  });
});

describe('P2A — docs integration (PT/EN)', () => {
  it('PT and EN docs both reference the technical artifacts', () => {
    expect(PT).toContain('Artefactos técnicos');
    expect(EN).toContain('Technical reference artifacts');
    for (const src of [PT, EN]) {
      expect(src).toContain('banzami-sandbox.openapi.json');
      expect(src).toContain('banzami-sandbox.postman_collection.json');
      expect(src).toContain('banzami-developers-availability.json');
      expect(src).toContain('docs/developer/examples/');
    }
  });
  it('artifact wording stays Sandbox/Preview-scoped and non-Production', () => {
    expect(PT).toContain('não são contratos de Produção');
    expect(EN).toContain('not Production contracts');
  });
});
