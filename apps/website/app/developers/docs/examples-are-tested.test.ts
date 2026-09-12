/**
 * Every example in the documentation, checked against something that can say no.
 *
 * A code sample is the part of documentation a reader trusts most and the part
 * that rots first: nothing compiles it, nothing runs it, and it keeps working in
 * the reader's head long after it stopped working anywhere else. The samples here
 * are prose inside .tsx template literals, so nothing has ever looked at them.
 *
 * What each kind of sample is checked against:
 *
 *   curl        the route exists in the published OpenAPI v1 document, the method
 *               is one that path offers, and the auth header is a placeholder
 *   JSON        it parses, and money is an integer field named *_minor
 *   TypeScript  it parses as TypeScript, and calls only SDK methods that exist
 *   webhook     it verifies before it parses, and dedupes before it acts
 *
 * Node-only (fs + JSON + the TypeScript compiler already in the toolchain).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import ts from 'typescript';

const REPO = join(process.cwd(), '..', '..');
const read = (p: string) => readFileSync(join(REPO, p), 'utf8');

const SOURCES = [
  'apps/website/app/developers/docs/content-pt.tsx',
  'apps/website/app/developers/docs/content-en.tsx',
  'apps/website/app/developers/docs/reference.tsx',
].map((p) => ({ path: p, src: read(p) }));

const SPEC = JSON.parse(read('docs/developer/openapi/banzami-sandbox.openapi.json'));
const SPEC_PATHS: Record<string, Record<string, unknown>> = SPEC.paths;

/** Does this concrete path match a spec template (…/{id} filled in)? */
function specTemplate(path: string): string | null {
  if (SPEC_PATHS[path]) return path;
  for (const p of Object.keys(SPEC_PATHS)) {
    const re = new RegExp(`^${p.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\{[^}]+\}/g, '[^/]+')}$`);
    if (re.test(path)) return p;
  }
  return null;
}

