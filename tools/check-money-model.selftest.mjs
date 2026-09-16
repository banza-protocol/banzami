#!/usr/bin/env node
/**
 * Mutation proof for tools/check-money-model.mjs (MONEY-MODEL-001).
 *
 * Each case copies what the gate reads into a scratch tree, breaks the money
 * model in one specific way, and requires the gate to fail on the counter that
 * names it.
 *
 *   node tools/check-money-model.selftest.mjs
 */
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const GATE = join(ROOT, 'tools/check-money-model.mjs');
const COPY = ['core', 'services', 'tools/ops', 'infra/blueprint/sandbox-ops', 'db/migrations', 'db/authority', 'apps/website/app', 'apps/website/components', 'apps/website/lib', 'apps/pay/app', 'docs/developer/openapi', 'sdk/typescript/README.md'];
const SKIP = /node_modules|\/target(\/|$)|\/\.git\/|\/\.sqlx\//;

function tree() {
  const dir = mkdtempSync(join(tmpdir(), 'bz-moneymodel-'));
  for (const p of COPY) cpSync(join(ROOT, p), join(dir, p), { recursive: true, filter: (s) => !SKIP.test(s) });
  return dir;
}
const edit = (dir, file, fn) => {
  const p = join(dir, file);
  const before = readFileSync(p, 'utf8');
  const after = fn(before);
  if (after === before) throw new Error(`mutation did not change ${file}`);
  writeFileSync(p, after);
};
const add = (dir, file, text) => { mkdirSync(dirname(join(dir, file)), { recursive: true }); writeFileSync(join(dir, file), text); };
const run = (dir) => {
  const r = spawnSync(process.execPath, [GATE], { env: { ...process.env, BZ_MONEY_MODEL_ROOT: dir }, encoding: 'utf8' });
  const counters = Object.fromEntries([...(r.stdout ?? '').matchAll(/^([A-Z_]+)=(\S+)$/gm)].map((m) => [m[1], m[2]]));
  return { code: r.status, counters, out: `${r.stdout}${r.stderr}` };
};
const fails = (key) => (c) => c.code !== 0 && Number(c.counters[key]) >= 1;

