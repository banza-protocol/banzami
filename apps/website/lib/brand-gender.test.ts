/**
 * "Banzami" is grammatically FEMININE in Portuguese when the name stands for the
 * company, startup, brand, platform or app (CLAUDE.md §15.6):
 * a Banzami, da Banzami, na Banzami, à Banzami, pela Banzami.
 *
 * This guard scans the website's Portuguese copy for a masculine article placed
 * DIRECTLY before the brand ("o Banzami", "do Banzami", "no Banzami", "ao
 * Banzami", "pelo Banzami", "este Banzami"), which is the incorrect form.
 *
 * It deliberately does NOT flag an explicit masculine noun that precedes the
 * brand ("o ecossistema Banzami", "o SDK Banzami", "o website Banzami") — there
 * the article agrees with that noun, not with "Banzami". It also allows the one
 * technical compound "Banzami Core" (the Rust financial core), whose governing
 * noun "Core" is masculine. English content (content-en) and comments are
 * skipped: an English "no Banzami binding" is not Portuguese grammar.
 *
 * Boundaries are Unicode-aware (lookbehind/lookahead over \p{L}\p{N}), because
 * JS \b is ASCII-only and would false-match the final "o" of accented words such
 * as "serviço Banzami" or "integração Banzami".
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

// A masculine article/contraction immediately before "Banzami" — the brand as the
// noun. The negative lookbehind keeps an explicit noun that ends in the article
// shape (e.g. "serviço Banzami", "o ecossistema Banzami") from matching; the
// trailing negative lookahead keeps the technical compound "Banzami Core" (whose
// governing noun is masculine) legitimate.
const MASCULINE = /(?<![\p{L}\p{N}])(?:o|do|no|ao|pelo|este|nesse|desse|num|dum) Banzami(?![\p{L}\p{N}])(?! Core\b)/iu;

describe('the brand Banzami is feminine in Portuguese copy', () => {
  it('no masculine article directly precedes the "Banzami" brand', () => {
    const hits: string[] = [];
    for (const dir of DIRS) {
      for (const f of files(join(ROOT, dir))) {
        readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
          const t = line.trim();
          if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return;
          if (MASCULINE.test(line)) hits.push(`${relative(ROOT, f)}:${i + 1}: ${t.slice(0, 120)}`);
        });
      }
    }
    expect(hits).toEqual([]);
  });

  it('the regex rejects direct masculine marca but allows explicit nouns and feminine forms', () => {
    const REJECT = [
      'A app abre o Banzami.',
      'os produtos do Banzami',
      'integrar no Banzami',
      'paga ao Banzami',
      'escrito pelo Banzami',
      'conhece este Banzami',
      'o Banzami Business', // Banzami Business is feminine ("a Banzami Business")
    ];
    const ALLOW = [
      'Conhece a Banzami.',
      'os produtos da Banzami',
      'estamos na Banzami',
      'paga à Banzami',
      'escrito pela Banzami',
      'Banzami está a construir', // no article reads naturally too
      'o ecossistema Banzami',
      'o produto Banzami',
      'o serviço Banzami', // accented noun must not false-match
      'uma integração Banzami robusta',
      'o SDK Banzami',
      'o website Banzami',
      'o Sandbox Banzami',
      'o Banzami Core', // technical compound, masculine "Core"
      'a Banzami Business',
      'a app Banzami Business',
      'Paga com Banzami',
    ];
    for (const s of REJECT) expect(MASCULINE.test(s), `should reject: ${s}`).toBe(true);
    for (const s of ALLOW) expect(MASCULINE.test(s), `should allow: ${s}`).toBe(false);
    // The specific §17 case: the brand as the noun is rejected, an explicit noun is allowed.
    expect(MASCULINE.test('do Banzami')).toBe(true);
    expect(MASCULINE.test('do ecossistema Banzami')).toBe(false);
  });
});
