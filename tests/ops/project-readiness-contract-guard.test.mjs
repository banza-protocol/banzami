/**
 * The public Project contract, held by counting.
 *
 * ADR-057 made four promises that each used to be broken by one line nobody
 * noticed: a /business route mounted for a Project key, a rate field a caller
 * could set, an SDK method that read the Business profile, and code that
 * treated one application's identity as special. Each is a count here, and each
 * count is zero.
 *
 *   PUBLIC_DEVELOPER_LEGACY_BUSINESS_ROUTES   = 0
 *   PUBLIC_SETTLEMENT_CALLER_PRICING_FIELDS   = 0
 *   SDK_BUSINESS_PROFILE_READERS              = 0
 *   APPLICATION_IDENTITY_SPECIAL_CASES        = 0
 *
 * Deliberately syntactic, over source only. It counts field DECLARATIONS and
 * route REGISTRATIONS — not comments explaining that a field was withdrawn, and
 * not the gateway's list of names it refuses, which exists to keep them out.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const REPO = join(import.meta.dirname, '../..');
const read = (p) => readFileSync(join(REPO, p), 'utf8');

/** Tracked files matching pathspecs, tests excluded unless asked for. */
function files(pathspecs, { tests = false } = {}) {
  const out = execFileSync('git', ['ls-files', '--', ...pathspecs], { cwd: REPO, encoding: 'utf8' })
    .split('\n').filter(Boolean);
  if (tests) return out;
  return out.filter((f) =>
    !/(_test\.go|\.test\.(ts|tsx|mjs)|_tests\.rs|\/tests\/|\/__tests__\/|\.spec\.ts)$/.test(f) &&
    !/\/tests\//.test(f));
}

function occurrences(pathspecs, pattern, opts) {
  const hits = [];
  for (const f of files(pathspecs, opts)) {
    const lines = read(f).split('\n');
    lines.forEach((l, i) => { if (pattern.test(l)) hits.push(`${f}:${i + 1}: ${l.trim()}`); });
  }
  return hits;
}

// ── counters, exported for the mutation self-test below ─────────────────────

export function legacyBusinessRoutes(serverSrc) {
  // A route or group registered under /v1/business, or under /business inside
  // the /v1 mount. The literal is assembled so a path sweep cannot rewrite the
  // guard into a tautology.
  const word = 'busi' + 'ness';
  const re = new RegExp(`r\\.(Route|Get|Post|Put|Patch|Delete|Mount)\\("(/v1)?/${word}[/"]`);
  return serverSrc.split('\n').filter((l) => re.test(l));
}

const PRICING_FIELD_DECL = [
  // Go struct fields and JSON tags
  /json:"(application_fee_bps|fee_bps|rate_bps|pricing_profile|business_category|fee_policy_ref)"/,
  /\bApplicationFeeBps\b\s+\w/,
  // Rust struct fields
  /^\s*pub\s+application_fee_bps\s*:/,
  /^\s*application_fee_bps\s*:\s*(Option<)?u\d+/,
  // TypeScript properties and wire keys
  /\bapplicationFeeBps\??\s*:/,
  /\bapplication_fee_bps\??\s*:/,
];

export function callerPricingFieldsIn(text, file = '') {
  return text.split('\n')
    .map((l, i) => ({ l, i }))
    .filter(({ l }) => PRICING_FIELD_DECL.some((re) => re.test(l)))
    .map(({ l, i }) => `${file}:${i + 1}: ${l.trim()}`);
}

// Only the settlement REQUEST contract. pricing_profile is legitimately a field
// of the readiness response and of the internal core request the gateway builds
// from the operator's assignment; it is not a caller field there.
const SETTLEMENT_CONTRACT_SOURCES = [
  'services/api-gateway/internal/handler/application_settlements.go',
  'core/app-settlement/src/domain.rs',
  'core/api/src/routes/application_settlements.rs',
  'sdk/typescript/src/types.ts',
  'sdk/typescript/src/client.ts',
];

function callerPricingFields() {
  const hits = [];
  for (const f of SETTLEMENT_CONTRACT_SOURCES) {
    let src = read(f);
    // The gateway's refusal list names the fields in order to refuse them.
    src = src.replace(/var callerPricingFields = \[\]string\{[\s\S]*?\n\}/, '');
    // Core's internal body keeps pricing_profile: set by the gateway from the
    // operator's assignment, never from the caller (the refusal proves that).
    hits.push(...callerPricingFieldsIn(src, f).filter((h) =>
      !(f.startsWith('core/') && /pricing_profile/.test(h))));
  }
  for (const f of ['docs/developer/openapi/banzami-sandbox.openapi.json',
    'apps/website/public/developers/openapi/banzami-sandbox.openapi.json']) {
    if (/application_fee_bps|applicationFeeBps/.test(read(f))) hits.push(`${f}: names a caller rate`);
  }
  return hits;
}

export function applicationIdentitySpecialCases(text, file = '') {
  const re = [
    // Comparisons against one application's handle or name.
    /(==|!=|===|!==)\s*["'`]@?doa["'`]/i,
    /["'`]@?doa["'`]\s*(==|!=|===|!==)/i,
    /\bis_?doa\b/i,
    // Its Business and Project identifiers.
    /255afb6c-0f19-4867-9b96-28108ce416c9/,
    /84b0e8e6-fbda-417e-a537-19ad8574827a/,
  ];
  return text.split('\n').map((l, i) => ({ l, i }))
    .filter(({ l }) => re.some((r) => r.test(l)))
    .map(({ l, i }) => `${file}:${i + 1}: ${l.trim()}`);
}

describe('ADR-057 public Project contract', () => {
  it('PUBLIC_DEVELOPER_LEGACY_BUSINESS_ROUTES = 0', () => {
    const hits = legacyBusinessRoutes(read('services/api-gateway/internal/server/server.go'));
    assert.deepEqual(hits, [], `PUBLIC_DEVELOPER_LEGACY_BUSINESS_ROUTES = ${hits.length}`);
  });

  it('PUBLIC_SETTLEMENT_CALLER_PRICING_FIELDS = 0', () => {
    const hits = callerPricingFields();
    assert.deepEqual(hits, [], `PUBLIC_SETTLEMENT_CALLER_PRICING_FIELDS = ${hits.length}`);
  });

  it('SDK_BUSINESS_PROFILE_READERS = 0, and the readiness reader exists', () => {
    const client = read('sdk/typescript/src/client.ts');
    const hits = [
      ...(/\bgetBusinessMe\s*\(/.test(client) ? ['getBusinessMe()'] : []),
      ...(client.includes("'/integration'") ? ["'/integration'"] : []),
      ...(/\bBusinessProfile\b/.test(read('sdk/typescript/src/types.ts')) ? ['BusinessProfile'] : []),
    ];
    assert.deepEqual(hits, [], `SDK_BUSINESS_PROFILE_READERS = ${hits.length}`);
    assert.match(client, /getFinancialSetup\(/);
  });

  it('APPLICATION_IDENTITY_SPECIAL_CASES = 0 in source', () => {
    const hits = [];
    for (const f of files(['core', 'services', 'sdk/typescript/src', 'apps/admin', 'apps/website/lib',
      'apps/website/components', 'db/migrations'])) {
      if (!/\.(rs|go|ts|tsx|sql)$/.test(f)) continue;
      hits.push(...applicationIdentitySpecialCases(read(f), f));
    }
    assert.deepEqual(hits, [], `APPLICATION_IDENTITY_SPECIAL_CASES = ${hits.length}`);
  });

  it('nothing self-service classifies a Business Account', () => {
    // The Sandbox readiness route and the Console provisioner once promoted
    // every developer Business to APPLICATION. Classification is the operator's.
    const hits = [
      // Core's self-service readiness route writing a type (it may report one).
      ...occurrences(['core/api/src/routes/sandbox_business.rs'],
        /SET\s+business_account_type|business_account_type\s*=\s*'?(APPLICATION|PLATFORM)/i),
      // The Console provisioner asking core for one.
      ...occurrences(['services/developer-api/internal/coreclient/client.go'],
        /"business_account_type"\s*:/),
    ];
    assert.deepEqual(hits, []);
  });
});

// ── the counters must be able to fail ───────────────────────────────────────
describe('guard self-test: each counter fails on the defect it names', () => {
  it('a /business route is counted', () => {
    const word = 'busi' + 'ness';
    assert.equal(legacyBusinessRoutes(`\t\tr.Get("/v1/${word}/me", h.Me)`).length, 1);
    assert.equal(legacyBusinessRoutes(`\t\tr.Route("/${word}", func(r chi.Router) {`).length, 1);
    assert.equal(legacyBusinessRoutes('\t\tr.Get("/v1/financial-setup", h.F)').length, 0);
  });
  it('a caller rate field is counted, a comment about it is not', () => {
    assert.equal(callerPricingFieldsIn('  applicationFeeBps?: number;').length, 1);
    assert.equal(callerPricingFieldsIn('\tApplicationFeeBps uint32 `json:"application_fee_bps"`').length, 1);
    assert.equal(callerPricingFieldsIn('    pub application_fee_bps: Option<u32>,').length, 1);
    assert.equal(callerPricingFieldsIn('// application_fee_bps was withdrawn').length, 0);
  });
  it('a branch on one application is counted, content that names it is not', () => {
    assert.equal(applicationIdentitySpecialCases('if handle == "doa" {').length, 1);
    assert.equal(applicationIdentitySpecialCases("if (p.handle === '@doa') {").length, 1);
    assert.equal(applicationIdentitySpecialCases("WHERE id = '255afb6c-0f19-4867-9b96-28108ce416c9'").length, 1);
    assert.equal(applicationIdentitySpecialCases("examples: ['DOA', 'Vaquinha']").length, 0);
  });
});
