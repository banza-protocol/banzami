#!/usr/bin/env node
/**
 * A harness may not delete a real person's Console account.
 *
 * On 2026-09-12 it did. developer-journey-50 guarded its REGISTERED cleanup with
 * `if (OWNER_IS_SYNTHETIC)` and then called cleanupRun again, unconditionally,
 * in a loop over `[EMAIL_OWNER, EMAIL_MEMBER]`. On every run against the owner's
 * real mailbox the second call deleted fidel.monteiro@banzami.com — an account
 * that had signed in sixteen times that day — and the guard twenty lines above
 * it never applied. The failure was invisible because the run reported residue 0
 * and a green journey: it had tidied away the person it ran as.
 *
 * These hold the two halves that were missing: the destructive statement refuses
 * a non-fixture address itself, and it refuses a pattern that could reach one.
 */
import { assertFixtureEmailPattern, coreRetirementStep } from './run-cleanup.mjs';

let pass = 0, fail = 0;
const ok = (m) => { pass += 1; console.log(`  ✓ ${m}`); };
const bad = (m) => { fail += 1; console.error(`  ✗ ${m}`); };
const refuses = (pattern, why) => {
  try { assertFixtureEmailPattern(pattern); bad(`accepted "${pattern}" — ${why}`); }
  catch { ok(`refuses "${pattern}" — ${why}`); }
};
const accepts = (pattern) => {
  try { assertFixtureEmailPattern(pattern); ok(`accepts "${pattern}"`); }
  catch (e) { bad(`refused a legitimate fixture pattern "${pattern}": ${e.message}`); }
};

console.log('\ncleanupRun may only delete fixture identities\n');

// The exact address that was lost, and the shapes that would reach it.
refuses('fidel.monteiro@banzami.com', 'a real person');
refuses('%@banzami.com', 'every address on the operator domain');
refuses('%', 'every account there is');
refuses('%banzami%', 'matches the operator domain too');
refuses('', 'a cleanup that matches nothing is not a cleanup');
refuses('fidel.monteiro@banzami.com%', 'a real address with a wildcard after it');

// What the harnesses legitimately mint.
accepts('dpmember-1789216727@banzami-e2e.test');
accepts('console-rbac-%1789216727@banzami-e2e.test');
accepts('lifecycle-mtyc89ty@banzami-e2e.test');
accepts('rt01-%abc@banzami-e2e.test');

// SANDBOX-DELETE-001: archiving alone left synthetic Businesses ACTIVE. The
// cleanup retires every Project in scope through Core first.
console.log('\ncleanupRun retires through Core before it archives\n');
{
  const step = coreRetirementStep({ emailPattern: 'rt01-%abc@banzami-e2e.test', namePattern: 'rt01-%abc' });
  step.includes('/internal/v1/sandbox/projects/retire') ? ok('calls Core\'s Project retirement') : bad('does not call Core\'s Project retirement');
  /sandbox_retired_projects/.test(step) ? ok('skips a Project Core already retired') : bad('would retire the same Project again');
  /op\.status = 'ACTIVE'/.test(step) && /retire_business":%s/.test(step) ? ok('keeps a Business a live Project outside the run still uses') : bad('retires a Business another live Project uses');
  const src = (await import('node:fs')).readFileSync(new URL('./run-cleanup.mjs', import.meta.url), 'utf8');
  const body = src.slice(src.indexOf('export function cleanupRun('));
  // Order in the script that runs on the host: the retirement step, then the
  // name-scoped archival, then the scope-wide one.
  const script = body.slice(body.indexOf("execFileSync('ssh'"));
  const retire = script.indexOf('${coreRetirementStep(');
  retire > -1 && retire < script.indexOf('${byName}') && retire < script.indexOf("p set status='ARCHIVED'")
    ? ok('retires before it archives') : bad('archives without retiring first');
  try { coreRetirementStep({ emailPattern: '%@banzami.com' }); bad('accepted a non-fixture scope'); } catch { ok('refuses a non-fixture scope'); }
}

console.log(`\nRUN_CLEANUP_GUARD: PASS=${pass} FAIL=${fail}\n`);
process.exit(fail === 0 ? 0 : 1);
