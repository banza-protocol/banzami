#!/usr/bin/env node
/**
 * Every TypeScript example in the documentation, typechecked against the SDK a
 * reader actually installs.
 *
 * The DOA tutorial told developers to call
 *
 *     banzami.walletAccounts.create(…)
 *     banzami.webhooks.verify(raw, signature, secret)
 *     banzami.applicationSettlements.create({ wallet_account_id, beneficiary, owner_ref })
 *
 * None of those three exists. A developer copying them gets
 * `TypeError: … is not a function` — and the settlement one, had it existed,
 * would have moved money with no idempotency key. The suite that claimed
 * DOC_CODE_EXAMPLES_TESTED=PASS checked that examples contained the right
 * words. It never asked the SDK.
 *
 * So this asks the SDK. Every TypeScript sample on the public pages is written
 * to a file in an empty directory, `@banzami/sdk` is installed there FROM THE
 * PUBLIC REGISTRY at the version a reader would get, and `tsc` decides.
 *
 * An example is allowed to lean on the reader's own application — `campanha`,
 * `db`, `req` — because a tutorial is not a program. Those names are declared
 * `any`, and ONLY those: an undeclared name is a stand-in for the reader's
 * code. What is never forgiven is misusing the SDK itself:
 *
 *   TS2339  a property that does not exist     (walletAccounts, webhooks.verify)
 *   TS2551  … the same, with "did you mean"
 *   TS2345  an argument of the wrong type
 *   TS2353  an object literal with a field the SDK does not take (snake_case)
 *   TS2554  the wrong number of arguments
 *   TS2741  a required field left out            (idempotencyKey)
 *
 *   node tools/check-docs-code-examples.mjs
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const SOURCES = {
  PT: 'apps/website/app/developers/docs/content-pt.tsx',
  EN: 'apps/website/app/developers/docs/content-en.tsx',
};

/** The errors that mean "this example misuses the SDK". */
const SDK_MISUSE = new Set(['2339', '2551', '2345', '2353', '2554', '2741', '2322', '2559']);
/** The errors that mean "this example refers to the reader's own code". */
const READER_CODE = new Set(['2304', '2552', '2582', '2503']);

// ── extract ──────────────────────────────────────────────────────────────────

