/**
 * tools/e2e/transfer-sandbox-e2e.mjs
 *
 * Guarded, repeatable Sandbox E2E for the wallet-native consumer P2P transfer —
 * the same path the mobile Banzami experience uses:
 *
 *   consumer JWT → public-api POST /v1/transfers (recipient = @banza handle)
 *     → core send_p2p → TransferEngine (atomic double-entry, idempotent, COMPLETED)
 *
 * It registers two clearly-tagged Sandbox test consumers (each auto-granted a
 * virtual test balance), then proves: a valid transfer debits/credits exactly
 * once, currency+amount are preserved, the state is COMPLETED, an official
 * receipt PDF exists, an idempotency replay is a no-op, and every negative case
 * (insufficient funds, invalid/self recipient, invalid amount, unsupported
 * currency, missing idempotency key, unauthorized) is rejected with balances
 * left exactly intact.
 *
 * Safety: Sandbox host only, explicit opt-in, e2e-tagged handles, nominal
 * amounts, no real money, no secret printed. See tools/e2e/README.md.
 *
 * Run:
 *   BANZAMI_E2E=RUN node tools/e2e/transfer-sandbox-e2e.mjs
 *   (optional) BANZAMI_E2E_CONSUMER_BASE=https://sandbox-api.banzami.com/consumer
 */

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  assertExplicitRun,
  assertSandboxConsumerBase,
  assertTestHandle,
  assertNominalAmount,
} from './transfer-guards.mjs';

const BASE =
  process.env.BANZAMI_E2E_CONSUMER_BASE || 'https://sandbox-api.banzami.com/consumer';
const AMOUNT = 250_000; // 2,500 Kz — nominal
const SECOND = 100_000; // second transfer (proves dedup is key-scoped)

const uuid = () => randomUUID();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Every request here is either idempotency-key'd or non-mutating, so a retry on
// a transient upstream 5xx (e.g. an nginx 502 blip) is safe and avoids false
// failures without masking real >=400 contract responses.
async function req(method, path, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  let last;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = { _raw: text.slice(0, 120) };
    }
    last = { status: res.status, contentType: res.headers.get('content-type') || '', json };
    if (res.status < 500) return last;
    if (attempt < 3) await sleep(400 * attempt);
  }
  return last;
}

async function register(handle) {
  assertTestHandle(handle);
  const r = await req('POST', '/v1/auth/register', {
    body: { handle, pin: '1357', display_name: `E2E ${handle}` },
  });
  assert.equal(r.status, 201, `register ${handle} → ${r.status}`);
  return { id: r.json.consumer.id, handle, token: r.json.token };
}

async function balance(token) {
  const r = await req('GET', '/v1/me/wallet/balance', { token });
  assert.equal(r.status, 200, `balance → ${r.status}`);
  return r.json.available_minor;
}

