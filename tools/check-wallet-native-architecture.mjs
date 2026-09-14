#!/usr/bin/env node
/**
 * WALLET-NATIVE-001 / ADR-061 — the architecture, held by the build.
 *
 * The behaviour is proven by tests that run against a real database
 * (core/api/src/routes/external_rail_tests.rs, core/ledger/tests/
 * financial_writer_guard.rs, services/api-gateway/internal/handler/
 * sandbox_external_rail_test.go) and by the deployed scenario suite. This gate
 * keeps the structure those tests rely on from eroding between runs:
 *
 *   RAIL_DEPENDENCY_IN_INTERNAL_CRATES   a crate that moves value inside the network
 *                                        depends on a rail crate (acquiring, routing, payouts)
 *   RAIL_CHECK_IN_INTERNAL_ROUTES        a Core route that moves value inside the network
 *                                        calls the rail boundary or the acquiring provider
 *   FINANCIAL_WRITES_OUTSIDE_CORE        non-test code outside core/ writes a table the
 *                                        0144 guard protects
 *   CORE_WRITER_IDENTITY_MISSING         Core no longer connects as banzami-core, or the
 *                                        guard migration no longer names the ledger tables
 *   PUBLIC_NATIVE_API_PROVIDER_LEAKAGE   a provider name or provider identifier in the
 *                                        OpenAPI or the SDK's public types
 *   RAIL_DECOUPLING_REGULATORY_BYPASS_CLAIMS  public copy saying Banzami bypasses or replaces
 *                                        banks or EMIS, holds a licence, or is unregulated
 *   LIVE_EXECUTION_ENABLED               a bz_live_ key accepted, or a public capability live
 *
 *   node tools/check-wallet-native-architecture.mjs
 *   BZ_WALLET_NATIVE_ROOT=/tmp/copy node tools/check-wallet-native-architecture.mjs   (selftest)
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.BZ_WALLET_NATIVE_ROOT ?? resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const exists = (p) => existsSync(join(ROOT, p));
const walk = (dir, re) => {
  if (!exists(dir)) return [];
  return readdirSync(join(ROOT, dir), { recursive: true }).map(String)
    .filter((f) => re.test(f) && !/node_modules|\/target\/|\.next\/|\/dist\//.test(f))
    .map((f) => `${dir}/${f}`)
    .filter((f) => statSync(join(ROOT, f)).isFile());
};

const findings = {
  RAIL_DEPENDENCY_IN_INTERNAL_CRATES: [],
  RAIL_CHECK_IN_INTERNAL_ROUTES: [],
  FINANCIAL_WRITES_OUTSIDE_CORE: [],
  CORE_WRITER_IDENTITY_MISSING: [],
  PUBLIC_NATIVE_API_PROVIDER_LEAKAGE: [],
  RAIL_DECOUPLING_REGULATORY_BYPASS_CLAIMS: [],
  LIVE_EXECUTION_ENABLED: [],
  WALLET_NATIVE_CONCEPT_CONTRADICTIONS: [],
};

// ── 1. crates that move value inside the network ──────────────────────────────
const INTERNAL_CRATES = ['ledger', 'wallets', 'transfers', 'transactions', 'app-settlement', 'collections', 'payment-links', 'qr', 'consumer-wallets', 'settlement'];
const RAIL_CRATES = ['banzami-acquiring', 'banzami-routing', 'banzami-payouts'];
for (const c of INTERNAL_CRATES) {
  const toml = `core/${c}/Cargo.toml`;
  if (!exists(toml)) continue;
  const deps = read(toml);
  for (const r of RAIL_CRATES) {
    if (new RegExp(`^${r}\\s*=`, 'm').test(deps)) findings.RAIL_DEPENDENCY_IN_INTERNAL_CRATES.push(`core/${c} depends on ${r}`);
  }
}

// ── 2. Core routes that move value inside the network ─────────────────────────
const INTERNAL_ROUTES = ['transfers', 'wallet_payments', 'qr_pay', 'payment_links', 'payment_sessions', 'refunds', 'application_settlements', 'wallet_account_transfers', 'splits', 'collections'];
for (const r of INTERNAL_ROUTES) {
  const f = `core/api/src/routes/${r}.rs`;
  if (!exists(f)) continue;
  const code = read(f).replace(/\/\/[^\n]*/g, '');
  for (const [re, why] of [[/require_external_rail|sandbox_rail_state/, 'asks the external rail'], [/state\.acquiring\.(initiate_payment|generate_test_callback)/, 'calls the acquiring provider']]) {
    if (re.test(code)) findings.RAIL_CHECK_IN_INTERNAL_ROUTES.push(`${f} ${why}`);
  }
}
// And the rail-dependent ones still ask.
for (const [f, fn] of [['core/api/src/routes/acquiring.rs', 'initiate_payment'], ['core/api/src/routes/acquiring.rs', 'test_confirm'], ['core/api/src/routes/payouts.rs', 'mark_sent'], ['core/api/src/routes/payouts.rs', 'confirm']]) {
  const src = exists(f) ? read(f) : '';
  const m = src.match(new RegExp(`pub async fn ${fn}\\([\\s\\S]*?\\n}\\n`));
  if (!m || !/require_external_rail/.test(m[0])) findings.RAIL_CHECK_IN_INTERNAL_ROUTES.push(`${f}:${fn} crosses an external rail and no longer asks it`);
}

