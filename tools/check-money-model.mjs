#!/usr/bin/env node
/**
 * MONEY-MODEL-001 (ADR-063) — the shape of the code that keeps a Banzami balance
 * an obligation with explicit backing.
 *
 * The behaviour is proved against a real database by
 * core/api/src/routes/money_model_tests.rs. This gate holds what a test cannot
 * see coming: a NEW path. It fails when
 *
 *   FINANCIAL_FLOAT_PATHS            money is computed in floating point in a
 *                                    financial crate or a Go service
 *   RECONCILIATION_DIRECT_LEDGER_WRITE the reconciliation crate writes financial
 *                                    state or posts to the ledger
 *   RECONCILIATION_REWRITES_LEDGER_HISTORY anything updates or deletes a ledger
 *                                    entry or posting, or 0033's triggers go
 *   MANUAL_BALANCE_PATCH_PATHS       a balance column appears, or code sets one
 *   UNCONFIRMED_EXTERNAL_FUNDING_CREATES_SPENDABLE_LIVE_VALUE
 *                                    a Core route that takes value from transit
 *                                    is not classified, or a Sandbox funding
 *                                    route stops refusing LIVE, or an acquirer's
 *                                    credit is reachable before confirmation
 *   AMBIGUOUS_EXTERNAL_RESULT_DOUBLE_SPEND_PATHS
 *                                    a SENT payout can be failed or returned
 *                                    without evidence, or processing moves backing
 *   UNCLASSIFIED_LEDGER_ACCOUNT_TYPES a system account role is missing from 0147
 *   PREMATURE_LEGAL_TERMS_PUBLIC     public copy calls a balance a deposit,
 *                                    electronic money or a bank account
 *
 *   node tools/check-money-model.mjs
 *
 * BZ_MONEY_MODEL_ROOT points it at a copy (tools/check-money-model.selftest.mjs).
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.BZ_MONEY_MODEL_ROOT ?? resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const walk = (dir, ext) => {
  const abs = join(ROOT, dir);
  if (!existsSync(abs)) return [];
  const out = [];
  for (const e of readdirSync(abs)) {
    if (e === 'target' || e === 'node_modules' || e.startsWith('.')) continue;
    const p = join(abs, e);
    if (statSync(p).isDirectory()) out.push(...walk(relative(ROOT, p), ext));
    else if (ext.some((x) => e.endsWith(x))) out.push(relative(ROOT, p));
  }
  return out;
};
/** Source with Rust `#[cfg(test)]` modules and line comments removed. */
const rustCode = (src) => {
  const i = src.search(/#\[cfg\(test\)\]\s*mod\s+\w+/);
  return (i >= 0 ? src.slice(0, i) : src).replace(/^\s*\/\/.*$/gm, '');
};
const isTestFile = (f) => /(_tests?\.rs|\/tests\/|_test\.go)$/.test(f) || f.includes('/tests/');

const counters = {};
const problems = [];
const fail = (key, msg) => { counters[key] = (counters[key] ?? 0) + 1; problems.push(`${key}: ${msg}`); };
const zero = (key) => { counters[key] ??= 0; };

// ── FINANCIAL_FLOAT_PATHS ───────────────────────────────────────────────────
zero('FINANCIAL_FLOAT_PATHS');
const FINANCIAL_CRATES = ['ledger', 'wallets', 'transfers', 'payouts', 'settlement', 'app-settlement', 'pricing', 'reconciliation',
  'transactions', 'consumer-wallets', 'acquiring', 'collections', 'payment-links', 'qr', 'types', 'api'];
// The one float the published contract carries: a Collections share as a decimal
// percent, converted once to exact basis points (collections/src/rules.rs).
const FLOAT_ALLOWED = [
  { file: 'core/collections/src/domain.rs', line: /pub percent: f64,/ },
  { file: 'core/collections/src/rules.rs', line: /fn percent_to_bps\(percent: f64\)|\(percent \* 100\.0\)\.round\(\)|\(\(bps \/ 100\.0\) - percent\)\.abs\(\)|percent <= 0\.0 \|\| percent > 100\.0/ },
];
for (const crate of FINANCIAL_CRATES) {
  for (const f of walk(`core/${crate}/src`, ['.rs'])) {
    if (isTestFile(f)) continue;
    rustCode(read(f)).split('\n').forEach((l, i) => {
      if (!/\bf(32|64)\b/.test(l)) return;
      if (FLOAT_ALLOWED.some((a) => a.file === f && a.line.test(l))) return;
      fail('FINANCIAL_FLOAT_PATHS', `${f}:${i + 1} ${l.trim()}`);
    });
  }
}
for (const f of walk('services', ['.go'])) {
  if (isTestFile(f)) continue;
  read(f).split('\n').forEach((l, i) => {
    if (/float(32|64)/.test(l) && /amount|minor|balance|fee_|money|\bkz\b|price/i.test(l) && !/never round-trip them through float64/.test(l)) {
      fail('FINANCIAL_FLOAT_PATHS', `${f}:${i + 1} ${l.trim()}`);
    }
  });
}

// ── RECONCILIATION_DIRECT_LEDGER_WRITE ──────────────────────────────────────
zero('RECONCILIATION_DIRECT_LEDGER_WRITE');
const authority = JSON.parse(read('db/authority/runtime-authority.json'));
const FIN = authority.financial_tables;
const finWrite = new RegExp(`\\b(insert\\s+into|update|delete\\s+from|truncate)\\s+(only\\s+)?(public\\.)?"?(${FIN.join('|')})\\b`, 'i');
for (const f of walk('core/reconciliation/src', ['.rs'])) {
  const code = rustCode(read(f));
  code.split('\n').forEach((l, i) => {
    if (finWrite.test(l)) fail('RECONCILIATION_DIRECT_LEDGER_WRITE', `${f}:${i + 1} writes financial state: ${l.trim()}`);
    if (/PostingBuilder|\.post\(|\.reverse\(/.test(l)) fail('RECONCILIATION_DIRECT_LEDGER_WRITE', `${f}:${i + 1} posts to the ledger: ${l.trim()}`);
  });
}
const cargo = read('core/reconciliation/Cargo.toml');
if (/banzami-(payouts|settlement|acquiring|wallets|transfers|consumer-wallets)\s*=/.test(cargo)) {
  fail('RECONCILIATION_DIRECT_LEDGER_WRITE', 'core/reconciliation depends on an engine that moves money');
}

// ── RECONCILIATION_REWRITES_LEDGER_HISTORY ──────────────────────────────────
zero('RECONCILIATION_REWRITES_LEDGER_HISTORY');
const history = /\b(update\s+(public\.)?ledger_(entries|postings)\b|delete\s+from\s+(public\.)?ledger_(entries|postings)\b|truncate\s+(table\s+)?(public\.)?ledger_(entries|postings)\b)/i;
for (const f of [...walk('core', ['.rs']), ...walk('services', ['.go']), ...walk('tools/ops', ['.mjs', '.sh', '.sql']), ...walk('infra/blueprint/sandbox-ops', ['.sh', '.sql'])]) {
  if (isTestFile(f)) continue;
  const code = f.endsWith('.rs') ? rustCode(read(f)) : read(f);
  code.split('\n').forEach((l, i) => {
    if (history.test(l) && !/^\s*(--|#|\/\/|\*)/.test(l)) fail('RECONCILIATION_REWRITES_LEDGER_HISTORY', `${f}:${i + 1} ${l.trim()}`);
  });
}
const immut = read('db/migrations/0033_ledger_immutability.sql');
for (const t of ['ledger_entries_immutable_on_update', 'ledger_entries_immutable_on_delete', 'ledger_postings_immutable_on_update', 'ledger_postings_immutable_on_delete']) {
  if (!immut.includes(`CREATE TRIGGER ${t}`)) fail('RECONCILIATION_REWRITES_LEDGER_HISTORY', `0033 no longer creates ${t}`);
}
for (const f of walk('db/migrations', ['.sql'])) {
  if (/DROP\s+TRIGGER\s+(IF\s+EXISTS\s+)?ledger_(entries|postings)_immutable/i.test(read(f))) {
    fail('RECONCILIATION_REWRITES_LEDGER_HISTORY', `${f} drops a ledger immutability trigger`);
  }
}

// ── MANUAL_BALANCE_PATCH_PATHS ──────────────────────────────────────────────
zero('MANUAL_BALANCE_PATCH_PATHS');
const WALLET_TABLES = ['ledger_accounts', 'wallets', 'consumer_wallets', 'wallet_accounts'];
for (const f of walk('db/migrations', ['.sql'])) {
  const sql = read(f);
  for (const t of WALLET_TABLES) {
    const create = new RegExp(`CREATE TABLE (IF NOT EXISTS )?${t}\\s*\\(([\\s\\S]*?)\\n\\);`, 'i').exec(sql);
    if (create && /\n\s*"?balance\w*"?\s+(BIGINT|INT|NUMERIC|DECIMAL|INTEGER)/i.test(create[2])) fail('MANUAL_BALANCE_PATCH_PATHS', `${f}: ${t} has a balance column`);
    if (new RegExp(`ALTER TABLE (IF EXISTS )?${t}[\\s\\S]{0,200}?ADD COLUMN (IF NOT EXISTS )?balance`, 'i').test(sql)) fail('MANUAL_BALANCE_PATCH_PATHS', `${f}: adds a balance column to ${t}`);
  }
}
for (const f of [...walk('core', ['.rs']), ...walk('services', ['.go']), ...walk('tools/ops', ['.mjs', '.sh'])]) {
  if (isTestFile(f)) continue;
  const code = f.endsWith('.rs') ? rustCode(read(f)) : read(f);
  code.split('\n').forEach((l, i) => {
    if (/\bSET\s+(available_)?balance\w*\s*=/i.test(l)) fail('MANUAL_BALANCE_PATCH_PATHS', `${f}:${i + 1} ${l.trim()}`);
  });
}

// ── UNCONFIRMED_EXTERNAL_FUNDING_CREATES_SPENDABLE_LIVE_VALUE ───────────────
zero('UNCONFIRMED_EXTERNAL_FUNDING_CREATES_SPENDABLE_LIVE_VALUE');
// Every Core route file that touches the transit account, and why that is safe.
const TRANSIT_USERS = {
  'core/api/src/routes/acquiring.rs': 'CONFIRMED_ONLY',        // credit only in settle_confirmed_payment, after the provider's callback or the Sandbox confirm
  'core/api/src/routes/consumer_wallets.rs': 'SANDBOX_ONLY',   // test_credit
  'core/api/src/routes/wallets.rs': 'SANDBOX_ONLY',            // sandbox_credit, admin_credit
  'core/api/src/routes/sandbox_funds.rs': 'SANDBOX_ONLY',      // retire: value goes BACK to transit
  'core/api/src/routes/sandbox_reset.rs': 'SANDBOX_ONLY',      // retire: value goes BACK to transit
  'core/api/src/routes/refunds.rs': 'VALUE_LEAVES',            // restitution of an acquired payment credits transit
  'core/api/src/routes/disputes.rs': 'VALUE_LEAVES',
  'core/api/src/routes/restitution.rs': 'VALUE_LEAVES',
};
const SANDBOX_FUNDING_FNS = {
  'core/api/src/routes/consumer_wallets.rs': ['test_credit'],
  'core/api/src/routes/wallets.rs': ['sandbox_credit', 'admin_credit'],
  'core/api/src/routes/sandbox_funds.rs': ['retire'],
  'core/api/src/routes/sandbox_reset.rs': ['reset'],
};
const fnBody = (src, name) => {
  const m = new RegExp(`pub async fn ${name}\\s*\\(`).exec(src);
  if (!m) return null;
  const next = src.slice(m.index + 1).search(/\n(pub )?(async )?fn /);
  return src.slice(m.index, next < 0 ? undefined : m.index + 1 + next);
};
for (const f of walk('core/api/src/routes', ['.rs'])) {
  if (isTestFile(f)) continue;
  const code = rustCode(read(f));
  if (!/transit_account_id/.test(code)) continue;
  if (!TRANSIT_USERS[f]) fail('UNCONFIRMED_EXTERNAL_FUNDING_CREATES_SPENDABLE_LIVE_VALUE', `${f} uses the transit account and is not classified`);
}
for (const [f, fns] of Object.entries(SANDBOX_FUNDING_FNS)) {
  const code = rustCode(read(f));
  for (const name of fns) {
    const body = fnBody(code, name);
    if (!body) { fail('UNCONFIRMED_EXTERNAL_FUNDING_CREATES_SPENDABLE_LIVE_VALUE', `${f}: ${name} not found`); continue; }
    const head = body.slice(0, 900);
    if (!/if\s+state\.environment\.is_live\(\)\s*\{[\s\S]{0,300}?return Err/.test(head)) {
      fail('UNCONFIRMED_EXTERNAL_FUNDING_CREATES_SPENDABLE_LIVE_VALUE', `${f}: ${name} does not refuse LIVE before it moves value`);
    }
  }
}
{
  const f = 'core/api/src/routes/acquiring.rs';
  const code = rustCode(read(f));
  const settle = fnBody(code, 'settle_confirmed_payment') ?? '';
  const debitSites = [...code.matchAll(/\("DEBIT",\s*state\.transit_account_id/g)].map((m) => m.index);
  const start = code.indexOf('pub async fn settle_confirmed_payment');
  for (const at of debitSites) {
    if (at < start || at > start + settle.length) fail('UNCONFIRMED_EXTERNAL_FUNDING_CREATES_SPENDABLE_LIVE_VALUE', `${f}: a transit debit outside settle_confirmed_payment`);
  }
  if (!/!matches!\(payment\.status, AcquiringPaymentStatus::Confirmed\)\s*\{\s*return Err/.test(settle)) {
    fail('UNCONFIRMED_EXTERNAL_FUNDING_CREATES_SPENDABLE_LIVE_VALUE', `${f}: settle_confirmed_payment no longer checks the payment is CONFIRMED`);
  }
}

// ── AMBIGUOUS_EXTERNAL_RESULT_DOUBLE_SPEND_PATHS ────────────────────────────
zero('AMBIGUOUS_EXTERNAL_RESULT_DOUBLE_SPEND_PATHS');
/** The implementation of a method (not its trait declaration): the first match whose body opens before a `;`. */
const implFn = (code, name) => {
  for (const m of code.matchAll(new RegExp(`async fn ${name}\\(`, 'g'))) {
    const rest = code.slice(m.index);
    const brace = rest.indexOf('{');
    const semi = rest.indexOf(';');
    if (brace >= 0 && (semi < 0 || brace < semi)) return /^[\s\S]*?\n    \}\n/.exec(rest)?.[0] ?? '';
  }
  return '';
};
{
  const f = 'core/payouts/src/engine.rs';
  const code = rustCode(read(f));
  const failFn = implFn(code, 'fail');
  if (!/payout\.status == PayoutStatus::Sent && evidence\.is_none\(\)[\s\S]{0,120}ExternalEvidenceRequired/.test(failFn)) {
    fail('AMBIGUOUS_EXTERNAL_RESULT_DOUBLE_SPEND_PATHS', `${f}: fail() restores a SENT payout without the rail's evidence`);
  }
  const returned = implFn(code, 'mark_returned');
  if (!/evidence\.is_empty\(\)[\s\S]{0,80}ExternalEvidenceRequired/.test(returned)) {
    fail('AMBIGUOUS_EXTERNAL_RESULT_DOUBLE_SPEND_PATHS', `${f}: mark_returned() restores a payout without the rail's evidence`);
  }
  const init = implFn(code, 'post_initiation');
  if (/\.credit\(self\.bank_account_id/.test(init) || !/\.credit\(in_flight, net\)/.test(init)) {
    fail('AMBIGUOUS_EXTERNAL_RESULT_DOUBLE_SPEND_PATHS', `${f}: processing moves the backing asset before the rail executes`);
  }
  const confirm = implFn(code, 'post_confirmation');
  if (!/\.credit\(self\.bank_account_id/.test(confirm)) {
    fail('AMBIGUOUS_EXTERNAL_RESULT_DOUBLE_SPEND_PATHS', `${f}: confirmation no longer extinguishes the obligation against the backing`);
  }
  // Nothing but the operator route fails or returns a payout: no timeout job.
  for (const g of walk('core', ['.rs'])) {
    if (isTestFile(g) || g === 'core/api/src/routes/payouts.rs' || g.startsWith('core/payouts/')) continue;
    const c = rustCode(read(g));
    if (/\.payout\s*\.\s*(fail|mark_returned)\(/.test(c)) fail('AMBIGUOUS_EXTERNAL_RESULT_DOUBLE_SPEND_PATHS', `${g} fails or returns payouts outside the operator route`);
  }
}

// ── UNCLASSIFIED_LEDGER_ACCOUNT_TYPES ───────────────────────────────────────
zero('UNCLASSIFIED_LEDGER_ACCOUNT_TYPES');
{
  const mig = read('db/migrations/0147_a_balance_is_an_obligation_and_backing_is_explicit.sql');
  const system = read('core/ledger/src/system.rs');
  const roles = [...system.matchAll(/Self::\w+ => "([A-Z_]+)"/g)].map((m) => m[1]);
  if (roles.length < 5) fail('UNCLASSIFIED_LEDGER_ACCOUNT_TYPES', 'core/ledger/src/system.rs names fewer than five system roles');
  for (const r of roles) if (!mig.includes(`('${r}',`)) fail('UNCLASSIFIED_LEDGER_ACCOUNT_TYPES', `role ${r} is not constrained by 0147`);
  for (const cls of ['PARTICIPANT_AVAILABLE', 'PARTICIPANT_RESERVED', 'BUSINESS_AVAILABLE', 'BUSINESS_RESERVED', 'UNOWNED_EMPTY', 'UNCLASSIFIED']) {
    if (!mig.includes(`'${cls}'`)) fail('UNCLASSIFIED_LEDGER_ACCOUNT_TYPES', `ledger_account_economic_classes no longer yields ${cls}`);
  }
  const position = read('core/reconciliation/src/position.rs');
  for (const cls of [...roles, 'PARTICIPANT_AVAILABLE', 'PARTICIPANT_RESERVED', 'BUSINESS_AVAILABLE', 'BUSINESS_RESERVED', 'UNOWNED_EMPTY']) {
    if (!position.includes(`"${cls}"`)) fail('UNCLASSIFIED_LEDGER_ACCOUNT_TYPES', `financial_position does not account for ${cls}`);
  }
}

// ── PREMATURE_LEGAL_TERMS_PUBLIC ────────────────────────────────────────────
// A Banzami balance is an obligation in the architecture; its LEGAL nature is
// unconfirmed (docs/regulatory/FUTURE_FINANCIAL_LIVE_OPERATING_MODEL.md §4.1).
// Public copy must not call it a deposit or electronic money, or a bank account.
zero('PREMATURE_LEGAL_TERMS_PUBLIC');
{
  const PUBLIC = [
    ...walk('apps/website/app', ['.tsx', '.ts', '.md', '.mdx']), ...walk('apps/website/components', ['.tsx', '.ts']),
    ...walk('apps/website/lib', ['.ts', '.tsx']), ...walk('apps/pay/app', ['.tsx', '.ts']),
    ...walk('docs/developer/openapi', ['.json', '.yaml', '.yml']),
  ].filter((f) => !/\.test\.|\/__tests__\//.test(f));
  if (existsSync(join(ROOT, 'sdk/typescript/README.md'))) PUBLIC.push('sdk/typescript/README.md');
  const TERMS = /\b(dep[oó]sitos?|deposits?|dinheiro\s+el[e]?ctr[oó]nico|moeda\s+el[e]?ctr[oó]nica|e-money|electronic\s+money|conta\s+banc[aá]ria\s+banzami|banzami\s+bank\s+account)\b/i;
  for (const f of PUBLIC) {
    read(f).split('\n').forEach((l, i) => {
      if (TERMS.test(l)) fail('PREMATURE_LEGAL_TERMS_PUBLIC', `${f}:${i + 1} ${l.trim().slice(0, 140)}`);
    });
  }
}

for (const p of problems) console.log(`  ✗ ${p}`);
for (const [k, v] of Object.entries(counters)) console.log(`${k}=${v}`);
const ok = problems.length === 0;
console.log(`MONEY_MODEL_CODE_SHAPE=${ok ? 'PASS' : 'FAIL'}`);
if (ok) console.log(' ✓ balances are obligations, backing is explicit, the boundary waits for the rail, reconciliation edits nothing');
process.exit(ok ? 0 : 1);
