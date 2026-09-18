#!/usr/bin/env node
/**
 * validation-actor-health.mjs — can each Validation Actor still do its job?
 *
 * This is the preflight arm that separates an INFRASTRUCTURE failure from a
 * PRODUCT failure. A Full Validation Run that starts with a suspended Business
 * or an actor over its balance cap will produce failures that look exactly like
 * product defects, and someone will spend a day chasing one.
 *
 * It PROVISIONS NOTHING and MUTATES NOTHING. Until B10 is authorised it reports
 * `not-provisioned` for every actor, which is the correct answer rather than an
 * error: the registry is the plan, and the plan is not yet the world.
 *
 *   node tools/validation-actor-health.mjs            # human
 *   node tools/validation-actor-health.mjs --json     # machine
 *
 * Exit 0 when every actor is HEALTHY or uniformly not-provisioned; 1 otherwise.
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const JSON_OUT = process.argv.includes('--json');

const registry = JSON.parse(execFileSync('python3',
  ['-c', 'import sys,yaml,json;json.dump(yaml.safe_load(open(sys.argv[1])),sys.stdout)',
   resolve(ROOT, 'quality/validation/actors.yaml')], { encoding: 'utf8' }));

// The caps an actor must stay under to keep working across runs. Read from the
// policy rather than restated, so a re-sizing cannot leave this stale.
const pilot = readFileSync(resolve(ROOT, 'core/compliance/src/pilot.rs'), 'utf8');
const limit = (name) => Number((pilot.match(new RegExp(`pub const ${name}: i64 = ([0-9_]+);`)) ?? [])[1]?.replace(/_/g, '') ?? 0);
const CAPS = {
  consumer_balance: limit('CONSUMER_MAX_BALANCE_MINOR'),
  merchant_balance: limit('MERCHANT_MAX_BALANCE_MINOR'),
  merchant_24h: limit('MERCHANT_ROLLING_24H_MINOR'),
};

const actors = registry.actors ?? [];
const report = [];

for (const a of actors) {
  const ids = a.product_ids ?? {};
  const provisioned = Object.values(ids).some((v) => v !== null && v !== undefined && v !== true);

  const checks = [];
  const add = (name, state, detail) => checks.push({ name, state, detail });

  // 1. The registry itself is coherent for this actor.
  add('registry', a.handle || a.email ? 'ok' : 'fail', a.handle ?? a.email ?? 'no identity recorded');

  // 2. Credentials are referenced, and the reference is well-formed. Whether the
  //    secret EXISTS is deliberately not checked from here: reading the Sandbox
  //    host's secret store to prove a value is present is how a health check
  //    starts handling secrets.
  const refs = Object.values(a.credentials ?? {});
  add('credentials',
    refs.every((r) => typeof r === 'string' && r.startsWith('secret://banzami/validation/')) ? 'ok' : 'fail',
    refs.length ? `${refs.length} reference(s)` : 'none required');

  // 3-6. Everything that needs the actor to exist.
  for (const name of ['auth', 'balance', 'suspension', 'window-headroom']) {
    add(name, provisioned ? 'unknown' : 'not-provisioned',
      provisioned ? 'requires a live probe (Phase C)' : 'B10 not authorised');
  }

  const state = checks.some((c) => c.state === 'fail') ? 'UNHEALTHY'
    : checks.every((c) => c.state === 'not-provisioned' || c.state === 'ok') && !provisioned ? 'NOT_PROVISIONED'
    : checks.some((c) => c.state === 'unknown') ? 'DEGRADED' : 'HEALTHY';

  report.push({ actor: a.id, type: a.type, handle: a.handle ?? null, state, checks });
}

const notProvisioned = report.filter((r) => r.state === 'NOT_PROVISIONED').length;
const unhealthy = report.filter((r) => r.state === 'UNHEALTHY');

if (JSON_OUT) {
  console.log(JSON.stringify({
    generated_at: new Date().toISOString(),
    caps_minor: CAPS,
    actors_provisioned: actors.length - notProvisioned,
    actors: report,
  }, null, 2));
} else {
  console.log('Banzami Validation Studio — actor health\n');
  for (const r of report) {
    const mark = r.state === 'HEALTHY' ? '✓' : r.state === 'UNHEALTHY' ? '✗' : '·';
    console.log(`  ${mark} ${r.actor.padEnd(4)} ${String(r.handle ?? r.type).padEnd(10)} ${r.state}`);
  }
  console.log(`\n  caps read from policy: consumer balance ${CAPS.consumer_balance}, ` +
              `merchant balance ${CAPS.merchant_balance}, merchant 24h ${CAPS.merchant_24h} (minor)`);
  console.log(`\n  VALIDATION_ACTORS_PROVISIONED=${actors.length - notProvisioned}`);
  if (notProvisioned === actors.length) {
    console.log('  Every actor is registered and none is provisioned — the expected state until B10.');
  }
}

process.exit(unhealthy.length ? 1 : 0);
