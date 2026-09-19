#!/usr/bin/env node
/**
 * The engine/semantics contract, proven against the real driver.
 *
 * Three FULL journeys died reporting "no flt-semantics nodes after enabling"
 * while the product was identical to the one GOLDEN had passed against hours
 * earlier. The cause was a single 20 s budget shared by two phases: the engine
 * was still starting, the activation allowance paid for it, and the error named
 * the wrong one.
 *
 * A fake page drives the shipping driver, so these run in milliseconds with no
 * browser and no Sandbox — and, unlike a fast local PASS, they can hold the
 * engine back on purpose, which is the condition the defect needed.
 */
import { FlutterSemanticsDriver, DriverPhaseTimeout } from './e2e/app-web/lib/semantics-driver.mjs';

let failures = 0;
const check = (title, ok, detail = '') => {
  if (ok) return console.log(`  ✓ ${title}`);
  console.log(`  ✗ ${title}${detail ? `\n      ${detail}` : ''}`);
  failures++;
};

/**
 * A Flutter page that boots when told to. `engineAfter` is when the
 * accessibility placeholder appears; `activationTakes` is how long the
 * semantics tree needs once activation is dispatched.
 */
function fakePage({ engineAfter = 0, activationTakes = 20, engineNever = false, semanticsNever = false } = {}) {
  const born = Date.now();
  let activatedAt = null;
  const placeholderUp = () => !engineNever && Date.now() - born >= engineAfter;
  const semanticsUp = () => !semanticsNever && activatedAt !== null && Date.now() - activatedAt >= activationTakes;
  const present = (sel) => {
    const wantsPlaceholder = sel.includes('flt-semantics-placeholder');
    const wantsNodes = /(^|,\s*)flt-semantics(\s|$|,)/.test(sel) || sel.trim() === 'flt-semantics';
    return (wantsPlaceholder && placeholderUp()) || (wantsNodes && semanticsUp());
  };
  const page = {
    dispatched: 0,
    async waitForTimeout(ms) { await new Promise((r) => setTimeout(r, ms)); },
    async waitForSelector(sel, { timeout = 30000 } = {}) {
      const deadline = Date.now() + timeout;
      while (Date.now() < deadline) {
        if (present(sel)) return true;
        await new Promise((r) => setTimeout(r, 5));
      }
      throw new Error('timeout');
    },
    locator(sel) {
      return {
        async count() { return present(sel) ? 1 : 0; },
        first() {
          return { async dispatchEvent() { page.dispatched++; if (activatedAt === null) activatedAt = Date.now(); } };
        },
      };
    },
  };
  return page;
}

const drive = (opts) => new FlutterSemanticsDriver(fakePage(opts), { label: 'test' });
const budgets = { engineTimeout: 900, activationTimeout: 300 };
const outcome = async (d, o = budgets) => {
  try { await d.enableSemantics(o); return { ok: true }; }
  catch (e) { return { ok: false, phase: e.phase, err: e }; }
};

console.log('\nsemantics driver — engine and activation are two phases\n');

/* A · engine slow but inside its bound */
{
  const d = drive({ engineAfter: 500, activationTakes: 20 });
  const r = await outcome(d);
  check('A. a delayed engine, still inside the engine bound', r.ok, r.err?.message);
  check('A. …and the delay is charged to the ENGINE, not to activation',
    d.timing.engine_ready_ms >= 450 && d.timing.semantics_ready_ms < 250,
    JSON.stringify(d.timing));
}

/* THE key property: engine startup must not consume the activation budget.
   Engine takes 700 ms — more than twice the 300 ms activation allowance —
   and the call still succeeds, which the old shared-budget driver could not do. */
{
  const d = drive({ engineAfter: 700, activationTakes: 30 });
  const r = await outcome(d);
  check('A. engine startup longer than the WHOLE activation budget still passes', r.ok,
    'this is the exact shape that killed three FULL journeys');
  check('A. …with the phases attributed separately',
    d.timing.engine_ready_ms > budgets.activationTimeout, JSON.stringify(d.timing));
}

/* B · engine never ready */
{
  const r = await outcome(drive({ engineNever: true }));
  check('B. an engine that never starts → ENGINE_TIMEOUT', r.phase === 'ENGINE_TIMEOUT', `phase ${r.phase}`);
  check('B. …and it is a typed error, not a string match',
    r.err instanceof DriverPhaseTimeout);
}

/* C · engine ready, semantics never appears */
{
  const d = drive({ engineAfter: 50, semanticsNever: true });
  const r = await outcome(d);
  check('C. semantics that never appears → SEMANTICS_ACTIVATION_TIMEOUT',
    r.phase === 'SEMANTICS_ACTIVATION_TIMEOUT', `phase ${r.phase}`);
  check('C. …and the message says the engine WAS ready, so nobody chases the wrong phase',
    /engine was ready after \d+ ms/.test(r.err?.message ?? ''), r.err?.message);
}

/* D + E · idempotence */
{
  const d = drive({ engineAfter: 20, activationTakes: 20 });
  const first = await outcome(d);
  const dispatchedAfterFirst = d.page.dispatched;
  const second = await outcome(d);
  const third = await outcome(d);
  check('D. semantics already active → PASS', second.ok && third.ok);
  check('E. repeat calls dispatch no further activation',
    d.page.dispatched === dispatchedAfterFirst,
    `dispatched ${dispatchedAfterFirst} then ${d.page.dispatched}`);
  check('E. …and the first call is the one that did the work', first.ok && dispatchedAfterFirst >= 1);
}

/* waitForEngine alone is still usable and still idempotent */
{
  const d = drive({ engineAfter: 40 });
  const ms = await d.waitForEngine({ timeout: 900 });
  check('waitForEngine returns what it waited', typeof ms === 'number' && ms >= 0);
  await d.enableSemantics(budgets);
  check('…and calling it before enableSemantics changes nothing', (await outcome(d)).ok);
}

console.log(failures === 0
  ? `\n✓ E2E_SEMANTICS_DRIVER=PASS\n`
  : `\n✗ E2E_SEMANTICS_DRIVER=FAIL (${failures})\n`);
process.exit(failures === 0 ? 0 : 1);
