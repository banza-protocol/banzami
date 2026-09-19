#!/usr/bin/env node
/**
 * The seven ways a fixture lifecycle can be wrong, each shown to fail.
 *
 * The guard this exercises replaced one that asked `/auth\/register/` of a
 * single file. That guard was green for months while proof 14 leaked two
 * consumers per run and lib/deeplink-pay.mjs leaked a third from three files
 * away. A guard nobody has watched fail is a guard nobody should trust.
 */
import { classify } from './check-validation-fixture-lifecycle.mjs';

let failures = 0;
const check = (title, ok, detail = '') => {
  if (ok) return console.log(`  ✓ ${title}`);
  console.log(`  ✗ ${title}${detail ? `\n      ${detail}` : ''}`);
  failures++;
};
const is = (title, got, want) => check(`${title} → ${want}`, got.status === want, `got ${got.status} (ownership ${got.own})`);

console.log('\nfixture lifecycle — mutation proofs\n');

const FINALLY_RETIRE = `try { doThing(); } finally { await retireConsumer(h); }`;
const OWN_CONTRACT   = `e2eOwn(own, 'consumer', h); ... finally { await e2eCleanup(own); }`;

// 1 · a consumer created through the UI, never retired
is('1. UI-created consumer with no retirement',
  classify({ sources: [`await create.submit();`], declared: 1000000 }), 'CLEANUP_MISSING');

// 2 · the same through the API
is('2. API-created consumer with no retirement',
  classify({ sources: [`await fetch('/v1/auth/register', {method:'POST'})`], declared: 1000000 }), 'CLEANUP_MISSING');

// 3 · creation hidden one file deeper — proof 04's actual shape
is('3. creation hidden behind an imported helper',
  classify({ sources: [`import { payViaDeepLink } from './lib/x.mjs'; await payViaDeepLink();`,
                       `export async function payViaDeepLink(){ await create.submit(); }`], declared: 1000000 }),
  'CLEANUP_MISSING');

// 4 · cleanup on the success path only — proof 14's actual shape, where the
//     catch swallowed the failure into a fallback and the consumer escaped
is('4. retirement only on the success path',
  classify({ sources: [`try { await create.submit(); await assertThing(); await retireConsumer(h); } catch (e) { fallback(); }`],
             declared: 1000000 }), 'CLEANUP_MISSING');
check('4. …and the reason names it', 
  classify({ sources: [`try { await create.submit(); await retireConsumer(h); } catch (e) {}`], declared: 1000000 }).own
    === 'retire-success-path-only');

// 5 · cleanup that runs however the scenario exits
is('5. retirement in a finally',
  classify({ sources: [`await create.submit(); ${FINALLY_RETIRE}`], declared: 1000000 }), 'CLOSED');
is('5. the canonical node ownership contract',
  classify({ sources: [`await create.submit(); ${OWN_CONTRACT}`], declared: 1000000 }), 'CLOSED');
is('5. the canonical shell contract',
  classify({ sources: [`e2e_begin\nsynthetic_tenant foo\ne2e_own merchant "$M"`], declared: 1000000 }), 'CLOSED');

// 6 · a journey that creates nothing needs no retirement
is('6. a journey that creates nothing',
  classify({ sources: [`const r = await fetch('/health');`], declared: 0 }), 'CLOSED');

// 7 · lifecycle that cannot be established must FAIL, never default to safe
is('7. a creator with no exposure declaration',
  classify({ sources: [`await create.submit(); ${FINALLY_RETIRE}`], declared: undefined }), 'UNKNOWN');
is('7. …even when cleanup is guaranteed',
  classify({ sources: [`await registerConsumer(); ${OWN_CONTRACT}`], declared: null }), 'UNKNOWN');

console.log(failures === 0
  ? `\n✓ VALIDATION_FIXTURE_LIFECYCLE_SELFTEST=PASS\n`
  : `\n✗ VALIDATION_FIXTURE_LIFECYCLE_SELFTEST=FAIL (${failures})\n`);
process.exit(failures === 0 ? 0 : 1);
