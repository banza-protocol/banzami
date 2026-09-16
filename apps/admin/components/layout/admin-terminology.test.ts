import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// BANZADMIN-IA-NAV-001 §52 — a bounded guard against user-facing terminology
// regressions. It scans rendered admin TSX (comments and *.test.* excluded) for
// canonical-label mistakes. It does NOT ban internal identifiers: "Business
// Account", the /businesses route, business_account_type, MerchantApplication,
// type names etc. are intentionally allowed.

const ROOT = join(__dirname, '..', '..');
const DIRS = ['app/(admin)', 'components'];

function tsxFiles(dir: string): string[] {
  let out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out = out.concat(tsxFiles(p));
    else if (/\.tsx?$/.test(name) && !/\.test\.(t|j)sx?$/.test(name)) out.push(p);
  }
  return out;
}

// Strip block and line comments so we only inspect rendered strings/code, not
// history notes ("it used to say Negócios").
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"`])\/\/[^\n]*/g, (_m, p) => p);
}

const BANNED: { re: RegExp; why: string }[] = [
  { re: /\bNegócios\b/, why: 'use "Comerciantes" (plural merchant label)' },
  { re: /Risco & Audit/, why: 'use "Risco e auditoria"' },
  { re: /Políticas de fee/, why: 'use "Políticas de taxas"' },
  { re: /\bApp Business\b/i, why: 'use "App Banzami Business"' },
  { re: /\bApp Comerciante\b/, why: 'use "App Banzami Business"' },
  { re: /Business Dashboard/, why: 'use "App Banzami Business"' },
  { re: /Finanças · Visão geral/, why: 'the finance overview is "Resumo financeiro"' },
];

describe('BANZADMIN user-facing terminology', () => {
  const files = DIRS.flatMap((d) => tsxFiles(join(ROOT, d)));

  it('scans a real set of admin TSX files', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it('has no banned user-facing labels in rendered source', () => {
    const hits: string[] = [];
    for (const f of files) {
      const src = stripComments(readFileSync(f, 'utf8'));
      for (const { re, why } of BANNED) {
        const m = src.match(re);
        if (m) hits.push(`${f.replace(ROOT + '/', '')}: "${m[0]}" — ${why}`);
      }
    }
    expect(hits, hits.join('\n')).toEqual([]);
  });
});
