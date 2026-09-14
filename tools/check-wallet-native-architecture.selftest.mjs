#!/usr/bin/env node
/**
 * Mutation proof for tools/check-wallet-native-architecture.mjs.
 *
 * Each case copies what the gate reads into a scratch tree and breaks the
 * architecture in one specific way — an internal movement that starts to depend
 * on a rail, a rail operation that stops asking, a second financial writer, a
 * provider name in a native contract, a claim to bypass banks, a Live key — and
 * requires the gate to fail on the counter that names it.
 *
 *   node tools/check-wallet-native-architecture.selftest.mjs
 */
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const GATE = join(ROOT, 'tools/check-wallet-native-architecture.mjs');
const COPY = [
  'core/api/src', 'core/transfers/Cargo.toml', 'core/ledger/Cargo.toml', 'core/wallets/Cargo.toml', 'core/qr/Cargo.toml',
  'db/migrations/0144_value_moves_inside_external_rails_are_boundaries.sql',
  'services/api-gateway/internal', 'services/public-api/internal', 'tools/ops', 'docs/developer/openapi',
  'sdk/typescript/src', 'sdk/typescript/README.md', 'README.md', 'apps/website/app/faq', 'apps/website/lib',
  'quality/operator-assurance-manifest.yaml', 'docs/adr/ADR-061-wallet-native-rail-decoupled-financial-network.md',
];
function tree() {
  const dir = mkdtempSync(join(tmpdir(), 'bz-walletnative-'));
  for (const p of COPY) cpSync(join(ROOT, p), join(dir, p), { recursive: true, filter: (s) => !/node_modules|\/target\//.test(s) });
  return dir;
}
const edit = (dir, file, fn) => {
  const p = join(dir, file);
  const before = readFileSync(p, 'utf8');
  const after = fn(before);
  if (after === before) throw new Error(`mutation did not change ${file}`);
  writeFileSync(p, after);
};
const run = (dir) => {
  const r = spawnSync(process.execPath, [GATE], { env: { ...process.env, BZ_WALLET_NATIVE_ROOT: dir }, encoding: 'utf8' });
  const counters = Object.fromEntries([...(r.stdout ?? '').matchAll(/^([A-Z_]+)=(\S+)$/gm)].map((m) => [m[1], m[2]]));
  return { code: r.status, counters, out: `${r.stdout}${r.stderr}` };
};
const fails = (key) => (c) => c.code !== 0 && Number(c.counters[key]) >= 1;

const CASES = [
  { name: 'baseline copy passes', mutate: () => {}, expect: (c) => c.code === 0 && c.counters.WALLET_NATIVE_ARCHITECTURE === 'PASS' },
  {
    name: 'P2P crate starts depending on the acquiring rail',
    mutate: (d) => edit(d, 'core/transfers/Cargo.toml', (s) => s.replace(/^banzami-ledger\s*=/m, 'banzami-acquiring = { path = "../acquiring" }\nbanzami-ledger =')),
    expect: fails('RAIL_DEPENDENCY_IN_INTERNAL_CRATES'),
  },
  {
    name: 'a wallet transfer route starts asking the external rail',
    mutate: (d) => edit(d, 'core/api/src/routes/transfers.rs', (s) => s.replace('pub async fn send_p2p(', 'async fn _rail(state: &AppState, m: uuid::Uuid) { let _ = crate::routes::external_rail::require_external_rail(state, m).await; }\n\npub async fn send_p2p(')),
    expect: fails('RAIL_CHECK_IN_INTERNAL_ROUTES'),
  },
  {
    name: 'a payout is confirmed without asking the rail',
    mutate: (d) => edit(d, 'core/api/src/routes/payouts.rs', (s) => s.replace(/pub async fn confirm\([\s\S]*?\n}\n/, (fn) => fn.replace(/[^\n]*require_external_rail[^\n]*\n/, ''))),
    expect: fails('RAIL_CHECK_IN_INTERNAL_ROUTES'),
  },
  {
    name: 'the gateway writes a wallet balance directly',
    mutate: (d) => edit(d, 'services/api-gateway/internal/service/core_client.go', (s) => `${s}\n// const hotfix = \`UPDATE wallets SET status = 'ACTIVE'\`\nconst hotfix = "UPDATE wallets SET status = 'ACTIVE' WHERE id = $1"\n`),
    expect: fails('FINANCIAL_WRITES_OUTSIDE_CORE'),
  },
  {
    name: 'an operator script deletes ledger entries',
    mutate: (d) => edit(d, 'tools/ops/retire-synthetic-residue.sh', (s) => `${s}\nq "DELETE FROM ledger_entries WHERE false"\n`),
    expect: fails('FINANCIAL_WRITES_OUTSIDE_CORE'),
  },
  {
    name: 'Core stops identifying itself as the financial writer',
    mutate: (d) => edit(d, 'core/api/src/main.rs', (s) => s.replace('.application_name(CORE_APPLICATION_NAME)', '')),
    expect: fails('CORE_WRITER_IDENTITY_MISSING'),
  },
  {
    name: 'the guard migration stops covering the ledger postings',
    mutate: (d) => edit(d, 'db/migrations/0144_value_moves_inside_external_rails_are_boundaries.sql', (s) => s.replace("'ledger_postings', ", '')),
    expect: fails('CORE_WRITER_IDENTITY_MISSING'),
  },
  {
    name: 'a provider identifier appears in a native API schema',
    mutate: (d) => edit(d, 'docs/developer/openapi/banzami-sandbox.openapi.json', (s) => {
      const j = JSON.parse(s); j.components.schemas.TestPayment.properties.external_ref = { type: 'string' }; return JSON.stringify(j, null, 2);
    }),
    expect: fails('PUBLIC_NATIVE_API_PROVIDER_LEAKAGE'),
  },
  {
    name: 'an SDK type names the provider',
    mutate: (d) => edit(d, 'sdk/typescript/src/types.ts', (s) => `${s}\nexport interface TestPaymentRail { provider: 'MULTICAIXA' }\n`),
    expect: fails('PUBLIC_NATIVE_API_PROVIDER_LEAKAGE'),
  },
  {
    name: 'the FAQ says Banzami works without banks',
    mutate: (d) => edit(d, 'apps/website/app/faq/page.tsx', (s) => s.replace("q: 'Existe uma API?',", "q: 'O Banzami é independente do sistema bancário?',")),
    expect: fails('RAIL_DECOUPLING_REGULATORY_BYPASS_CLAIMS'),
  },
  {
    name: 'the SDK README claims a licence',
    mutate: (d) => edit(d, 'sdk/typescript/README.md', (s) => s.replace('# @banzami/sdk', '# @banzami/sdk\n\nBanzami is a licensed PSP.')),
    expect: fails('RAIL_DECOUPLING_REGULATORY_BYPASS_CLAIMS'),
  },
  {
    name: 'a Live developer key is accepted',
    mutate: (d) => edit(d, 'services/api-gateway/internal/middleware/developer_auth.go', (s) => s.replace('[]string{"bz_test_sk_", "bz_test_pk_"}', '[]string{"bz_test_sk_", "bz_test_pk_", "bz_live_sk_"}')),
    expect: fails('LIVE_EXECUTION_ENABLED'),
  },
  {
    name: 'the README restates the model without "not rail-free"',
    mutate: (d) => edit(d, 'README.md', (s) => s.replace(/rail-decoupled, not\s+rail-free,/, 'rail-decoupled,')),
    expect: fails('WALLET_NATIVE_CONCEPT_CONTRADICTIONS'),
  },
  {
    name: 'a test seed that writes a wallet does not count',
    mutate: (d) => writeFileSync(join(d, 'services/api-gateway/internal/service/seed_wallet_test.go'), 'package service\n\nconst seed = "INSERT INTO wallets (id) VALUES ($1)"\n'),
    expect: (c) => c.code === 0,
  },
];

let failed = 0;
for (const k of CASES) {
  const dir = tree();
  try {
    k.mutate(dir);
    const r = run(dir);
    const ok = k.expect(r);
    console.log(`  ${ok ? '✓' : '✗'} ${k.name}${ok ? '' : `\n      exit ${r.code} ${JSON.stringify(r.counters)}\n${r.out.split('\n').filter((l) => /✗/.test(l)).slice(0, 5).join('\n')}`}`);
    if (!ok) failed += 1;
  } catch (e) {
    console.log(`  ✗ ${k.name}: ${e.message}`);
    failed += 1;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
console.log(`\nWALLET_NATIVE_ARCHITECTURE_MUTATIONS=${CASES.length - 2}`);
console.log(`WALLET_NATIVE_ARCHITECTURE_SELFTEST=${failed === 0 ? 'PASS' : 'FAIL'}`);
process.exit(failed ? 1 : 0);
