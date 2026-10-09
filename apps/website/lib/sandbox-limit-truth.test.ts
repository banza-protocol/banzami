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

/**
 * The internal Sandbox applies NO wallet balance cap (owner decision
 * 2026-10-09). No copy may state a maximum wallet balance, attribute a balance
 * limit to the BNA, or tie a campaign goal to a wallet balance.
 */
describe('no copy states a Sandbox wallet balance cap', () => {
  const WALLET = String.raw`(?:carteiras?|wallets?|saldo|balance)`;
  // An amount of money, with its unit — a bare number in a code sample is not a claim.
  const BAL_AMOUNT = String.raw`(?<![0-9])(?:50[\s.,\u00a0]?000|100[\s.,\u00a0]?000|1[\s.,\u00a0]?000[\s.,\u00a0]?000)\s?(?:Kz|AOA)`;
  const BALANCE_CLAIMS = [
    // "saldo máximo … 50 000 Kz", "maximum balance of 100,000 Kz", "saldo até 50 000 Kz"
    new RegExp(`(?:saldo\\s+m[áa]ximo|m[áa]ximo\\s+de\\s+saldo|max(?:imum)?\\s+(?:wallet\\s+)?balance|balance\\s+cap|saldo\\s+at[ée])[^.\\n|]{0,60}${BAL_AMOUNT}`, 'i'),
    new RegExp(`${BAL_AMOUNT}[^.\\n|;,]{0,12}(?:balance|de\\s+saldo)\\b(?!\\s*(?:cap\\s+)?(?:removed|since))`, 'i'),
    // a balance limit attributed to the regulator
    new RegExp(`${REGULATOR}[^.\\n]{0,80}(?:limit[eo]?s?|m[áa]ximo|maximum|cap)[^.\\n]{0,40}${WALLET}`, 'i'),
    // a campaign goal bounded by a wallet balance
    new RegExp(`(?:meta|goal)[^.\\n]{0,60}(?:limitad[ao]|limited|capped|n[ãa]o pode exceder|cannot exceed)[^.\\n]{0,40}${WALLET}`, 'i'),
  ];
  // Public copy only: internal ADRs and the compliance note record what the
  // caps USED to be, in context, and are allowed to.
  const publicCopy = [
    ...files(join(WEBSITE, 'app'), /\.(tsx?|mdx?)$/),
    ...files(join(WEBSITE, 'components'), /\.(tsx?|mdx?)$/),
    ...files(join(REPO, 'docs', 'developer'), /\.(md|json)$/),
  ];

  it('no public copy states a maximum wallet balance', () => {
    const hits: string[] = [];
    for (const f of publicCopy) {
      const text = readFileSync(f, 'utf8');
      for (const re of BALANCE_CLAIMS) {
        const m = re.exec(text);
        if (m) hits.push(`${f.replace(REPO + '/', '')}: "${m[0].slice(0, 120)}"`);
      }
    }
    expect(hits, hits.join('\n')).toEqual([]);
  });

  it('the guard recognises the claims it exists to stop', () => {
    for (const bad of [
      'O saldo máximo da carteira Consumer é 50 000 Kz.',
      'saldo até 50 000 Kz',
      'Business wallets have a maximum balance of 100,000 Kz.',
      'a 50,000 Kz balance',
      'O BNA define um limite de 1 000 000 Kz para o saldo da carteira.',
      'A meta da campanha está limitada pelo saldo da carteira.',
    ]) {
      expect(BALANCE_CLAIMS.some((re) => re.test(bad)), bad).toBe(true);
    }
    for (const fine of [
      'O Sandbox interno não aplica um limite máximo de saldo às carteiras Consumer ou Business.',
      'Um Business pode receber até 1 000 000 Kz no período de 24 horas aplicável.',
      'carregamentos até 50 000 Kz, 20 carregamentos e 100 000 Kz por dia; sem limite máximo de saldo.',
      'Cada pagamento no Sandbox da Banzami pode ser de até 50 000 Kz.',
    ]) {
      expect(BALANCE_CLAIMS.some((re) => re.test(fine)), fine).toBe(false);
    }
  });

  it('the developer docs say there is no balance cap and state the period limits', () => {
    const pt = readFileSync(join(WEBSITE, 'app/developers/docs/content-pt.tsx'), 'utf8');
    const en = readFileSync(join(WEBSITE, 'app/developers/docs/content-en.tsx'), 'utf8');
    expect(pt).toContain('O Sandbox interno não aplica um limite máximo de saldo às carteiras Consumer ou Business.');
    expect(pt).toContain('Um Consumer pode realizar até 250 000 Kz em pagamentos dentro do período diário aplicável.');
    expect(pt).toContain('Um Business pode receber até 1 000 000 Kz no período de 24 horas aplicável.');
    expect(en).toContain('The internal Sandbox applies no maximum balance to Consumer or Business wallets.');
    expect(en).toContain('up to 250,000 Kz in payments');
    expect(en).toContain('up to 1,000,000 Kz within the applicable 24-hour period');
  });
});
