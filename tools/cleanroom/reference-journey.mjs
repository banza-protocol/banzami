#!/usr/bin/env node
// The DOA reference journey, driven only by a Project API key over public HTTPS.
// No merchant id, no wallet id, no internal route, no operator credential.
const API = 'https://sandbox-api.banzami.com';
const KEY = process.env.DOA_KEY;
if (!KEY) { console.error('DOA_KEY required'); process.exit(2); }

const steps = [];
const rec = (n, ok, d) => { steps.push({ step: n, ok, ...d });
  console.log(`  ${ok ? '\x1b[0;32m✓\x1b[0m' : '\x1b[0;31m✗\x1b[0m'} ${n}${d?.note ? ` — ${d.note}` : ''}`); return ok; };

async function http(method, path, { body, idem, key = KEY } = {}) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (key) headers.authorization = `Bearer ${key}`;
  if (idem) headers['idempotency-key'] = idem;
  const res = await fetch(API + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await res.text();
  let j = null; try { j = JSON.parse(t); } catch {}
  return { status: res.status, json: j, text: t };
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

console.log('\n▸ DOA reference journey — project key only\n');

// 1. Who am I? Only the key says.
const me = await http('GET', '/v1/business/me');
const handle = me.json?.handle;
rec('business identity resolves from the key alone', me.status === 200 && me.json?.settlement_ready === true,
  { note: `handle=@${handle || '—'} kyb=${me.json?.kyb_status} settlement_ready=${me.json?.settlement_ready} blockers=${JSON.stringify(me.json?.blockers)}`,
    handle, kyb: me.json?.kyb_status, blockers: me.json?.blockers });

// 2. A fresh campaign account — clean before/after.
const ref = `journey-${Date.now()}`;
const wa = await http('POST', '/v1/business/wallet-accounts', {
  idem: `wa-${ref}`,
  body: { purpose: 'CAMPAIGN', label: 'Reference journey', reference_type: 'CAMPAIGN', reference_id: ref } });
const account = wa.json?.id;
rec('fresh CAMPAIGN wallet account created', Boolean(account), { note: `account=${account}`, account });

// The list is enveloped as { data: [...] } and the balance field is
// available_balance_minor. Reading the wrong one returns null, which is not zero
// and must never be reported as a balance.
const balOf = async (id) => {
  const l = await http('GET', '/v1/business/wallet-accounts');
  const rows = Array.isArray(l.json?.data) ? l.json.data : [];
  const a = rows.find((x) => x.id === id);
  return a ? a.available_balance_minor : null;
};
const before = await balOf(account);
rec('campaign balance before', before === 0, { note: `${before}`, before });

// 3. Session bound to that account, paid on the public payer rail.
const s = await http('POST', '/v1/business/payment-sessions', { idem: `ps-${ref}`,
  body: { amount_minor: 100000, currency: 'AOA', purpose: 'DONATION', wallet_account_id: account,
          reference_type: 'CAMPAIGN', reference_id: ref, description: 'Reference donation' } });
const slug = (s.json?.interfaces ?? []).find((i) => i.type === 'PAYMENT_LINK')?.value?.split('/').filter(Boolean).pop();
rec('payment session created on that account', Boolean(slug),
  { note: `session=${s.json?.session_id} slug=${slug}`, session_id: s.json?.session_id, slug,
    detail: slug ? undefined : (s.json ?? s.text.slice(0, 300)) });

if (slug) {
  const init = await http('POST', `/public/pay/${slug}/pay`, { key: null, body: { amount_minor: 100000 } });
  const extref = init.json?.external_ref;
  const conf = await http('POST', `/public/pay/${slug}/test-confirm?ref=${encodeURIComponent(extref)}`, { key: null });
  rec('public payer confirmation (no credential)', conf.status === 200,
    { note: `http=${conf.status} provider=${conf.json?.provider} status=${conf.json?.status}` });

  let after = null;
  for (let i = 0; i < 20; i++) { after = await balOf(account); if (after > 0) break; await sleep(1500); }
  rec('campaign wallet credited GROSS, no incoming fee', after === 100000,
    { note: `${before} → ${after} (expected +100000, fee 0)`, after });
}

// 4. Settlement — the fee-bearing operation, out of that campaign account.
const bal = await balOf(account);
const set = await http('POST', '/v1/business/application-settlements', { idem: `st-${ref}`,
  body: { source_account_id: account, beneficiary_banza_name: handle,
          reason: 'Reference settlement', reference_type: 'CAMPAIGN', reference_id: ref,
          idempotency_key: `st-${ref}` } });
rec('application settlement accepted self-service', set.status === 200 || set.status === 201,
  { note: `http=${set.status} ${JSON.stringify(set.json ?? set.text.slice(0, 260))}`, settlement: set.json });

const post = await balOf(account);
rec('source account drained by the settlement', post !== bal,
  { note: `${bal} → ${post}`, source_after: post });

const failed = steps.filter((x) => !x.ok);
console.log(`\n  ${failed.length ? '\x1b[0;31mFAIL\x1b[0m' : '\x1b[0;32mPASS\x1b[0m'}  ${steps.length - failed.length}/${steps.length}\n`);
console.log(JSON.stringify({ schema: 'banzami-doa-journey/v1', ran_at: new Date().toISOString(), steps }, null, 2));
