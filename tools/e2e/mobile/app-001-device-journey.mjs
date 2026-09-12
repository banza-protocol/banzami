#!/usr/bin/env node
/**
 * APP-001, on a real iPhone. The half a machine can do.
 *
 * APP-001 has carried this blocker since June:
 *
 *     "Runtime não verificado em dispositivo real — obrigatório antes de
 *      VALIDATED"
 *
 * and read VALIDATED anyway. The criterion is kept, so somebody has to hold a
 * phone. This script does everything around that: it prepares the counterparty,
 * records what the ledger looked like before, waits, and then reads back what
 * the device actually did.
 *
 * The design point is that NOTHING here can fake the result. The recipient is an
 * account this script registers through the product's own front door, so its
 * token is legitimately ours; the sender is the human's own account on the
 * phone, and we never see its PIN, its token, or anything else of its. What we
 * can read is our own side of the transfer — and a credit on our side can only
 * have come from a real transfer somebody really made.
 *
 *   node tools/e2e/mobile/app-001-device-journey.mjs prepare
 *       registers the recipient, prints the handle to send to, saves the state
 *
 *   node tools/e2e/mobile/app-001-device-journey.mjs verify --ref ABCD1234
 *       after the human's ceremony: reads the credit back and checks it against
 *       the reference shown on the receipt screen
 *
 *   node tools/e2e/mobile/app-001-device-journey.mjs retire
 *       returns the recipient's balance and closes it
 *
 * No test-only bypass, no database write, no fake device proof. The Sandbox
 * grants a registration balance to every new consumer, which is how the human's
 * account has something to send without anyone crediting it by hand.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { assuranceDir } from '../lib/assurance-output.mjs';

const BASE = process.env.BZ_CONSUMER_API ?? 'https://sandbox-api.banzami.com/consumer';
const STATE = join(process.env.TMPDIR ?? '/tmp', 'banzami-app-001-device.json');

const api = async (method, path, { token, body } = {}) => {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (body) headers['content-type'] = 'application/json';
  const r = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => null) };
};

const balanceOf = async (token) => {
  const r = await api('GET', '/v1/me/wallet/balance?currency=AOA', { token });
  return r.body?.available_minor ?? null;
};

const meOf = async (token) => (await api('GET', '/v1/me', { token })).body?.id ?? null;

const saveState = (s) => writeFileSync(STATE, `${JSON.stringify(s, null, 2)}\n`);
const loadState = () => {
  if (!existsSync(STATE)) {
    console.error(`no prepared journey at ${STATE} — run "prepare" first`);
    process.exit(2);
  }
  return JSON.parse(readFileSync(STATE, 'utf8'));
};

/** A PIN this process invents, uses once, and never prints. */
const freshPin = () => String(Math.floor(100000 + Math.random() * 899999));

const cmd = process.argv[2];

if (cmd === 'prepare') {
  const stamp = Date.now().toString(36);
  const handle = `app001recv${stamp}`;
  const pin = freshPin();

  const reg = await api('POST', '/v1/auth/register', {
    body: { handle, display_name: `APP-001 recipient ${stamp}`, pin },
  });
  if (reg.status !== 200 && reg.status !== 201) {
    console.error(`could not register the recipient: http ${reg.status} ${JSON.stringify(reg.body)}`);
    process.exit(1);
  }
  const token = reg.body.token;
  const consumerId = reg.body?.consumer?.id ?? await meOf(token);
  const before = await balanceOf(token);

  saveState({ handle, pin, token, consumerId, prepared_at: new Date().toISOString(), balance_before: before, api: BASE });

  console.log('APP-001 — the device ceremony is ready.\n');
  console.log(`  send to:  @${handle}`);
  console.log(`  its balance right now: ${before} minor (AOA)`);
  console.log(`  api: ${BASE}\n`);
  console.log('  Nothing about your own account touches this script: not the PIN,');
  console.log('  not the token, not the balance. It reads only the recipient it made.');
  process.exit(0);
}

