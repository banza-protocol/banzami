/**
 * "Banzami" is grammatically masculine in Portuguese (CLAUDE.md §15.6):
 * o Banzami, do Banzami, no Banzami, pelo Banzami, ao Banzami.
 *
 * Scans the website's Portuguese copy (every .ts/.tsx outside tests and the
 * English docs content) for the feminine articles before the brand. English
 * "A Banzami …" in a comment or in content-en is not Portuguese and is skipped:
 * only the lower-case contractions, and a Portuguese label or sentence that
 * opens with "A Banzami", are checked.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const DIRS = ['app', 'components', 'lib'];
const SKIP = [/\.test\.tsx?$/, /content-en\.tsx$/, /node_modules/];

function files(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...files(p));
    else if (/\.(ts|tsx)$/.test(name) && !SKIP.some((r) => r.test(p))) out.push(p);
  }
  return out;
}

// " a Banzami", "da Banzami", "na Banzami", "pela Banzami", "à Banzami" — and a
// string or JSX text that opens with "A Banzami".
const FEMININE = /(?:\b(?:da|na|pela|à|numa|uma) Banzami\b)|(?:\s a Banzami\b)|(?:['">`]A Banzami\b)/;

describe('the brand is masculine in Portuguese copy', () => {
  it('no feminine article precedes "Banzami"', () => {
    const hits: string[] = [];
    for (const dir of DIRS) {
      for (const f of files(join(ROOT, dir))) {
        readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
          const t = line.trim();
          if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return;
          if (FEMININE.test(line)) hits.push(`${relative(ROOT, f)}:${i + 1}: ${t.slice(0, 120)}`);
        });
      }
    }
    expect(hits).toEqual([]);
  });
});
