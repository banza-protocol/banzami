#!/usr/bin/env node
/**
 * check-merchant-credit-policy-coverage.mjs — every path that can credit a
 * merchant must either apply the Sandbox merchant-credit policy or say, in one
 * place, why it does not.
 *
 * Owner decision D1 replaced a lifetime cumulative merchant-credit counter with
 * rolling windows AND wired them into the payment paths for the first time. The
 * counter had existed for months while `check_volume` had no caller at all, so
 * the policy was documented and unenforced. That is the failure this guard
 * exists to make impossible a second time:
 *
 *   a new payment surface credits a merchant and nobody wires the gate — the
 *     limit silently stops covering the newest way to pay, which is exactly the
 *     way most likely to need it.
 *
 * It works by enumeration, not by faith: every site in core/ that writes a
 * CREDIT which can land on a merchant account is listed below with its
 * disposition, and the guard checks the source still matches the claim. Adding a
 * new credit site without a disposition fails.
 *
 * Usage: node tools/check-merchant-credit-policy-coverage.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
let failures = 0;
const fail = (m) => { console.error(`  ✗ ${m}`); failures += 1; };
const pass = (m) => console.log(`  ✓ ${m}`);

// The gate as it is actually CALLED. A bare substring was the first version and
// it was too loose: renaming the call to `check_merchant_credit_REMOVED(` still
// contained it, so the mutation test passed when it should have failed. Match
// the qualified call so a rename, a comment-out or a deletion all register.
const GATE = 'pilot_enforce::check_merchant_credit(';

/**
 * Every merchant-credit path in core/, and what it does about the policy.
 *
 * `gated`  — calls the gate before posting. The guard asserts the call is there.
 * `exempt` — deliberately not gated. The reason is part of the record, and a
 *            reason that is merely "it was hard" would not survive review here.
 */
const PATHS = [
  { file: 'core/transfers/src/engine.rs', disposition: 'gated',
    what: 'THE chokepoint — wallet-native merchant payments: payment links, QR, Business Receive Point, Collection shares' },
  { file: 'core/api/src/routes/qr_pay.rs', disposition: 'gated',
    what: 'QR scan paying a merchant posts its own credit rather than going through the transfer engine' },
  { file: 'core/api/src/routes/acquiring.rs', disposition: 'gated',
    what: 'hosted acquiring — gated at INITIATION (see below)' },

  { file: 'core/api/src/routes/consumer_pay_links.rs', disposition: 'exempt',
    reason: 'credits consumer_wallets, never a merchant wallet — consumer-to-consumer only' },
  { file: 'core/api/src/routes/wallets.rs', disposition: 'exempt',
    reason: 'operator wallet credit: a deliberate, audited, step-up-gated admin correction. A capacity policy must not stand between an operator and a correction they have already been authorised to make' },
  { file: 'core/api/src/routes/restitution.rs', disposition: 'exempt',
    reason: 'returns value to a merchant that was already inside the perimeter and already counted when it first arrived — gating it would strand a restitution' },
  { file: 'core/api/src/routes/sandbox_funds.rs', disposition: 'exempt',
    reason: 'retirement posts a DEBIT on the owner; it removes value rather than crediting a merchant' },
  { file: 'core/api/src/routes/wallet_account_transfers.rs', disposition: 'exempt',
    reason: 'moves value between accounts of the SAME wallet — the owner already holds it, and it was counted on arrival' },
  { file: 'core/app-settlement/src/engine.rs', disposition: 'exempt',
    reason: 'internal settlement between accounts already inside the network perimeter (ADR-029); no new value reaches a merchant from outside' },
  { file: 'core/wallets/src/engine.rs', disposition: 'exempt',
    reason: 'reserved to available is a reclassification of the merchant own already-counted value; refusing it would strand funds the merchant is owed' },
  { file: 'core/consumer-wallets/src/engine.rs', disposition: 'exempt',
    reason: 'consumer wallets only' },
  { file: 'core/api/src/routes/consumer_wallets.rs', disposition: 'exempt',
    reason: 'consumer funding and test credit — gated by check_funding (consumer balance + aggregate funds caps); credits a consumer wallet, never a merchant' },
  { file: 'core/consumer-wallets/src/funding.rs', disposition: 'exempt',
    reason: 'consumer funding — covered by check_funding (balance + aggregate funds caps)' },
  { file: 'core/settlement/src/engine.rs', disposition: 'exempt',
    reason: 'credits the operator transit account, not a merchant' },
  { file: 'core/payouts/src/engine.rs', disposition: 'exempt',
    reason: 'payouts DEBIT a merchant; the credits go to in-flight, operator fee and bank accounts' },
  { file: 'core/ledger/src/repository.rs', disposition: 'exempt',
    reason: 'the ledger primitive itself — it posts what a domain already decided' },
  { file: 'core/ledger/src/posting.rs', disposition: 'exempt',
    reason: 'PostingBuilder unit tests' },
];

console.log('Sandbox merchant-credit policy — path coverage\n');

// 1. Every declared path still exists.
for (const p of PATHS) {
  if (!existsSync(resolve(ROOT, p.file))) fail(`declared path is gone: ${p.file} — update this guard`);
}