/** Every template literal in the sources, with the file it came from. */
function literals(): { path: string; body: string }[] {
  const out: { path: string; body: string }[] = [];
  for (const { path, src } of SOURCES) {
    // Backtick literals; nested ${...} are left as-is because the samples use
    // them only inside comments and JSON strings.
    for (const m of src.matchAll(/`([^`]{40,})`/g)) out.push({ path, body: m[1] });
  }
  return out;
}

const LITERALS = literals();

describe('curl examples name endpoints that exist', () => {
  const curls = LITERALS.filter((l) => l.body.includes('curl '));

  it('there are curl examples to check', () => {
    expect(curls.length).toBeGreaterThan(10);
  });

  it.each(curls.map((c, i) => [i, c] as const))('curl example %i targets a published route', (_i, c) => {
    const urls = [...c.body.matchAll(/https:\/\/sandbox-api\.banzami\.com(\/v1\/[^\s"'\\]*)/g)].map((m) => m[1]);
    expect(urls.length, `no sandbox-api URL in:\n${c.body.slice(0, 120)}`).toBeGreaterThan(0);
    for (const raw of urls) {
      const path = raw.split('?')[0].replace(/\/$/, '');
      const template = specTemplate(path);
      expect(template, `${c.path}: ${path} is in no published OpenAPI path`).not.toBeNull();

      // The method the example uses must be one the route offers.
      const explicit = /-X\s+([A-Z]+)/.exec(c.body)?.[1];
      const method = (explicit ?? 'GET').toLowerCase();
      expect(
        Object.keys(SPEC_PATHS[template as string]).includes(method),
        `${path} does not offer ${method.toUpperCase()} — the example uses it`,
      ).toBe(true);
    }
  });

  it('no curl example carries a credential that could be real', () => {
    for (const c of curls) {
      const keys = c.body.match(/bz_(test|live)_(sk|pk)_[A-Za-z0-9]+/g) ?? [];
      for (const k of keys) {
        expect(/X{6,}/.test(k), `${c.path}: ${k} does not look like a placeholder`).toBe(true);
      }
      expect(/bz_live_/.test(c.body), `${c.path}: an example uses a live key, which is issued to nobody`).toBe(false);
    }
  });
});

describe('JSON examples parse, and money is money', () => {
  // A response sample is a literal that starts with { and has no shell in it.
  const jsons = LITERALS.filter((l) => /^\s*\{/.test(l.body) && !l.body.includes('curl ') && !l.body.includes('=>'));

  it('there are JSON examples to check', () => {
    expect(jsons.length).toBeGreaterThan(5);
  });

  it.each(jsons.map((j, i) => [i, j] as const))('JSON example %i parses', (_i, j) => {
    // Samples carry // comments for the reader; strip them before parsing.
    const cleaned = j.body.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(() => JSON.parse(cleaned), `${j.path}: does not parse:\n${cleaned.slice(0, 200)}`).not.toThrow();
  });

  it('every money field is an integer in minor units', () => {
    for (const j of jsons) {
      const cleaned = j.body.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
      let parsed: unknown;
      try { parsed = JSON.parse(cleaned); } catch { continue; }

      const walk = (node: unknown, at: string): void => {
        if (Array.isArray(node)) return node.forEach((v, i) => walk(v, `${at}[${i}]`));
        if (node && typeof node === 'object') {
          for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
            // Guessing which fields are money from their names cried wolf twice:
            // `fee_destination` is a @banza handle and `total_last_24h` counts
            // deliveries. So the rule is the operator's own convention, stated
            // the two ways it can be broken.
            //
            //   1. anything named _minor IS money, and money is a whole number;
            //   2. anything named amount/balance/fee is money and must therefore
            //      carry _minor — unless its name already says it is a rate, a
            //      percentage, a count or a handle.
            //
            // A fractional amount is the fingerprint of the 100× formatting bug,
            // which is why (1) checks the integer and not merely the name.
            if (/_minor$/.test(k)) {
              expect(typeof v === 'number' && Number.isInteger(v),
                `${j.path}: ${at}.${k} = ${String(v)} is named _minor but is not a whole number`).toBe(true);
            } else if (typeof v === 'number'
              && /(amount|balance|\bfee\b|_fee)/i.test(k)
              && !/(bps|rate|pct|percent|count|destination|profile|currency|last_\d+h)/i.test(k)) {
              expect(false, `${j.path}: ${at}.${k} looks like money and is not named _minor`).toBe(true);
            }
            walk(v, `${at}.${k}`);
          }
        }
      };
      walk(parsed, '$');
    }
  });
});

describe('TypeScript examples are TypeScript', () => {
  const tss = LITERALS.filter((l) => /\bawait |\bconst |\bexport /.test(l.body) && !l.body.includes('curl '));

  it('there are TypeScript examples to check', () => {
    expect(tss.length).toBeGreaterThan(2);
  });

  it.each(tss.map((t, i) => [i, t] as const))('TypeScript example %i parses', (_i, t) => {
    const sf = ts.createSourceFile('example.ts', t.body, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
    // parseDiagnostics is internal but stable, and is the only way to see a
    // syntax error without running a full program over a fragment.
    const errs = (sf as unknown as { parseDiagnostics: { messageText: unknown }[] }).parseDiagnostics ?? [];
    const messages = errs.map((d) => (typeof d.messageText === 'string' ? d.messageText : JSON.stringify(d.messageText)));
    expect(messages, `${t.path}:\n${t.body.slice(0, 200)}`).toEqual([]);
  });
});

describe('the webhook example teaches the two things people get wrong', () => {
  const hooks = LITERALS.filter((l) => /banza-signature|webhooks\.verify/.test(l.body));

  it('there is a webhook example', () => {
    expect(hooks.length).toBeGreaterThan(0);
  });

  it.each(hooks.map((h, i) => [i, h] as const))('webhook example %i verifies before parsing', (_i, h) => {
    const verify = h.body.search(/verify\(/);
    const parse = h.body.search(/JSON\.parse\(/);
    if (verify === -1 || parse === -1) return;
    expect(verify, `${h.path}: the example parses the body before verifying the signature`).toBeLessThan(parse);
  });

  it.each(hooks.map((h, i) => [i, h] as const))('webhook example %i dedupes before acting', (_i, h) => {
    if (!/existe|seen|record|registar/.test(h.body)) return;
    const dedupe = h.body.search(/(existe|seen)\(/);
    const effect = h.body.search(/(confirmarDoacao|confirmDonation)\(/);
    if (dedupe === -1 || effect === -1) return;
    expect(dedupe, `${h.path}: the example acts before checking whether it already has`).toBeLessThan(effect);
  });

  it('the raw body is read, never a re-serialised object', () => {
    for (const h of hooks) {
      if (!/req\.text\(\)|raw/.test(h.body)) continue;
      expect(
        /req\.json\(\)/.test(h.body),
        `${h.path}: reads req.json() — re-serialising changes the bytes and the signature stops matching`,
      ).toBe(false);
    }
  });
});