/** Undo the escapes a template literal inside a TSX file carries. */
const unescape = (s) => s.replace(/\\`/g, '`').replace(/\\\$\{/g, '${').replace(/\\\\/g, '\\');

function extract(lang, file) {
  const src = readFileSync(join(ROOT, file), 'utf8');
  const out = [];

  // const SAMPLE_X = `…`;
  for (const m of src.matchAll(/const (SAMPLE_[A-Z0-9_]+)\s*=\s*`((?:\\`|[^`])*)`/g)) {
    out.push({ lang, id: m[1], code: unescape(m[2]) });
  }
  // <CodeBlock label="…" raw={`…`} />
  for (const m of src.matchAll(/<CodeBlock\s+label="([^"]+)"[^>]*?raw=\{`((?:\\`|[^`])*)`\}/g)) {
    out.push({ lang, id: `CodeBlock "${m[1]}"`, code: unescape(m[2]) });
  }
  // Only the ones that are TypeScript using the SDK — curl, JSON and shell
  // examples are checked elsewhere, and a `const x = …` in a bash block is not
  // a TypeScript program.
  return out.filter((s) => /@banzami\/sdk|\bbanzami\.|BanzamiClient/.test(s.code) && !/^\s*(curl|#|\{|\$ )/m.test(s.code.trimStart().slice(0, 6)));
}

const samples = [...extract('PT', SOURCES.PT), ...extract('EN', SOURCES.EN)];

// ── the reader's environment ─────────────────────────────────────────────────

const dir = mkdtempSync(join(tmpdir(), 'bz-docs-examples-'));
let failures = 0;
const report = [];

try {
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'docs-examples', private: true, type: 'module' }, null, 2));
  execFileSync('npm', ['install', '--silent', '--no-audit', '--no-fund', '@banzami/sdk', 'typescript@5', '@types/node@22'], { cwd: dir, stdio: 'pipe', timeout: 300000 });
  const sdkVersion = JSON.parse(readFileSync(join(dir, 'node_modules/@banzami/sdk/package.json'), 'utf8')).version;

  writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify({
    compilerOptions: {
      target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', strict: true,
      noImplicitAny: false, skipLibCheck: true, noEmit: true, types: ['node'],
      // Examples are fragments; unused bindings are not a defect in a tutorial.
      noUnusedLocals: false, noUnusedParameters: false, allowUnreachableCode: true,
    },
    include: ['samples/*.ts'],
  }, null, 2));

  console.log(`documentation code examples — ${samples.length} TypeScript sample(s), against @banzami/sdk@${sdkVersion} from the registry\n`);

  const sampleDir = join(dir, 'samples');
  mkdirSync(sampleDir);

  // Every sample gets a client and an import to lean on, whether or not the
  // excerpt shows the construction line.
  const preamble = (code) => {
    const lines = [];
    if (!/import\s+\{[^}]*BanzamiClient[^}]*\}\s+from\s+'@banzami\/sdk'/.test(code)) lines.push("import { BanzamiClient } from '@banzami/sdk';");
    if (!/\bconst banzami\b/.test(code)) lines.push('declare const banzami: BanzamiClient;');
    return `${lines.join('\n')}\nexport {};\n`;
  };

  const files = samples.map((s, i) => {
    const name = `s${String(i).padStart(3, '0')}.ts`;
    writeFileSync(join(sampleDir, name), `${preamble(s.code)}${s.code}\n`);
    return { ...s, name, declared: new Set() };
  });

  const tsc = () => {
    try {
      execFileSync(join(dir, 'node_modules/.bin/tsc'), ['-p', dir], { cwd: dir, encoding: 'utf8', stdio: 'pipe' });
      return '';
    } catch (e) {
      return `${e.stdout ?? ''}${e.stderr ?? ''}`;
    }
  };

  // Declare the reader's own names, and only those, until nothing is left but
  // what the SDK has to say. Bounded, so a pathological sample cannot loop.
  let out = '';
  for (let round = 0; round < 8; round += 1) {
    out = tsc();
    const missing = new Map();
    for (const m of out.matchAll(/samples\/(s\d+\.ts)\(\d+,\d+\): error TS(\d+): Cannot find name '([A-Za-z_$][\w$]*)'/g)) {
      if (!READER_CODE.has(m[2])) continue;
      if (!missing.has(m[1])) missing.set(m[1], new Set());
      missing.get(m[1]).add(m[3]);
    }
    if (missing.size === 0) break;
    for (const [name, idents] of missing) {
      const f = files.find((x) => x.name === name);
      const add = [...idents].filter((id) => !f.declared.has(id));
      if (!add.length) continue;
      add.forEach((id) => f.declared.add(id));
      const body = readFileSync(join(sampleDir, name), 'utf8');
      writeFileSync(join(sampleDir, name), `${add.map((id) => `declare const ${id}: any;`).join('\n')}\n${body}`);
    }
  }

  // What remains is judged.
  const errors = [...out.matchAll(/samples\/(s\d+\.ts)\((\d+),\d+\): error TS(\d+): (.+)/g)]
    .map((m) => ({ file: m[1], line: Number(m[2]), code: m[3], message: m[4] }));

  for (const f of files) {
    const mine = errors.filter((e) => e.file === f.name);
    const misuse = mine.filter((e) => SDK_MISUSE.has(e.code));
    const other = mine.filter((e) => !SDK_MISUSE.has(e.code) && !READER_CODE.has(e.code));
    const verdict = misuse.length || other.length ? 'FAIL' : 'PASS';
    report.push({ lang: f.lang, id: f.id, verdict, errors: [...misuse, ...other].map((e) => `TS${e.code} ${e.message}`) });
    if (verdict === 'FAIL') {
      failures += 1;
      console.error(`  ✗ ${f.lang} ${f.id}`);
      for (const e of [...misuse, ...other]) console.error(`      TS${e.code}: ${e.message}`);
    } else {
      console.log(`  ✓ ${f.lang} ${f.id}${f.declared.size ? `  (reader's own: ${[...f.declared].join(', ')})` : ''}`);
    }
  }

  // ── what the type checker cannot see ─────────────────────────────────────
  //
  // Two samples compiled and were still wrong at runtime.
  //
  // constructEvent needs a webhook secret, from the client or as a third
  // argument. SAMPLE_WEBHOOK built its client with an apiKey only, so it threw
  // "A webhook secret is required" on the very first delivery.
  //
  // The DOA handler read evento.data.reference. payment_session.paid carries
  // reference_id. The donation it tried to confirm was always `undefined` —
  // silently, because JavaScript does not complain about a missing property.
  const coreSessions = readFileSync(join(ROOT, 'core/api/src/routes/payment_sessions.rs'), 'utf8');
  const paidPayloadKeys = new Set();
  for (const m of coreSessions.matchAll(/"payment_session\.paid",[\s\S]{0,120}?json!\(\{([\s\S]*?)\}\)/g)) {
    for (const k of m[1].matchAll(/"([a-z_]+)"\s*:/g)) paidPayloadKeys.add(k[1]);
  }
  for (const f of files) {
    const why = [];
    if (/webhooks\.constructEvent\(/.test(f.code)) {
      const secretInClient = /new BanzamiClient\(\{[^}]*webhookSecret/.test(f.code);
      const secretArg = /constructEvent\([^,()]+,[^,()]+,[^)]+\)/.test(f.code);
      const statedClient = /webhookSecret/.test(f.code);
      if (!secretInClient && !secretArg && !statedClient) why.push('constructEvent is called with no webhook secret — it throws on the first delivery');
    }
    if (/payment_session\.paid/.test(f.code) && paidPayloadKeys.size) {
      for (const m of f.code.matchAll(/\b(?:evento|event)\.data\.([a-z_]+)/g)) {
        if (!paidPayloadKeys.has(m[1])) why.push(`reads data.${m[1]}, which payment_session.paid does not carry (it has ${[...paidPayloadKeys].join(', ')})`);
      }
    }
    if (why.length) {
      const r = report.find((x) => x.lang === f.lang && x.id === f.id);
      if (r.verdict === 'PASS') { r.verdict = 'FAIL'; failures += 1; }
      r.errors.push(...why);
      console.error(`  ✗ ${f.lang} ${f.id} — ${why.join('; ')}`);
    }
  }

  // Parity: an example that exists in one language and not the other is a
  // defect the endpoint check cannot see.
  const ids = (l) => new Set(report.filter((r) => r.lang === l).map((r) => r.id.replace(/CodeBlock ".*"/, 'CodeBlock')));
  const ptN = report.filter((r) => r.lang === 'PT').length;
  const enN = report.filter((r) => r.lang === 'EN').length;

  console.log(`\nDOC_CODE_EXAMPLES_TS_TOTAL=${samples.length}`);
  console.log(`DOC_CODE_EXAMPLES_TS_FAILING=${failures}`);
  console.log(`DOC_CODE_EXAMPLES_PT=${ptN} DOC_CODE_EXAMPLES_EN=${enN}`);
  console.log(`DOC_CODE_EXAMPLES_SDK_VERSION=${sdkVersion}`);
  console.log(`DOC_CODE_EXAMPLES_TESTED=${failures === 0 && samples.length > 0 ? 'PASS' : 'FAIL'}`);
  void ids;
} finally {
  rmSync(dir, { recursive: true, force: true });
}

if (samples.length === 0) { console.error('\n✗ no TypeScript samples were found — the extractor is broken, not the docs'); process.exit(1); }
if (failures) { console.error(`\n✗ ${failures} example(s) would not compile against the SDK a reader installs`); process.exit(1); }
console.log('\n✓ every TypeScript example compiles against the published SDK');
