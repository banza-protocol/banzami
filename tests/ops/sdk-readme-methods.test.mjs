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
