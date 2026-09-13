#!/usr/bin/env node
/**
 * The published event catalogue against the events the operator actually emits.
 *
 * Three lists have to agree and, until 2026-09-13, two of them did not:
 *
 *   EMITTED      core's routes, and the gateway handler — what actually fires
 *   REGISTRABLE  service.SupportedWebhookEvents — what a subscription accepts
 *   DOCUMENTED   the EVENTS constant on /docs (PT and EN)
 *
 * The docs listed five. Core emits seven. `payment_session.created` and
 * `refund.completed` were emitted, were registrable, and appeared in no public
 * catalogue — so an integrator building refunds had no way to learn that
 * `refund.completed` exists, which is precisely the thing a webhook catalogue is
 * for. There was already a test holding REGISTRABLE ⊇ EMITTED; nothing held the
 * documentation to either.
 *
 * The rule here is EMISSION, not registrability, and it runs both ways:
 *
 *   · every emitted event must be documented — otherwise the catalogue is a
 *     partial answer presented as a complete one;
 *   · every documented event must be emitted — otherwise the catalogue promises
 *     an endpoint that never fires, which is worse than silence.
 *
 * `payment.completed` and `payout.sent` are registrable and NOT emitted. They
 * are deliberately absent from the docs and this check keeps them absent: the
 * gateway accepts the subscription so a name can be published ahead of its
 * implementation, and the public catalogue is not the place to do that.
 *
 *   node tools/check-webhook-event-catalogue.mjs
 */
// Type-stripped .ts modules warn about the package type; the warning is noise here.
process.removeAllListeners('warning');
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/** Names shaped like an operator event, anywhere in a source file. */
const EVENT_RE = /"((?:payment_session|application_settlement|refund|payment_link|payment|payout)\.[a-z_]+)"/g;

/** What core and the gateway actually emit. */
function emitted() {
  const found = new Set();
  const coreDir = 'core/api/src/routes';
  for (const f of readdirSync(join(ROOT, coreDir))) {
    if (!f.endsWith('.rs') || f.includes('_tests')) continue;
    const src = read(join(coreDir, f));
    // Only where an event is being published, not where one is named in prose.
    for (const m of src.matchAll(EVENT_RE)) if (/event|webhook|emit|publish/i.test(src.slice(Math.max(0, m.index - 200), m.index))) found.add(m[1]);
  }
  const gwDir = 'services/api-gateway/internal/handler';
  for (const f of readdirSync(join(ROOT, gwDir))) {
    if (!f.endsWith('.go') || f.endsWith('_test.go')) continue;
    for (const m of read(join(gwDir, f)).matchAll(/EventType:\s*"([a-z_.]+)"/g)) found.add(m[1]);
  }
  return found;
}

/** What a subscription is allowed to name. */
function registrable() {
  const src = read('services/api-gateway/internal/service/webhooks.go');
  const block = src.slice(src.indexOf('var SupportedWebhookEvents'), src.indexOf('MaxWebhookURLLength'));
  return new Set([...block.matchAll(/"([a-z_.]+)":\s*true/g)].map((m) => m[1]));
}

/** What the public catalogue publishes: the event reference both languages render. */
const { EVENT_DOCS } = await import(pathToFileURL(join(ROOT, 'apps/website/app/developers/docs/events.ts')).href);
const documented = () => new Set(EVENT_DOCS.map((e) => e.name));

/** The keys an emitter writes into `data` for one event. */
function emittedKeys(event, sources) {
  const keys = new Set();
  for (const file of sources) {
    const src = read(file);
    if (file.endsWith('domain.rs')) {
      // application_settlement.*: data is the serialised aggregate.
      const struct = /pub struct ApplicationSettlement \{([\s\S]*?)\n\}/.exec(src);
      for (const m of struct?.[1].matchAll(/pub (\w+):/g) ?? []) keys.add(m[1]);
      continue;
    }
    for (const at of src.matchAll(new RegExp(`"${event.replace('.', '\\.')}",`, 'g'))) {
      const after = src.slice(at.index, at.index + 3000);
      const json = /serde_json::json!\(\{([\s\S]*?)\n\s*\}\)/.exec(after);
      if (json && json.index < 400) for (const m of json[1].matchAll(/"([a-z_]+)":/g)) keys.add(m[1]);
    }
    // payment_link.paid: the link row as json_build_object, plus refund_source.
    const fn = new RegExp(`fn \\w+[\\s\\S]{0,2500}?"${event.replace('.', '\\.')}"`).exec(src);
    if (fn) {
      for (const m of fn[0].matchAll(/'([a-z_]+)', [a-z_]+(?:::text)?/g)) keys.add(m[1]);
      for (const m of fn[0].matchAll(/data\["([a-z_]+)"\]/g)) keys.add(m[1]);
    }
  }
  return keys;
}

const EMITTED = emitted();
const REGISTRABLE = registrable();
const PT = documented();
const EN = documented();

let failures = 0;
const fail = (m, d) => { console.error(`  ✗ ${m}${d ? `\n      ${d}` : ''}`); failures += 1; };
const pass = (m) => console.log(`  ✓ ${m}`);
const sorted = (s) => [...s].sort();

console.log(`webhook event catalogue\n  emitted ${EMITTED.size} · registrable ${REGISTRABLE.size} · documented PT ${PT.size} / EN ${EN.size}\n`);

