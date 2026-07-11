// P2A machine-readable artifacts guards.
//
// Validates the OpenAPI spec, examples/fixtures, Postman collection and the
// machine-readable availability matrix against the same honesty rules the
// rendered docs obey — and validates that PT/EN docs reference the artifacts.
// Node-only (fs + JSON), no jsdom, no network.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO = join(process.cwd(), '..', '..');
const read = (p: string) => readFileSync(join(REPO, p), 'utf8');

const OPENAPI = JSON.parse(read('docs/developer/openapi/banzami-sandbox.openapi.json'));
const POSTMAN = JSON.parse(read('docs/developer/postman/banzami-sandbox.postman_collection.json'));
const MATRIX = JSON.parse(read('docs/developer/availability/banzami-developers-availability.json'));
const PT = read('apps/website/app/developers/docs/page.tsx');
const EN = read('apps/website/app/developers/docs/en/page.tsx');

const ALLOWED_PATHS = [
  '/v1/me',
  '/v1/business/payment-sessions',
  '/v1/business/payment-sessions/{id}',
  '/v1/business/payment-sessions/{id}/link',
  '/v1/business/payment-sessions/{id}/qr',
  '/v1/payment-links',
];
const FORBIDDEN_PATH_TOKENS = [
  '/v1/refunds', '/v1/transfers', '/v1/payments', '/checkout', '/pay/',
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
    for (const p of ['/v1/business/payment-sessions', '/v1/payment-links']) {
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
});

describe('P2A — machine-readable availability matrix', () => {
  const ALLOWED_STATES = ['available_controlled_sandbox', 'documented_preview', 'pending_e2e', 'simulated', 'not_public', 'not_available', 'not_approved'];
  it('exists with all required capabilities and only conservative states', () => {
    const caps = MATRIX.capabilities;
    for (const key of ['console_visual_pages', 'developer_api_key', 'sandbox_api_identity', 'payment_sessions', 'payment_links', 'webhook_configuration', 'webhook_outbound_delivery', 'refunds', 'transfers', 'production_live_rails', 'pay_checkout_live_rails', 'external_provider_rails']) {
      expect(caps[key], `missing capability: ${key}`).toBeTruthy();
      expect(ALLOWED_STATES).toContain(caps[key].state);
    }
    expect(MATRIX.environment).toBe('SANDBOX');
  });
  it('refunds/transfers are NOT marked fully available; outbound webhooks NOT publicly active; live rails NOT available', () => {
    expect(MATRIX.capabilities.refunds.state).toBe('pending_e2e');
    expect(MATRIX.capabilities.transfers.state).toBe('pending_e2e');
    expect(MATRIX.capabilities.webhook_outbound_delivery.state).toBe('simulated');
    expect(MATRIX.capabilities.production_live_rails.state).toBe('not_available');
    expect(MATRIX.capabilities.pay_checkout_live_rails.state).toBe('not_approved');
    expect(MATRIX.capabilities.external_provider_rails.state).toBe('not_approved');
    expect(MATRIX.capabilities.console_visual_pages.state).toBe('documented_preview');
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