// 2. Every `gated` path actually calls the gate.
for (const p of PATHS.filter((x) => x.disposition === 'gated')) {
  const src = readFileSync(resolve(ROOT, p.file), 'utf8');
  // Strip line comments so a commented-out call cannot satisfy the guard.
  const live = src.replace(/^\s*\/\/.*$/gm, '');
  if (live.includes(GATE)) pass(`gated: ${p.file}`);
  else fail(`${p.file} is declared GATED but does not call ${GATE}`);
}

// 3. Every `exempt` path carries a reason.
for (const p of PATHS.filter((x) => x.disposition === 'exempt')) {
  if (!p.reason || p.reason.length < 20) fail(`${p.file} is exempt with no real reason`);
}
pass(`${PATHS.filter((x) => x.disposition === 'exempt').length} exempt path(s), each with a recorded reason`);

// 4. NO UNDECLARED CREDIT SITE. This is the arm that catches a new payment
//    surface: discover every file in core/ that writes a CREDIT, and require it
//    to appear above. Test files are excluded — they assert, they do not pay.
const declared = new Set(PATHS.map((p) => p.file));
const found = execFileSync('git', ['ls-files', 'core'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 24 })
  .split('\n')
  .filter((f) => f.endsWith('.rs') && !/tests?\.rs$|\/tests\//.test(f))
  .filter((f) => {
    const src = readFileSync(resolve(ROOT, f), 'utf8');
    // WRITERS only. Matching the bare string 'CREDIT' also catches every
    // read — balance sums, reconciliation, the policy's own measurement
    // queries — and a guard that flags nine read-only files for every real
    // writer is a guard people switch off. A credit is written either through
    // the PostingBuilder or by inserting a ledger entry directly.
    return /\.credit\(/.test(src) || /INSERT INTO ledger_entries/.test(src);
  });

const undeclared = found.filter((f) => !declared.has(f));
if (undeclared.length) {
  for (const f of undeclared) {
    fail(`undeclared merchant-credit path: ${f}\n      → add it to PATHS as 'gated' (call ${GATE}) or 'exempt' with a reason`);
  }
} else {
  pass(`no undeclared credit path (${found.length} credit-writing file(s), all declared)`);
}

// 5. ADR-048 must not claim a limit the code does not carry. The ADR names every
//    limit and its enforcement site; each named site must exist and, for the
//    merchant gate, must be the function that is actually called.
const ADR = 'docs/adr/ADR-048-pilot-limit-policy-overlay.md';
const adr = readFileSync(resolve(ROOT, ADR), 'utf8');
const pilot = readFileSync(resolve(ROOT, 'core/compliance/src/pilot.rs'), 'utf8');
const enforce = readFileSync(resolve(ROOT, 'core/compliance/src/pilot_enforce.rs'), 'utf8');

let adrFailures = 0;
const adrFail = (m) => { fail(m); adrFailures += 1; };

// The ADR must carry an enforcement table at all — its absence is how the
// original claim went unchecked for months.
if (!/## Enforcement table/.test(adr)) adrFail(`${ADR} has no enforcement table`);

// Every limit constant the ADR states must exist with that value.
const STATED = [
  ['CONSUMER_PER_PAYMENT_MINOR', 2_500_000], ['CONSUMER_DAILY_MINOR', 5_000_000],
  ['CONSUMER_MAX_BALANCE_MINOR', 5_000_000], ['AGGREGATE_FUNDS_MINOR', 50_000_000],
  ['MERCHANT_PER_RECEIVE_MINOR', 2_500_000], ['MERCHANT_MAX_BALANCE_MINOR', 10_000_000],
  ['MERCHANT_ROLLING_24H_MINOR', 25_000_000], ['MERCHANT_ROLLING_30D_MINOR', 100_000_000],
  ['GLOBAL_ROLLING_24H_MINOR', 50_000_000], ['GLOBAL_ROLLING_30D_MINOR', 400_000_000],
];
for (const [name, value] of STATED) {
  const re = new RegExp(`pub const ${name}: i64 = ([0-9_]+);`);
  const m = pilot.match(re);
  if (!m) adrFail(`ADR-048 names ${name} but it does not exist in pilot.rs`);
  else if (Number(m[1].replace(/_/g, '')) !== value) {
    adrFail(`${name} is ${m[1]} in code, ${value} in this guard — reconcile ADR-048 and re-sign the numbers`);
  }
}

// The retired lifetime cap must be gone from BOTH code and the ADR's claims.
if (/pub const AGGREGATE_VOLUME_MINOR/.test(pilot)) {
  adrFail('the retired lifetime AGGREGATE_VOLUME_MINOR still exists in pilot.rs');
}
if (/check_volume/.test(enforce)) {
  adrFail('the retired, never-called check_volume still exists in pilot_enforce.rs');
}
if (!adrFailures) pass('ADR-048 states no limit the code does not carry');

if (failures) {
  console.error(`\n✗ SANDBOX_MERCHANT_CREDIT_POLICY_PATH_COVERAGE=FAIL (${failures})`);
  if (adrFailures) console.error(`✗ ADR048_RUNTIME_CONTRADICTIONS=${adrFailures}`);
  process.exit(1);
}
console.log('\n✓ SANDBOX_MERCHANT_CREDIT_POLICY_PATH_COVERAGE=PASS');
console.log('✓ ADR048_RUNTIME_CONTRADICTIONS=0');