// ── 3. the guarded tables, and who writes them ────────────────────────────────
const MIGRATION = 'db/migrations/0144_value_moves_inside_external_rails_are_boundaries.sql';
const guarded = exists(MIGRATION)
  ? [...(read(MIGRATION).match(/FOREACH t IN ARRAY ARRAY\[([\s\S]*?)\]/)?.[1] ?? '').matchAll(/'([a-z_]+)'/g)].map((m) => m[1])
  : [];
for (const t of ['ledger_accounts', 'ledger_postings', 'ledger_entries', 'wallets', 'wallet_accounts', 'transfers', 'payouts']) {
  if (!guarded.includes(t)) findings.CORE_WRITER_IDENTITY_MISSING.push(`${MIGRATION} no longer guards ${t}`);
}
const main = exists('core/api/src/main.rs') ? read('core/api/src/main.rs') : '';
if (!/application_name\(CORE_APPLICATION_NAME\)/.test(main) || !/CORE_APPLICATION_NAME: &str = "banzami-core"/.test(main)) {
  findings.CORE_WRITER_IDENTITY_MISSING.push('core/api/src/main.rs no longer connects as application_name banzami-core');
}
const writeRe = guarded.length ? new RegExp(`\\b(?:INSERT\\s+INTO|UPDATE|DELETE\\s+FROM|TRUNCATE(?:\\s+TABLE)?|COPY)\\s+(?:public\\.)?(${guarded.join('|')})\\b`, 'gi') : null;
const NON_CORE = [
  ...walk('services', /\.go$/).filter((f) => !f.endsWith('_test.go')),
  ...walk('apps', /\.(ts|tsx|mjs|js)$/).filter((f) => !/\.test\.|\/e2e\//.test(f)),
  ...walk('tools', /\.(mjs|js|sh|sql|py)$/).filter((f) => !/selftest|check-wallet-native-architecture/.test(f)),
  ...walk('tests', /\.(sh|mjs|sql)$/).filter((f) => !/\.test\.mjs$/.test(f)),
  ...walk('sdk', /\.(ts|mjs|js|dart)$/),
  ...walk('infra', /\.(sh|sql)$/),
];
for (const f of NON_CORE) {
  if (!writeRe) break;
  const src = read(f);
  for (const m of src.matchAll(writeRe)) {
    const line = src.slice(0, m.index).split('\n').length;
    findings.FINANCIAL_WRITES_OUTSIDE_CORE.push(`${f}:${line} ${m[0].replace(/\s+/g, ' ')}`);
  }
}

// ── 4. provider leakage into native public contracts ──────────────────────────
const PROVIDER = /\b(EMIS|MULTICAIXA|Multicaixa|provider_ref|external_ref|provider_status|bank_code|entity_number)\b/;
const openapi = exists('docs/developer/openapi/banzami-sandbox.openapi.json') ? JSON.parse(read('docs/developer/openapi/banzami-sandbox.openapi.json')) : { paths: {}, components: { schemas: {} } };
for (const [name, schema] of Object.entries(openapi.components?.schemas ?? {})) {
  const props = JSON.stringify(Object.keys(schema.properties ?? {})) + JSON.stringify(schema.properties ?? {}).replace(/"description":"[^"]*"/g, '');
  if (PROVIDER.test(props)) findings.PUBLIC_NATIVE_API_PROVIDER_LEAKAGE.push(`OpenAPI schema ${name}: ${props.match(PROVIDER)[0]}`);
}
for (const f of ['sdk/typescript/src/types.ts', 'sdk/typescript/src/realtime.ts', 'sdk/typescript/src/sandbox.ts']) {
  if (!exists(f)) continue;
  const code = read(f).replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
  const m = code.match(PROVIDER);
  if (m) findings.PUBLIC_NATIVE_API_PROVIDER_LEAKAGE.push(`${f}: ${m[0]}`);
}

// ── 5. public copy: decoupled from rails, never above the law ─────────────────
const BYPASS = /independente d[oa]s? (?:sistema banc[aá]rio|bancos)|independent of (?:the )?bank(?:ing system|s)|sem (?:precisar d[eo]s? )?(?:bancos|EMIS)\b|(?:substitu\w+|contorn\w+|dispensa\w*) (?:os )?(?:bancos|a EMIS|o EMIS)|replac\w+ (?:the )?banks|bypass\w* (?:the )?(?:banks|EMIS|payment infrastructure|regulation)|(?:PSP|prestador de servi[cç]os de pagamento) (?:licenciad|autorizad)\w*|licensed PSP|institui[cç][aã]o de moeda eletr[oó]nica|electronic money institution|n[aã]o regulad|unregulated money|dinheiro n[aã]o regulado/i;
const PUBLIC_COPY = [
  ...walk('apps/website/app', /\.(tsx|ts)$/).filter((f) => !/\.test\./.test(f)),
  ...walk('apps/pay/app', /\.(tsx|ts)$/).filter((f) => !/\.test\./.test(f)),
  'docs/developer/openapi/banzami-sandbox.openapi.json',
  ...walk('apps/website/components', /\.tsx$/).filter((f) => !/\.test\./.test(f)),
  ...walk('apps/website/lib', /\.ts$/).filter((f) => !/\.test\./.test(f)),
  'sdk/typescript/README.md', 'README.md',
].filter((f) => exists(f) && !/search-index|claims\.json/.test(f));
for (const f of PUBLIC_COPY) {
  const src = read(f).replace(/\{\/\*[\s\S]*?\*\/\}|\/\*[\s\S]*?\*\/|(^|[^:'"`])\/\/[^\n]*/g, '$1');
  const m = src.match(BYPASS);
  if (m) findings.RAIL_DECOUPLING_REGULATORY_BYPASS_CLAIMS.push(`${f}: "${m[0]}"`);
}

// ── 6. Financial Live stays closed ────────────────────────────────────────────
const auth = exists('services/api-gateway/internal/middleware/developer_auth.go') ? read('services/api-gateway/internal/middleware/developer_auth.go') : '';
const prefixes = auth.match(/DeveloperKeyPrefixes = \[\]string\{([^}]*)\}/)?.[1] ?? '';
if (/bz_live_/.test(prefixes) || !prefixes) findings.LIVE_EXECUTION_ENABLED.push(`developer key prefixes: ${prefixes || '(not found)'}`);
if (!/strings\.HasPrefix\(raw, "bz_live_"\)/.test(auth)) findings.LIVE_EXECUTION_ENABLED.push('the developer key path no longer refuses bz_live_ before any lookup');
const manifest = exists('quality/operator-assurance-manifest.yaml') ? read('quality/operator-assurance-manifest.yaml') : '';
if (manifest.split(/\n\s*- id: /).some((b) => /public_status:\s*public/.test(b) && /^\s*live:\s*true\b/m.test(b))) findings.LIVE_EXECUTION_ENABLED.push('a public capability declares live: true');

// ── 7. one canonical statement of the model ───────────────────────────────────
// WALLET-NATIVE-001 §87: the paragraph is the model's single wording. Where it is
// quoted it is quoted whole — a README that drops "not rail-free" or "does not
// bypass regulatory requirements" states a different model.
const CANONICAL = 'Banzami is designed as a wallet-native, ledger-native financial network. Once value is represented inside the Banzami network, eligible transfers and payments between Banzami participants are executed natively through the Banzami Core and ledger rather than requiring an external payment rail for every movement. External rails remain essential interoperability boundaries for funding, withdrawal, external settlement and other rail-dependent operations. This architecture is rail-decoupled, not rail-free, and does not bypass regulatory requirements. Public Sandbox models this architecture with fictitious value; Financial Live remains unavailable and fail-closed until the applicable regulatory, contractual and operational requirements are met.';
const flat = (t) => t.replace(/^>\s?/gm, '').replace(/\s+/g, ' ');
for (const f of ['README.md', 'docs/adr/ADR-061-wallet-native-rail-decoupled-financial-network.md']) {
  if (!exists(f) || !flat(read(f)).includes(CANONICAL)) findings.WALLET_NATIVE_CONCEPT_CONTRADICTIONS.push(`${f}: the canonical wallet-native paragraph is missing or reworded`);
}

let failed = 0;
for (const [k, list] of Object.entries(findings)) {
  console.log(`${k}=${list.length}`);
  for (const l of list.slice(0, 15)) console.log(`  ✗ ${l}`);
  failed += list.length;
}
console.log(`GUARDED_FINANCIAL_TABLES=${guarded.length}`);
console.log(`NON_CORE_FILES_SCANNED=${NON_CORE.length}`);
console.log(`PUBLIC_COPY_FILES_SCANNED=${PUBLIC_COPY.length}`);
console.log(`WALLET_NATIVE_ARCHITECTURE=${failed ? 'FAIL' : 'PASS'}`);
if (!failed) console.log('\n✓ value moves inside Banzami through Core alone; external rails are boundaries; Live stays closed');
process.exit(failed ? 1 : 0);
