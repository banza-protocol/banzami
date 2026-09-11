/**
 * Every "N Kz" comment in an SDK README agrees with the minor-unit amount on
 * its line.
 *
 *   node --test tests/ops/sdk-readme-money.test.mjs
 *
 * AOA minor units are cêntimos: 1 Kz = 100 minor units (core/types
 * currency.rs, docs/architecture/money-engine.md). The TypeScript, Python and
 * PHP READMEs annotated amounts as if 1 minor unit were 1 Kz —
 * `amountMinor: 12500, // 12 500 Kz` is 125 Kz — and the TypeScript and Python
 * money helpers printed amounts the same way. An integrator reading them charged
 * 100 times less than intended. This reads every fenced code line that carries a
 * `// … N Kz` or `# … N Kz` comment and requires amount == N × 100.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { join } from 'node:path';
import { readFileSync, readdirSync, existsSync } from 'node:fs';

const REPO = join(import.meta.dirname, '../..');

/** [{ line, amount, kzMinor }] for each annotated code line in `markdown`. */
export function annotatedAmounts(markdown) {
  const out = [];
  const fence = /```[a-zA-Z]*\n([\s\S]*?)```/g;
  for (const [, code] of markdown.matchAll(fence)) {
    for (const line of code.split('\n')) {
      // The comment and the kwanza value it states: `// … 1 500 Kz`, `# "500 Kz"`.
      const m = line.match(/(\/\/|\s#)[^\n]*?(\d{1,3}(?:[  .]\d{3})*|\d+)(?:,(\d{2}))?\s*Kz/);
      if (!m) continue;
      const codePart = line.slice(0, m.index);
      const ints = codePart.match(/\b\d[\d_]*\b/g);
      if (!ints) continue; // prose comment on a line with no amount
      const amount = Number(ints[ints.length - 1].replace(/_/g, ''));
      const kzMinor = Number(m[2].replace(/[  .]/g, '')) * 100 + Number(m[3] ?? 0);
      out.push({ line: line.trim(), amount, kzMinor });
    }
  }
  return out;
}

function sdkReadmes() {
  const dir = join(REPO, 'sdk');
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => join('sdk', e.name, 'README.md'))
    .filter((p) => existsSync(join(REPO, p)));
}

describe('SDK README amount comments use 1 Kz = 100 minor units', () => {
  it('finds the annotated amounts it is meant to check', () => {
    const all = sdkReadmes().flatMap((p) => annotatedAmounts(readFileSync(join(REPO, p), 'utf8')));
    assert.ok(all.length >= 15, `expected the READMEs' annotated amounts, found ${all.length}`);
  });

  for (const rel of sdkReadmes()) {
    it(`${rel}: every "N Kz" comment matches its amount`, () => {
      const wrong = annotatedAmounts(readFileSync(join(REPO, rel), 'utf8'))
        .filter((a) => a.amount !== a.kzMinor)
        .map((a) => `${a.line}  (amount ${a.amount} minor = ${a.amount / 100} Kz)`);
      assert.deepEqual(wrong, []);
    });
  }

  // The guard fails for the reason it exists.
  it('reports a comment that reads minor units as kwanzas', () => {
    const sample = "```ts\n  amountMinor: 12500,          // 12 500 Kz\n  amountMinor: 12500, // 125 Kz\n```\n";
    const wrong = annotatedAmounts(sample).filter((a) => a.amount !== a.kzMinor);
    assert.equal(wrong.length, 1);
    assert.match(wrong[0].line, /12 500 Kz/);
  });
});
