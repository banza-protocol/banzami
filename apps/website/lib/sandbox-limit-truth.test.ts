import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * The Sandbox per-payment maximum (Kz 50 000) is a voluntary Banzami test
 * policy. It is not a BNA limit, and the BNA Regulatory Sandbox has no single
 * universal transaction limit: its test parameters are agreed case by case.
 * So no Banzami copy may attribute 25 000 or 50 000 Kz to the BNA, to "the
 * regulatory sandbox" or to regulation — and the developer docs must say what
 * the limit actually is. See docs/compliance/SANDBOX_OPERATIONAL_LIMITS.md.
 */
const WEBSITE = resolve(__dirname, '..');
const REPO = resolve(WEBSITE, '..', '..');

function files(dir: string, exts: RegExp, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next' || name.startsWith('.')) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) files(p, exts, out);
    else if (exts.test(name) && !/\.test\.[tj]sx?$/.test(name)) out.push(p);
  }
  return out;
}

// A sentence that puts the amount and the regulator together as cause and limit.
const AMOUNT = String.raw`(?:25|50)[\s.,\u00a0]?000(?:\s?(?:Kz|AOA))?`;
const REGULATOR = String.raw`(?:BNA|Banco Nacional de Angola|sandbox regulat[óo]ri[ao]|regulatory sandbox)`;
const CLAIMS = [
  new RegExp(`(?:limit[eo]?s?|m[áa]ximo|maximum|cap)[^.\\n]{0,40}${REGULATOR}[^.\\n]{0,40}${AMOUNT}`, 'i'),
  new RegExp(`${REGULATOR}[^.\\n]{0,80}(?:limit[eo]?s?|m[áa]ximo|maximum|cap)[^.\\n]{0,40}${AMOUNT}`, 'i'),
  new RegExp(`(?:limit[eo]?|m[áa]ximo|maximum)[^.\\n]{0,40}${AMOUNT}[^.\\n]{0,60}(?:imposto|definido|exigido|mandated|set|required|imposed)\\s+(?:pel[oa]|by)\\s+(?:o\\s+|the\\s+)?${REGULATOR}`, 'i'),
  new RegExp(`${AMOUNT}[^.\\n]{0,40}(?:é|is)\\s+(?:o|the)\\s+(?:limit[eo]?|m[áa]ximo|maximum)[^.\\n]{0,30}(?:d[oa]|of the)\\s+${REGULATOR}`, 'i'),
];
// The one place that discusses these two numbers next to the regulator, in order
// to say they are NOT the regulator's.
const EXPLAINS = /SANDBOX_OPERATIONAL_LIMITS\.md$/;

describe('the Sandbox per-payment limit is never presented as a BNA limit', () => {
  const scanned = [
    ...files(join(WEBSITE, 'app'), /\.(tsx?|mdx?)$/),
    ...files(join(WEBSITE, 'components'), /\.(tsx?|mdx?)$/),
    ...files(join(WEBSITE, 'lib'), /\.(tsx?|mdx?)$/),
    ...files(join(REPO, 'docs'), /\.md$/),
  ].filter((f) => !EXPLAINS.test(f));

  it('scans the site and the documentation', () => {
    expect(scanned.length).toBeGreaterThan(100);
  });

  it('no copy attributes 25 000 or 50 000 Kz to the BNA or to the regulatory sandbox', () => {
    const hits: string[] = [];
    for (const f of scanned) {
      const text = readFileSync(f, 'utf8');
      for (const re of CLAIMS) {
        const m = re.exec(text);
        if (m) hits.push(`${f.replace(REPO + '/', '')}: "${m[0].slice(0, 120)}"`);
      }
    }
    expect(hits, hits.join('\n')).toEqual([]);
  });

  it('the guard recognises the claims it exists to stop', () => {
    for (const bad of [
      'O limite do Sandbox do BNA é de 50 000 Kz por pagamento.',
      'BNA Sandbox limit = 25 000 Kz',
      'The regulatory sandbox maximum is 50,000 Kz per transaction.',
      '25 000 Kz é o limite da sandbox regulatória.',
      'O máximo de 50 000 Kz é imposto pelo BNA.',
    ]) {
      expect(CLAIMS.some((re) => re.test(bad)), bad).toBe(true);
    }
    for (const fine of [
      'Cada pagamento no Sandbox da Banzami pode ser de até 50 000 Kz.',
      'Este é um limite operacional do ambiente de testes da Banzami e não representa um limite regulamentar aplicável às operações com dinheiro real.',
      'carregamentos até 50 000 Kz, saldo até 50 000 Kz',
    ]) {
      expect(CLAIMS.some((re) => re.test(fine)), fine).toBe(false);
    }
  });

  it('the developer docs state the limit and its classification, in both languages', () => {
    const pt = readFileSync(join(WEBSITE, 'app/developers/docs/content-pt.tsx'), 'utf8');
    const en = readFileSync(join(WEBSITE, 'app/developers/docs/content-en.tsx'), 'utf8');
    expect(pt).toContain('Cada pagamento no Sandbox da Banzami pode ser de até 50 000 Kz.');
    expect(pt).toContain('não representa um limite regulamentar aplicável às operações com dinheiro real');
    expect(pt).toContain('A meta ou o total acumulado de uma campanha pode ultrapassar esse valor.');
    expect(en).toContain('Each payment in the Banzami Sandbox can be up to 50,000 Kz.');
    expect(en).toContain('does not represent a regulatory limit applicable to real-money operations');
  });
});