if (cmd === 'verify') {
  const st = loadState();
  const refArg = process.argv.indexOf('--ref');
  const ref = refArg > -1 ? String(process.argv[refArg + 1] ?? '').trim().toUpperCase() : '';

  const after = await balanceOf(st.token);
  const moved = after === null || st.balance_before === null ? null : after - st.balance_before;

  const list = await api('GET', '/v1/transfers?limit=50', { token: st.token });
  const rows = list.body?.data ?? [];
  // Credits only: what the device sent us. A debit would be this script moving
  // money, which it never does.
  const credits = rows.filter((t) => t.recipient_id === st.consumerId);
  const amountOf = (t) => Number(t.amount?.amount_minor ?? t.amount_minor ?? NaN);

  const results = [];
  const record = (criterion, held, detail) => {
    results.push({ criterion, verdict: held ? 'PASS' : 'FAIL', detail });
    console.log(`  ${held ? '✓' : '✗'} ${criterion}${detail ? ` — ${detail}` : ''}`);
  };

  console.log(`APP-001 — reading back what the iPhone did, from the recipient's own side\n`);

  record('the device moved money on the deployed runtime',
    credits.length > 0 && moved > 0,
    `recipient balance ${st.balance_before} → ${after} (${moved >= 0 ? '+' : ''}${moved} minor), ${credits.length} credit(s)`);

  const one = credits[0];
  record('exactly one transfer arrived — no double submission',
    credits.length === 1,
    `${credits.length} credit(s) since the journey was prepared`);

  if (one) {
    const derived = String(one.id ?? '').slice(0, 8).toUpperCase();
    record('the reference on the receipt screen is the transfer, uppercased to 8 characters',
      Boolean(ref) && derived === ref,
      ref ? `receipt said ${ref}; the transfer is ${derived}` : 'no --ref given — pass the reference the receipt showed');
    record('the transfer settled',
      String(one.status ?? '').toUpperCase() === 'COMPLETED',
      `status ${one.status ?? '(none)'}`);
    record('the amount credited is the amount sent',
      amountOf(one) === moved,
      `transfer says ${amountOf(one)}, the balance moved by ${moved}`);
    record('it carries the moment it happened',
      Boolean(one.created_at),
      String(one.created_at ?? '(none)'));
    // Criterion 5 of APP-001: one key, generated once in SendScreen. A retry
    // reusing it is what makes the double-tap harmless, and the key is on the
    // row, so this is read rather than assumed.
    record('the send carried an idempotency key',
      Boolean(one.idempotency_key),
      one.idempotency_key ? `key present (${String(one.idempotency_key).length} chars)` : 'none on the transfer');
  }

  const fails = results.filter((r) => r.verdict === 'FAIL').length;
  const out = join(assuranceDir('app-001-device'), `app-001-device-${Date.now()}.json`);
  mkdirSync(dirname(out), { recursive: true });
  // The recipient's handle and the transfer are not secrets. Its token and PIN
  // are, and neither is in here.
  writeFileSync(out, `${JSON.stringify({
    ran_at: new Date().toISOString(),
    api: BASE,
    recipient_handle: st.handle,
    balance_before: st.balance_before,
    balance_after: after,
    receipt_reference: ref || null,
    credits: credits.map((t) => ({
      id: t.id, amount_minor: amountOf(t), currency: t.currency,
      status: t.status, created_at: t.created_at,
      idempotency_key_present: Boolean(t.idempotency_key),
    })),
    results,
  }, null, 2)}\n`);

  console.log(`\nAPP_001_DEVICE_RUNTIME=${fails === 0 ? 'PASS' : 'FAIL'}`);
  console.log(`evidence: ${out}`);
  process.exit(fails === 0 ? 0 : 1);
}

if (cmd === 'retire') {
  const st = loadState();
  const bal = await balanceOf(st.token);
  console.log(`recipient @${st.handle} (consumer ${st.consumerId}) holds ${bal} minor`);
  // There is no consumer-facing route that gives value back, and inventing one
  // for a fixture would be a worse outcome than saying so. Retiring synthetic
  // value is an operator action on the Core internal surface, and this prints
  // the exact command rather than pretending to have done it.
  console.log('\nThis account is a fixture of the ceremony and must not survive it.');
  console.log('Retire its value and close it from the Sandbox host:');
  console.log(`  tools/ops/retire-synthetic-residue.sh   # consumer ${st.consumerId}, @${st.handle}`);
  console.log(`\nstate file: ${STATE} — delete it once the disposition is recorded`);
  process.exit(0);
}

console.error('usage: app-001-device-journey.mjs prepare | verify --ref <REF> | retire');
process.exit(2);
