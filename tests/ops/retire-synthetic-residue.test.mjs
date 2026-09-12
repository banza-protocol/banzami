// tools/ops/retire-synthetic-residue.sh retires what the harnesses left on the
// Sandbox. What it must never do is reach a real account, change a row itself,
// or act without being asked. Each of those is checked here against the script
// as written — the shapes are run against real and harness names, not read.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(join(import.meta.dirname, '../../tools/ops/retire-synthetic-residue.sh'), 'utf8');

// The shell variable as the database sees it: double-quoted shell, so \\ is \.
function shape(name) {
  const m = SRC.match(new RegExp(`^${name}="([^"]*)"`, 'm'));
  assert.ok(m, `${name} not found`);
  return new RegExp(m[1].replace(/\\\\/g, '\\'), name === 'MAIL' ? 'i' : '');
}

test('nothing changes without --apply', () => {
  const dry = SRC.indexOf('if [ "$APPLY" -eq 0 ]');
  assert.ok(dry > 0, 'no dry-run exit');
  assert.match(SRC.slice(dry, dry + 200), /exit 0/);
  for (const call of ['core POST', 'core DELETE', 'gw DELETE', 'dev "/internal']) {
    const first = SRC.indexOf(call);
    assert.ok(first > dry, `${call} appears before the dry-run exit`);
  }
});

test('the script never writes a row itself — every change is an API call', () => {
  const code = SRC.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
  assert.doesNotMatch(code, /\b(UPDATE\s+\w|INSERT\s+INTO|DELETE\s+FROM|TRUNCATE|DROP\s)/i);
  assert.match(code, /default_transaction_read_only=on/, 'the query helper is not read-only');
  // One helper reaches the database, and it is the read-only one.
  assert.equal((code.match(/\bpsql\b/g) || []).length, 1);
});

test('harness merchants match; real ones do not', () => {
  const FIX = shape('FIX');
  const MAIL = shape('MAIL');
  for (const n of ['E2E gja f120017b', 'smoke-sandbox-default-127124835', 'settle-ORDINARY-2119217102',
    'Recibo 89698', 'Loja Genérica mtw1j2ce', 'KYB Atencao mtvyef72', 'Sandbox · Cleanroom Sandbox',
    'Sandbox · External Cleanroom Settlement', 'Sandbox · isolation-A-774722435', 'M21203', 'BS2592624697']) {
    assert.match(n, FIX, n);
  }
  for (const n of ['Doa', 'Sandbox · DOA Sandbox', 'Sandbox · Doa-Sandbox', 'Cantina da Maria',
    'Sandbox · Loja do Bairro', 'Taxi Luanda']) {
    assert.doesNotMatch(n, FIX, n);
  }
  assert.match('x@synthetic.test', MAIL);
  assert.match('e2e@banzami-e2e.test', MAIL);
  // The Console gives every project's merchant this domain — real ones too.
  assert.doesNotMatch('sandbox-p4c670430d854@projects.banzami.test', MAIL);
  assert.doesNotMatch('contact@doadoa.app', MAIL);
});

test('harness projects and workspaces match; DOA and a real developer do not', () => {
  const PFIX = shape('PFIX');
  const WSFIX = shape('WSFIX');
  for (const n of ['gj-a-f120017b', 'onbui-a-mtvvlodj', 'Cleanroom Control 1788909889111', 'Final Cleanroom a5f7f20c',
    'Setup Probe Two', 'External Cleanroom Settlement']) {
    assert.match(n, PFIX, n);
  }
  for (const n of ['DOA Sandbox', 'Doa-Sandbox', 'Loja Online', 'Cleanroom Sandbox 2']) {
    assert.doesNotMatch(n, PFIX, n);
  }
  for (const n of ['DevPlatform 21203 workspace', 'gj-b-2aa36a14 workspace', 'onbui-ws-mtvvlodj', 'rcpt-ws-mtw1j2ce']) {
    assert.match(n, WSFIX, n);
  }
  for (const n of ['DOA', 'DOA workspace', 'Cleanroom Dev', 'External Cleanroom', 'Minha Empresa']) {
    assert.doesNotMatch(n, WSFIX, n);
  }
});

test("DOA's workspaces are excluded from every merchant and project selection", () => {
  assert.match(SRC, /DOA_WS="SELECT id FROM developer\.dev_workspaces WHERE name IN \('DOA','DOA workspace'\)"/);
  assert.match(SRC, /M_SEL="m\.id NOT IN \(\$DOA_MERCHANTS\)/);
  assert.match(SRC, /P_SHAPE="dp\.workspace_id NOT IN \(\$DOA_WS\)/);
});

test('real consumers are excluded by name and by shape', () => {
  // The whole selector, however many shapes it grows. The first form of this
  // test matched exactly three shapes in sequence, so adding a fourth broke the
  // parse rather than the protection — and a guard that fails to read the thing
  // it guards protects nothing.
  const block = SRC.match(/C_SEL="([\s\S]*?)"\n/);
  assert.ok(block, 'C_SEL not found');
  const shapes = [...block[1].matchAll(/c\.handle ~ '([^']+)'/g)]
    .map((x) => new RegExp(x[1].replace(/\\\$/g, '$')));
  assert.ok(shapes.length >= 6, `expected the six machine shapes, found ${shapes.length}`);

  const generic = shapes[0];
  const byShape = (h, name) => (generic.test(h) && !name) || shapes.slice(1).some((r) => r.test(h));

  // Machine-made handles, each from a harness that actually produced them.
  for (const h of ['cs87374p', 'd21203s1', 'se497871', 'fin19727', 'ra89698s1', 'rcamtw1j2ce',
                   'wd22961p', 'k27158s1', 'e2esend92b332', 'e2ercvcffe77',
                   'shapeprobemtywfz64a', 'app001recvmtywgll7']) {
    assert.ok(byShape(h, null), h);
  }

  // People. A shape that catches one of these is a shape that closes a real
  // account, which is the failure this whole selector is built to avoid.
  assert.ok(!byShape('fm65', 'Fidel'), 'fm65');
  assert.ok(!byShape('joao2024', 'João'), 'a person who picked digits and a name');
  assert.ok(!byShape('oxfannio', 'Oxfannio'));
  assert.ok(!byShape('fidel', null), 'fidel must NOT be reachable by any shape');
  assert.match(SRC, /c\.handle NOT IN \('fm65','oxfannio','priscila'\)/);

  // @fidel is selected by its exact id and nothing else: it is a handle a person
  // chose, and the pattern that caught it once would catch somebody else later.
  assert.match(block[1], /c\.id = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'/,
    'the APP-001 device account must be selected by exact id, never by a shape');
});

test('DOA demo accounts are chosen by the harness signature, never by owner alone', () => {
  const m = SRC.match(/DEMO_SEL="([\s\S]*?)"/);
  assert.ok(m);
  for (const part of [
    "wa.label IN ('Campanha A — demo','Campanha B — demo')",
    "wa.reference_type = 'DOA_CAMPAIGN'",
    "wa.reference_id ~ '^seg-[ab]-[0-9]+\\$'",
    "wa.purpose = 'CAMPAIGN'",
  ]) {
    assert.ok(m[1].includes(part), `DEMO_SEL lost: ${part}`);
  }
});
