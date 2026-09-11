/**
 * Every method the @banzami/sdk README calls exists on BanzamiClient.
 *
 * The README documented methods the client no longer has — consumer-wallet
 * provisioning, sendTransfer (including a "Scan and pay" example that sent money
 * from a consumer id the merchant named), and the create/pay/decline/cancel
 * payment-request family — all removed from the client when their routes were
 * withdrawn (SEC-015, RA-053, RA-057). An integrator copying the README got
 * "is not a function", or, worse, the idea that a merchant key may move a
 * consumer's money.
 *
 * This reads the README's code blocks for `client.<name>(` / `banzami.<name>(`
 * calls and requires each <name> to be a method declared in
 * sdk/typescript/src/client.ts.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';

const REPO = join(import.meta.dirname, '../..');
const README = readFileSync(join(REPO, 'sdk/typescript/README.md'), 'utf8');
const CLIENT = readFileSync(join(REPO, 'sdk/typescript/src/client.ts'), 'utf8');

/** Method names called on a client instance inside fenced code blocks. */
export function calledMethods(markdown) {
  const names = new Set();
  const fence = /```[a-zA-Z]*\n([\s\S]*?)```/g;
  for (const [, code] of markdown.matchAll(fence)) {
    for (const [, name] of code.matchAll(/\b(?:client|banzami)\.([A-Za-z_$][\w$]*)\s*\(/g)) {
      names.add(name);
    }
  }
  return [...names].sort();
}

/** Whether `name` is declared as a method of the client class. */
export function declared(source, name) {
  const decl = new RegExp(`^\\s+(?:public\\s+)?(?:async\\s+)?${name}\\s*(?:<[^\\n]*?>)?\\s*\\(`, 'm');
  return decl.test(source);
}

describe('@banzami/sdk README calls only methods the client has', () => {
  it('finds the calls it is meant to check', () => {
    const names = calledMethods(README);
    assert.ok(names.length >= 10, `expected the README's client calls, found ${names.length}`);
    assert.ok(names.includes('me'), 'the README documents client.me() — the extractor must see it');
  });

  it('every called method is declared on BanzamiClient', () => {
    const missing = calledMethods(README).filter((n) => !declared(CLIENT, n));
    assert.deepEqual(missing, [], `README calls methods BanzamiClient does not have: ${missing.join(', ')}`);
  });

  // The guard must fail for the reason it exists: a removed method in a code
  // block is reported.
  it('reports a removed method', () => {
    const sample = '```typescript\nawait client.sendTransfer({ senderId: "x" });\nawait client.me();\n```\n';
    const missing = calledMethods(sample).filter((n) => !declared(CLIENT, n));
    assert.deepEqual(missing, ['sendTransfer']);
  });
});

// ---------------------------------------------------------------------------
// PHP and Python READMEs (A4-05, A4-06)
// ---------------------------------------------------------------------------
//
// The PHP README documented sendTransfer, createStaticQr/createDynamicQr,
// createPayout, a Banzami::webhooks() facade call and exception helpers the
// client never had; the Python README passed refund parameters the resource
// does not take. Neither SDK runs in CI, so the READMEs are held here.

const PHP_README = readFileSync(join(REPO, 'sdk/php/README.md'), 'utf8');
const PHP_CLIENT = readFileSync(join(REPO, 'sdk/php/src/BanzamiClient.php'), 'utf8');
const PHP_WEBHOOKS = readFileSync(join(REPO, 'sdk/php/src/Webhooks.php'), 'utf8');
const PY_README = readFileSync(join(REPO, 'sdk/python/README.md'), 'utf8');

function fenced(markdown) {
  return [...markdown.matchAll(/```[a-zA-Z]*\n([\s\S]*?)```/g)].map((m) => m[1]).join('\n');
}

/** PHP calls in the README: [receiver, method] for $client->m( / Banzami::m( / Webhooks::m(. */
export function phpCalls(markdown) {
  const code = fenced(markdown);
  const calls = new Set();
  for (const [, m] of code.matchAll(/\$client->([A-Za-z_]\w*)\s*\(/g)) calls.add(`client:${m}`);
  for (const [, m] of code.matchAll(/\bBanzami::([A-Za-z_]\w*)\s*\(/g)) calls.add(`client:${m}`);
  for (const [, m] of code.matchAll(/\bWebhooks::([A-Za-z_]\w*)\s*\(/g)) calls.add(`webhooks:${m}`);
  return [...calls].sort();
}

function phpDeclared(call) {
  const [where, name] = call.split(':');
  const src = where === 'webhooks' ? PHP_WEBHOOKS : PHP_CLIENT;
  return new RegExp(`public\\s+(?:static\\s+)?function\\s+${name}\\s*\\(`).test(src);
}

/** Python calls in the README: resource.method for client.<resource>.<method>(. */
export function pythonCalls(markdown) {
  const calls = new Set();
  for (const [, res, m] of fenced(markdown).matchAll(/\bclient\.([a-z_]+)\.([a-z_]\w*)\s*\(/g)) calls.add(`${res}.${m}`);
  return [...calls].sort();
}

function pythonDeclared(call, pyResource = (res) => {
  const p = join(REPO, 'sdk/python/banzami/resources', `${res}.py`);
  try { return readFileSync(p, 'utf8'); } catch { return ''; }
}) {
  const [res, name] = call.split('.');
  return new RegExp(`^\\s+(?:async\\s+)?def\\s+${name}\\s*\\(`, 'm').test(pyResource(res));
}

describe('banzami/sdk-php README calls only methods the client has', () => {
  it('finds the calls it is meant to check', () => {
    const calls = phpCalls(PHP_README);
    assert.ok(calls.length >= 8, `expected the README's calls, found ${calls.length}`);
    assert.ok(calls.includes('client:createPaymentLink'));
  });
  it('every called method is declared', () => {
    assert.deepEqual(phpCalls(PHP_README).filter((c) => !phpDeclared(c)), []);
  });
  it('reports a removed method', () => {
    const sample = '```php\n$client->sendTransfer([]);\n$client->createPaymentLink([]);\nBanzami::webhooks();\n```\n';
    assert.deepEqual(phpCalls(sample).filter((c) => !phpDeclared(c)), ['client:sendTransfer', 'client:webhooks']);
  });
});

describe('banzami-python README calls only methods the resources have', () => {
  it('finds the calls it is meant to check', () => {
    const calls = pythonCalls(PY_README);
    assert.ok(calls.length >= 8, `expected the README's calls, found ${calls.length}`);
    assert.ok(calls.includes('refunds.create'));
  });
  it('every called method is declared on its resource', () => {
    assert.deepEqual(pythonCalls(PY_README).filter((c) => !pythonDeclared(c)), []);
  });
  it('reports a removed method', () => {
    const sample = '```python\nawait client.transfers.send(x)\nawait client.transactions.capture(x)\nawait client.refunds.create(x)\n```\n';
    assert.deepEqual(pythonCalls(sample).filter((c) => !pythonDeclared(c)), ['transactions.capture', 'transfers.send']);
  });
  it('the refunds example passes the typed source and a key, not transaction_id', () => {
    const block = fenced(PY_README).match(/client\.refunds\.create\(([\s\S]*?)\)/)?.[1] ?? '';
    assert.match(block, /source_type=/);
    assert.match(block, /idempotency_key=/);
    assert.doesNotMatch(block, /transaction_id=/);
  });
});
