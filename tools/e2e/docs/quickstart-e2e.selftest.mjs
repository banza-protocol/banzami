#!/usr/bin/env node
/**
 * The quickstart summary cannot lie.
 *
 * The summary used to mean "none of my assertions failed", and printed PASS
 * over six unproven steps. These cases pin the three ways that can happen again:
 * a step that never ran, a step still waiting on a human, and a summary edited
 * to say PASS directly. Each must refuse.
 */
import assert from 'node:assert/strict';
import { RUBRIC, summarise, assertConsistent } from './quickstart-e2e.mjs';

const all = (verdict) => RUBRIC.map((name, i) => ({ n: i + 1, name, verdict }));
let passed = 0;
const it = (name, fn) => { fn(); passed += 1; console.log(`  ✓ ${name}`); };

console.log('quickstart summary — self-test\n');

it('the rubric is exactly the twelve steps of DOCS-PROD-001 §6', () => {
  assert.equal(RUBRIC.length, 12);
  assert.equal(RUBRIC[3], 'Complete or connect Financial Setup');
  assert.equal(RUBRIC[10], 'Receive webhook');
});

it('all twelve PASS → summary PASS', () => {
  const s = all('PASS');
  assert.equal(summarise(s).verdict, 'PASS');
  assertConsistent(s, summarise(s));
});

it('a step that never ran makes the summary FAIL — silence is not success', () => {
  const s = all('PASS'); s[7].verdict = 'NOT_RUN';
  assert.equal(summarise(s).verdict, 'FAIL');
});

it('a step waiting on operator review makes the summary FAIL', () => {
  const s = all('PASS'); s[3].verdict = 'PENDING';
  assert.equal(summarise(s).verdict, 'FAIL');
  assert.equal(summarise(s).passed, 11);
});

it('the old shape — six proven, six absent — is FAIL, not PASS', () => {
  const s = all('NOT_RUN');
  for (const n of [1, 2, 3, 5, 6, 7]) s[n - 1].verdict = 'PASS';
  assert.equal(summarise(s).verdict, 'FAIL');
  assert.equal(summarise(s).passed, 6);
});

it('a summary forced to PASS beside a non-PASS step is REFUSED, not printed', () => {
  const s = all('PASS'); s[10].verdict = 'FAIL';
  assert.throws(() => assertConsistent(s, { verdict: 'PASS', passed: 12, total: 12 }), /INCONSISTENT: summary PASS/);
});

it('a summary forced to FAIL beside twelve PASS is refused too', () => {
  assert.throws(() => assertConsistent(all('PASS'), { verdict: 'FAIL', passed: 12, total: 12 }), /INCONSISTENT/);
});

it('a report with the wrong number of steps is refused', () => {
  assert.throws(() => summarise(all('PASS').slice(0, 10)), /twelve|12 steps/);
});

console.log(`\n✓ ${passed}/8 — the summary is derived and cannot contradict its steps`);