// ── every emitted event is documented ────────────────────────────────────────
{
  const missing = sorted(EMITTED).filter((e) => !PT.has(e) || !EN.has(e));
  missing.length
    ? fail(`DOC_EVENTS_MISSING = ${missing.length}`, missing.map((e) => `${e} — emitted, not in ${!PT.has(e) ? 'PT' : ''}${!PT.has(e) && !EN.has(e) ? ' and ' : ''}${!EN.has(e) ? 'EN' : ''}`).join('\n      '))
    : pass(`DOC_EVENTS_MISSING = 0 — all ${EMITTED.size} emitted events are published in both languages`);
}

// ── nothing is documented that never fires ───────────────────────────────────
{
  const phantom = sorted(new Set([...PT, ...EN])).filter((e) => !EMITTED.has(e));
  phantom.length
    ? fail(`DOC_EVENTS_NOT_EMITTED = ${phantom.length}`, `${phantom.join(', ')} — published, but nothing emits them; a subscriber would wait forever`)
    : pass('DOC_EVENTS_NOT_EMITTED = 0 — every published event is one the operator actually sends');
}

// ── the two languages publish the same catalogue ─────────────────────────────
{
  const only = (a, b, l) => sorted(a).filter((e) => !b.has(e)).map((e) => `${e} (only ${l})`);
  const diff = [...only(PT, EN, 'PT'), ...only(EN, PT, 'EN')];
  diff.length
    ? fail(`DOC_EVENT_CATALOGUE_PT_EN_DRIFT = ${diff.length}`, diff.join(', '))
    : pass('DOC_EVENT_CATALOGUE_PT_EN_DRIFT = 0 — PT and EN publish the same set');
}

// ── an emitted event a subscriber cannot register for ────────────────────────
//
// Held in the Go suite already; repeated here so this file answers the whole
// question rather than two thirds of it.
{
  const unregistrable = sorted(EMITTED).filter((e) => !REGISTRABLE.has(e));
  unregistrable.length
    ? fail(`EMITTED_BUT_NOT_REGISTRABLE = ${unregistrable.length}`, `${unregistrable.join(', ')} — fires, but a subscription naming it is refused`)
    : pass('EMITTED_BUT_NOT_REGISTRABLE = 0 — every event that fires can be subscribed to');
}

// ── every event is a complete mini reference, true to its emitter ─────────────
{
  const shell = read('apps/website/app/developers/docs/shell.tsx');
  const slugs = new Set([...shell.matchAll(/slug: '([a-z-]*)'/g)].map((m) => m[1]));
  const reference = read('apps/website/app/developers/docs/reference.tsx');
  const missing = [];
  const dead = [];
  for (const e of EVENT_DOCS) {
    const bi = (v) => v && typeof v.pt === 'string' && v.pt.trim() && typeof v.en === 'string' && v.en.trim();
    for (const k of ['resource', 'when', 'action', 'dedupe', 'ordering', 'sandbox']) if (!bi(e[k])) missing.push(`${e.name}: ${k} missing in a language`);
    if (!e.fields?.length) missing.push(`${e.name}: no fields`);
    for (const f of e.fields ?? []) if (!f.type || !bi(f.note)) missing.push(`${e.name}: field ${f.name} lacks a type or a note in both languages`);
    if (!slugs.has(e.guide)) missing.push(`${e.name}: guide "${e.guide}" is not a page`);
    if (!reference.includes(`id: '${e.endpoint}'`)) missing.push(`${e.name}: endpoint ${e.endpoint} is not in the reference`);
    if (e.doa !== null && !bi(e.doa)) missing.push(`${e.name}: DOA usage in one language only`);
    let sample;
    try { sample = JSON.parse(e.sample); } catch { missing.push(`${e.name}: the sample is not JSON`); }
    if (sample) {
      if (sample.type !== e.name) missing.push(`${e.name}: the sample's type is ${sample.type}`);
      for (const k of ['id', 'type', 'created_at', 'data']) if (!(k in sample)) missing.push(`${e.name}: the sample envelope lacks ${k}`);
      for (const k of Object.keys(sample.data ?? {})) if (!e.fields.some((f) => f.name === k)) dead.push(`${e.name}: the sample carries ${k}, which the reference does not document`);
    }
    const keys = emittedKeys(e.name, e.source);
    if (!keys.size) dead.push(`${e.name}: no keys read from ${e.source.join(', ')}`);
    for (const f of e.fields ?? []) {
      // Money fields of the settlement aggregate serialise as { amount_minor, currency }.
      if (!keys.has(f.name)) dead.push(`${e.name}: ${f.name} is documented, the emitter never writes it`);
    }
  }
  missing.length
    ? fail(`EVENT_REFERENCE_REQUIRED_FIELDS_MISSING = ${missing.length}`, missing.join('\n      '))
    : pass(`EVENT_REFERENCE_REQUIRED_FIELDS_MISSING = 0 — every event says when, what, what to do, duplicates, ordering and Sandbox, in both languages`);
  dead.length
    ? fail(`EVENT_REFERENCE_DEAD_FIELDS = ${dead.length}`, dead.join('\n      '))
    : pass('EVENT_REFERENCE_DEAD_FIELDS = 0 — every documented field is one the emitter writes');
}

console.log(`\n  emitted:     ${sorted(EMITTED).join(', ')}`);
console.log(`  documented:  ${sorted(PT).join(', ')}`);
const ahead = sorted(REGISTRABLE).filter((e) => !EMITTED.has(e));
if (ahead.length) console.log(`  registrable but not emitted (deliberately undocumented): ${ahead.join(', ')}`);

if (failures) { console.error(`\n✗ ${failures} catalogue failure(s)`); process.exit(1); }
console.log('\nEVENT_REFERENCE_ACTIONABLE=PASS\nEVENT_REFERENCE_ALL_EMITTED=PASS');
console.log('\n✓ the published catalogue is exactly what the operator emits');
