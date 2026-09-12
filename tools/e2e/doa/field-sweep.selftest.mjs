#!/usr/bin/env node
/**
 * field-sweep.selftest.mjs — the classifiers, shown deciding both ways.
 *
 * The sweep itself can only report on the product as it is. Run against a healthy
 * one it prints nothing but ticks, which says nothing about whether it would
 * notice a value that failed to render. These are the fabricated readings it must
 * classify correctly, including the two it got wrong when first written: a UUID
 * the product deliberately shows an operator, and a label that announces an
 * identifier without ending in the word.
 *
 * Usage: node tools/e2e/doa/field-sweep.selftest.mjs
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ENUM = /^[A-Z][A-Z0-9]{2,}(_[A-Z0-9]+)+$/;
const BROKEN = /^(undefined|null|NaN|Invalid Date|\[object Object\]|NaN Kz|undefined Kz)$/i;
const announced = (body, v) => { const at = body.indexOf(v);
  return at > 0 && /\b(id|ids|identificador|refer[eê]ncia|ref)\b/i.test(body.slice(Math.max(0, at - 60), at)); };

const cases = [
  ['a value that failed to render', () => BROKEN.test('undefined') && BROKEN.test('NaN Kz') && BROKEN.test('Invalid Date')],
  ['an unannounced UUID is residue', () => !announced('Beneficiário 0b71c7a9-bc36-4723-aaf5-4d2b5ec71826', '0b71c7a9-bc36-4723-aaf5-4d2b5ec71826')],
  ['an announced UUID is not', () => announced('Conta da campanha (id da conta Banzami) b16ac1a3-fb6f-4cf8-9dad-23909a4c8327', 'b16ac1a3-fb6f-4cf8-9dad-23909a4c8327')],
  ['a raw enum is residue', () => ENUM.test('PAYMENT_CONFIRMED') && ENUM.test('OTP_VERIFIED')],
  ['a human label is not an enum', () => !ENUM.test('Verificada') && !ENUM.test('SANDBOX')],
  ['a UUID is recognised as one', () => UUID.test('84b0e8e6-fbda-417e-a537-19ad8574827a')],
  ['a handle is not a UUID', () => !UUID.test('@fm65')],
];
let bad = 0;
for (const [name, f] of cases) { const r = f(); console.log(`  ${r ? '✓' : '✗'} ${name}`); if (!r) bad += 1; }
process.exit(bad ? 1 : 0);