const CASES = [
  { name: 'baseline copy passes', mutate: () => {}, expect: (c) => c.code === 0 && c.counters.MONEY_MODEL_CODE_SHAPE === 'PASS' },
  {
    name: 'a withdrawal fee computed in floating point',
    mutate: (d) => edit(d, 'core/payouts/src/engine.rs', (s) => s.replace('let fee = resolution.fee_minor;', 'let fee = ((gross.amount_minor() as f64) * 0.0075) as i64;')),
    expect: fails('FINANCIAL_FLOAT_PATHS'),
  },
  {
    name: 'a Go service carries an amount as float64',
    mutate: (d) => add(d, 'services/public-api/internal/handler/float_amount.go', 'package handler\n\ntype bad struct {\n\tAmountMinor float64 `json:"amount_minor"`\n}\n'),
    expect: fails('FINANCIAL_FLOAT_PATHS'),
  },
  {
    name: 'reconciliation "corrects" the ledger',
    mutate: (d) => edit(d, 'core/reconciliation/src/boundary.rs', (s) => s.replace('    tx.commit().await?;\n    Ok(BoundaryRun {', '    sqlx::query("INSERT INTO ledger_postings (id, description, idempotency_key) VALUES (gen_random_uuid(), \'fix\', \'fix\')").execute(&mut *tx).await?;\n    tx.commit().await?;\n    Ok(BoundaryRun {')),
    expect: fails('RECONCILIATION_DIRECT_LEDGER_WRITE'),
  },
  {
    name: 'an operator script deletes ledger entries',
    mutate: (d) => add(d, 'tools/ops/fix-balance.sh', '#!/bin/sh\npsql -c "DELETE FROM ledger_entries WHERE posting_id = $1"\n'),
    expect: fails('RECONCILIATION_REWRITES_LEDGER_HISTORY'),
  },
  {
    name: 'a migration drops ledger immutability',
    mutate: (d) => add(d, 'db/migrations/9999_repair.sql', 'DROP TRIGGER IF EXISTS ledger_entries_immutable_on_update ON ledger_entries;\n'),
    expect: fails('RECONCILIATION_REWRITES_LEDGER_HISTORY'),
  },
  {
    name: 'a wallet gains a balance column',
    mutate: (d) => add(d, 'db/migrations/9998_cache.sql', 'ALTER TABLE wallets ADD COLUMN balance_minor BIGINT NOT NULL DEFAULT 0;\n'),
    expect: fails('MANUAL_BALANCE_PATCH_PATHS'),
  },
  {
    name: 'Sandbox test funding stops refusing LIVE',
    mutate: (d) => edit(d, 'core/api/src/routes/consumer_wallets.rs', (s) => s.replace(/    if state\.environment\.is_live\(\) \{\n        tracing::error!\("test_credit called in LIVE environment — rejected"\);/, '    if false {\n        tracing::error!("test_credit called in LIVE environment — rejected");')),
    expect: fails('UNCONFIRMED_EXTERNAL_FUNDING_CREATES_SPENDABLE_LIVE_VALUE'),
  },
  {
    name: 'a new route takes value from transit unclassified',
    mutate: (d) => add(d, 'core/api/src/routes/instant_topup.rs', 'pub async fn topup(state: AppState) { let _ = state.transit_account_id; }\n'),
    expect: fails('UNCONFIRMED_EXTERNAL_FUNDING_CREATES_SPENDABLE_LIVE_VALUE'),
  },
  {
    name: 'an acquiring payment is credited before it is confirmed',
    mutate: (d) => edit(d, 'core/api/src/routes/acquiring.rs', (s) => s.replace('if !matches!(payment.status, AcquiringPaymentStatus::Confirmed) {', 'if false {')),
    expect: fails('UNCONFIRMED_EXTERNAL_FUNDING_CREATES_SPENDABLE_LIVE_VALUE'),
  },
  {
    name: 'a SENT payout is failed on a timeout',
    mutate: (d) => edit(d, 'core/payouts/src/engine.rs', (s) => s.replace('if payout.status == PayoutStatus::Sent && evidence.is_none() {', 'if false {')),
    expect: fails('AMBIGUOUS_EXTERNAL_RESULT_DOUBLE_SPEND_PATHS'),
  },
  {
    name: 'processing a payout moves the backing asset',
    mutate: (d) => edit(d, 'core/payouts/src/engine.rs', (s) => s.replace('.credit(in_flight, net)', '.credit(self.bank_account_id, net)')),
    expect: fails('AMBIGUOUS_EXTERNAL_RESULT_DOUBLE_SPEND_PATHS'),
  },
  {
    name: 'a background job fails stale payouts',
    mutate: (d) => add(d, 'core/jobs/src/payout_timeouts.rs', 'async fn sweep(state: &AppState, id: PayoutId) { let _ = state.payout.fail(id, "timeout".into(), None).await; }\n'),
    expect: fails('AMBIGUOUS_EXTERNAL_RESULT_DOUBLE_SPEND_PATHS'),
  },
  {
    name: 'public copy calls a balance electronic money',
    mutate: (d) => add(d, 'apps/website/app/suporte/money.tsx', 'export const A = () => <p>O saldo Banzami é dinheiro electrónico garantido.</p>;\n'),
    expect: fails('PREMATURE_LEGAL_TERMS_PUBLIC'),
  },
  {
    name: 'a system role that 0147 does not constrain',
    mutate: (d) => edit(d, 'core/ledger/src/system.rs', (s) => s.replace('Self::ExternalCosts => "EXTERNAL_COSTS",', 'Self::ExternalCosts => "EXTERNAL_COSTS_V2",')),
    expect: fails('UNCLASSIFIED_LEDGER_ACCOUNT_TYPES'),
  },
];

let failed = 0;
for (const c of CASES) {
  const dir = tree();
  try {
    c.mutate(dir);
    const r = run(dir);
    const ok = c.expect(r);
    console.log(`  ${ok ? '✓' : '✗'} ${c.name}`);
    if (!ok) { failed++; console.log(r.out.split('\n').slice(-14).join('\n')); }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
console.log(`MONEY_MODEL_GATE_SELFTEST=${failed === 0 ? 'PASS' : 'FAIL'} (${CASES.length - failed}/${CASES.length})`);
process.exit(failed === 0 ? 0 : 1);
