#!/usr/bin/env node
// check-sdk-refund-contract.mjs — provenance/contract drift guard for the
// typed-source Refunds SDK surface (WS2). A refund is a financial write, and the
// DOA-vendored SDK once drifted to a stale build under an unchanged version
// string. This guard fails CI (and runs locally) on any of:
//
//   1. version missing / (when EXPECT_VERSION given) mismatched
//   2. createRefund missing the typed-source fields (source_type, source_id)
//   3. createRefund not enforcing a mandatory idempotency_key
//   4. createRefund auto-minting a key (crypto.randomUUID / uuid) — forbidden
//   5. a public transaction_id refund INPUT, or a literal internal TRANSACTION
//      token in the public refund types
//
// Usage:
//   node tools/check-sdk-refund-contract.mjs <dist-dir> [<package.json>] [expectVersion]
// Defaults to this repo's sdk/typescript build.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const distDir = process.argv[2] || join(HERE, '..', 'sdk', 'typescript', 'dist');
const pkgPath = process.argv[3] || join(distDir, '..', 'package.json');
const expectVersion = process.argv[4] || process.env.EXPECT_SDK_VERSION || '';

const fail = [];
const read = (p) => { try { return readFileSync(p, 'utf8'); } catch { return null; } };

// ── client.js — the runtime contract ────────────────────────────────────────
const client = read(join(distDir, 'client.js'));
if (!client) {
  fail.push(`client.js not found under ${distDir} (dist not built / not vendored?)`);
} else {
  // Isolate the createRefund method body (up to the next method declaration).
  const m = client.match(/createRefund\s*\(params\)\s*\{[\s\S]*?\n {4}\}/);
  const body = m ? m[0] : '';
  if (!body) fail.push('createRefund(params) not found in client.js');
  else {
    for (const f of ['source_type', 'source_id', 'amount_minor', 'currency', 'idempotency_key']) {
      if (!new RegExp(`${f}:\\s*params\\.${f}`).test(body)) {
        fail.push(`createRefund does not forward typed-source field: ${f}`);
      }
    }
    if (/randomUUID|uuidv4|uuid\(\)/i.test(body)) {
      fail.push('createRefund auto-generates an idempotency key (randomUUID/uuid) — forbidden for a financial write');
    }
    if (!/idempotency_key/.test(body) || !/throw\b/.test(body)) {
      fail.push('createRefund does not enforce a mandatory idempotency_key (no validation throw)');
    }
    if (/transaction_id:\s*params\./.test(body)) {
      fail.push('createRefund sends a transaction_id input — the public contract is source_type + source_id');
    }
  }
}

// ── types.d.ts — the public type contract ───────────────────────────────────
const types = read(join(distDir, 'types.d.ts'));
if (!types) {
  fail.push(`types.d.ts not found under ${distDir}`);
} else {
  // CreateRefundParams.idempotency_key must be REQUIRED (no `?`).
  const crp = types.match(/interface CreateRefundParams\s*\{[\s\S]*?\}/);
  if (!crp) fail.push('CreateRefundParams not found in types.d.ts');
  else {
    if (/idempotency_key\?\s*:/.test(crp[0])) fail.push('CreateRefundParams.idempotency_key is optional — must be required');
    if (!/idempotency_key\s*:/.test(crp[0])) fail.push('CreateRefundParams missing idempotency_key');
    if (/transaction_id/.test(crp[0])) fail.push('CreateRefundParams exposes transaction_id — forbidden public input');
  }
  // The public Refund response type must not surface a transaction_id / TRANSACTION token.
  const rf = types.match(/interface Refund\s*\{[\s\S]*?\}/);
  if (rf && /transaction_id/.test(rf[0])) fail.push('Refund type exposes transaction_id — internal token must not surface');
  if (/'TRANSACTION'|"TRANSACTION"/.test(types)) fail.push("public types contain the internal 'TRANSACTION' token");
}

// ── version ─────────────────────────────────────────────────────────────────
const pkg = read(pkgPath);
let version = '';
if (!pkg) fail.push(`package.json not found at ${pkgPath}`);
else {
  try { version = JSON.parse(pkg).version || ''; } catch { fail.push('package.json is not valid JSON'); }
  if (!version) fail.push('package.json has no version');
  if (expectVersion && version !== expectVersion) {
    fail.push(`version mismatch: dist is ${version}, expected ${expectVersion} (stale vendored build?)`);
  }
}

if (fail.length) {
  console.error('✗ SDK refund-contract drift guard FAILED:');
  for (const f of fail) console.error('   - ' + f);
  process.exit(1);
}
console.log(`✓ SDK refund-contract guard passed (version ${version}${expectVersion ? `, matches ${expectVersion}` : ''}).`);