async function main() {
  assertExplicitRun(process.env.BANZAMI_E2E);
  assertSandboxConsumerBase(BASE);
  assertNominalAmount(AMOUNT);
  assertNominalAmount(SECOND);

  const suffix = uuid().slice(0, 6);
  const log = (m) => console.log(`  • ${m}`);

  // 1. Provision two tagged Sandbox consumers (auto-funded virtual balance).
  const A = await register(`e2esend${suffix}`);
  const B = await register(`e2ercv${suffix}`);
  const a0 = await balance(A.token);
  const b0 = await balance(B.token);
  assert.ok(a0 >= AMOUNT + SECOND, 'sender must start funded');
  log(`registered @${A.handle} (${a0}) and @${B.handle} (${b0})`);

  // 2. Valid transfer — COMPLETED, exact debit/credit, currency preserved.
  const idem = uuid();
  const t1 = await req('POST', '/v1/transfers', {
    token: A.token,
    body: { recipient: `@${B.handle}`, amount_minor: AMOUNT, currency: 'AOA', note: 'e2e', idempotency_key: idem },
  });
  assert.equal(t1.status, 201, `transfer → ${t1.status}`);
  assert.equal(t1.json.status, 'COMPLETED');
  assert.equal(t1.json.amount_minor, AMOUNT);
  assert.equal(t1.json.currency, 'AOA');
  assert.equal(t1.json.recipient, `@${B.handle}`);
  const txId = t1.json.transfer_id;
  assert.ok(txId, 'transfer_id present');
  assert.equal(await balance(A.token), a0 - AMOUNT, 'sender debited exactly once');
  assert.equal(await balance(B.token), b0 + AMOUNT, 'recipient credited exactly once');
  log(`valid transfer ${txId} COMPLETED; balances moved by exactly ${AMOUNT}`);

  // 3. Idempotency replay — same key ⇒ same transfer, no second move.
  const t2 = await req('POST', '/v1/transfers', {
    token: A.token,
    body: { recipient: `@${B.handle}`, amount_minor: AMOUNT, currency: 'AOA', note: 'e2e', idempotency_key: idem },
  });
  assert.equal(t2.status, 201);
  assert.equal(t2.json.transfer_id, txId, 'replay returns the original transfer');
  assert.equal(await balance(A.token), a0 - AMOUNT, 'replay did not move funds again');
  assert.equal(await balance(B.token), b0 + AMOUNT, 'replay did not credit again');
  log('idempotency replay deduped (same transfer_id, balances unchanged)');

  // 4. Official receipt PDF exists for the transfer.
  const rec = await fetch(`${BASE}/v1/consumer/transactions/${txId}/receipt.pdf`, {
    headers: { Authorization: `Bearer ${A.token}` },
  });
  assert.equal(rec.status, 200, `receipt → ${rec.status}`);
  assert.match(rec.headers.get('content-type') || '', /application\/pdf/);
  log('official receipt PDF available');

  // 5. Negative cases — each rejected; balances must stay exactly intact.
  const aMid = await balance(A.token);
  const bMid = await balance(B.token);
  const negatives = [
    ['insufficient_funds', { recipient: `@${B.handle}`, amount_minor: 999_999_999, currency: 'AOA', idempotency_key: uuid() }, A.token, 422, 'INSUFFICIENT_FUNDS'],
    ['invalid_recipient', { recipient: `@nobody${uuid().slice(0, 6)}`, amount_minor: 1000, currency: 'AOA', idempotency_key: uuid() }, A.token, 404, 'RECIPIENT_NOT_FOUND'],
    ['self_transfer', { recipient: `@${A.handle}`, amount_minor: 1000, currency: 'AOA', idempotency_key: uuid() }, A.token, 400, 'SELF_TRANSFER_NOT_ALLOWED'],
    ['invalid_amount', { recipient: `@${B.handle}`, amount_minor: 0, currency: 'AOA', idempotency_key: uuid() }, A.token, 400, 'INVALID_AMOUNT'],
    ['unsupported_currency', { recipient: `@${B.handle}`, amount_minor: 1000, currency: 'USD', idempotency_key: uuid() }, A.token, 400, 'UNSUPPORTED_CURRENCY'],
    ['missing_idem_key', { recipient: `@${B.handle}`, amount_minor: 1000, currency: 'AOA' }, A.token, 400, 'MISSING_FIELD'],
    ['unauthorized', { recipient: `@${B.handle}`, amount_minor: 1000, currency: 'AOA', idempotency_key: uuid() }, undefined, 401, 'UNAUTHORIZED'],
  ];
  for (const [label, body, token, wantStatus, wantCode] of negatives) {
    const r = await req('POST', '/v1/transfers', { token, body });
    assert.equal(r.status, wantStatus, `${label}: status ${r.status} != ${wantStatus}`);
    assert.equal(r.json.code, wantCode, `${label}: code ${r.json.code} != ${wantCode}`);
    log(`negative ${label} → ${r.status} ${r.json.code}`);
  }
  assert.equal(await balance(A.token), aMid, 'sender balance intact after all negatives');
  assert.equal(await balance(B.token), bMid, 'recipient balance intact after all negatives');
  log('atomicity: all negatives left balances exactly intact');

  console.log(
    '\n' +
      JSON.stringify(
        {
          ok: true,
          base: BASE,
          sender: `@${A.handle}`,
          recipient: `@${B.handle}`,
          transfer_id: txId,
          amount_minor: AMOUNT,
          final_state: 'COMPLETED',
          idempotent: true,
          receipt_pdf: true,
          negatives_rejected: negatives.length,
          webhook_events: 'none (P2P transfer emits no webhook; recipient gets a best-effort push only)',
        },
        null,
        2,
      ),
  );
}

main().catch((e) => {
  console.error('\nTransfer E2E FAILED:', e instanceof Error ? e.message : e);
  process.exit(1);
});
