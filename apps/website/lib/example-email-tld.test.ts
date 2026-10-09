// @vitest-environment node
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

// An example address shown to a user (a placeholder, a hint) ends in .com —
// everywhere. Forms used to disagree: nome@exemplo.ao on one, name@example.com
// on the next, email@empresa.co.ao on a third (owner decision, 2026-10-10).
const WEBSITE = join(__dirname, '..');
const MOBILE = join(WEBSITE, '..', 'mobile', 'lib');

function files(dir: string, exts: RegExp, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next' || name === 'build') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) files(p, exts, out);
    else if (exts.test(name) && !/\.test\.|_test\.dart$/.test(name)) out.push(p);
  }
  return out;
}

const EXAMPLE = /@(?:exemplo|example|empresa)(?:\.[a-z]+)+/g;

describe('example e-mail addresses end in .com', () => {
  it('in the website and in the app', () => {
    const scanned = [
      ...files(join(WEBSITE, 'app'), /\.tsx?$/),
      ...files(join(WEBSITE, 'components'), /\.tsx?$/),
      ...files(MOBILE, /\.dart$/),
    ];
    expect(scanned.length).toBeGreaterThan(100);
    const hits: string[] = [];
    for (const f of scanned) {
      for (const m of readFileSync(f, 'utf8').match(EXAMPLE) ?? []) {
        if (!/@(?:exemplo|example|empresa)\.com$/.test(m)) hits.push(`${f.replace(WEBSITE, '')}: ${m}`);
      }
    }
    expect(hits, hits.join('\n')).toEqual([]);
  });

  it('the guard recognises what it exists to stop', () => {
    for (const bad of ['nome@exemplo.ao', 'alex@example.ao', 'email@empresa.co.ao']) {
      expect((bad.match(EXAMPLE) ?? []).some((m) => !/\.com$/.test(m.replace(/^.*@(?:exemplo|example|empresa)/, ''))), bad).toBe(true);
    }
    expect('nome@exemplo.com'.match(EXAMPLE)?.every((m) => /@exemplo\.com$/.test(m))).toBe(true);
  });
});
