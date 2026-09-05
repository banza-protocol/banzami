// P2D SDK preview onboarding guards.
//
// Locks in the controlled-preview onboarding journey (PT/EN), the public
// onboarding artifacts with conservative flags, manifest inclusion, and all
// previous honesty. Node-only (fs + JSON), no jsdom, no network.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CARD_CAPABILITIES, isReleased } from './assurance-manifest';
import { FAKE_INSTALL_COMMANDS } from './published-packages';

const REPO = join(process.cwd(), '..', '..');
const read = (p: string) => readFileSync(join(REPO, p), 'utf8');
const OB = 'apps/website/public/developers/onboarding';

const PT = read('apps/website/app/developers/docs/content-pt.tsx') + read('apps/website/app/developers/docs/page.tsx');
const EN = read('apps/website/app/developers/docs/content-en.tsx') + read('apps/website/app/developers/docs/en/page.tsx');
const MANIFEST = JSON.parse(read('apps/website/public/developers/artifacts/manifest.json'));
const ONBOARDING = JSON.parse(read(`${OB}/sdk-preview-onboarding.json`));
const CHECKLIST = JSON.parse(read(`${OB}/sandbox-validation-checklist.json`));
const PARTNER = JSON.parse(read(`${OB}/partner-responsibilities.json`));
const READINESS = JSON.parse(read(`${OB}/readiness-review-checklist.json`));
const TEMPLATE = read(`${OB}/preview-issue-report-template.md`);

describe('P2D — onboarding sections exist in PT and EN', () => {
  it('PT sections', () => {
    for (const t of ['Onboarding do preview SDK', 'Jornada de integração em Sandbox', 'Responsabilidades do parceiro no preview', 'Responsabilidades da Banzami no preview', 'Como reportar problemas no preview', 'Checklist de validação Sandbox', 'Critérios de revisão de prontidão']) {
      expect(PT.includes(t), `PT missing: ${t}`).toBe(true);
    }
    expect(PT).toContain('Não é um registo público self-service');
    expect(PT).toContain('Reporte através do canal de suporte de preview aprovado durante o onboarding');
    expect(PT).toContain('Não são contratos de Produção, não ativam');
  });
  it('EN sections', () => {
    for (const t of ['SDK preview onboarding', 'Sandbox integration journey', 'Partner responsibilities during preview', 'Banzami responsibilities during preview', 'How to report preview issues', 'Sandbox validation checklist', 'Readiness review criteria']) {
      expect(EN.includes(t), `EN missing: ${t}`).toBe(true);
    }
    expect(EN).toContain('It is not a public self-service signup');
    expect(EN).toContain('Report through the approved preview support channel provided during onboarding');
    expect(EN).toContain('These artifacts support Sandbox preview onboarding');
  });
  it('hard non-approval statements exist in PT and EN', () => {
    expect(PT).toContain('A aprovação de preview não significa aprovação de Produção');
    expect(PT).toContain('A validação em Sandbox não significa ativação de');
    expect(PT.replace(/\s+/g, ' ')).toContain('A prontidão técnica não significa autorização regulatória');
    expect(PT.replace(/\s+/g, ' ')).toContain('A revisão de prontidão não é aprovação de Produção');
    expect(EN.replace(/\s+/g, ' ')).toContain('Preview approval does not mean Production approval');
    expect(EN.replace(/\s+/g, ' ')).toContain('Sandbox validation does not mean live rails activation');
    expect(EN.replace(/\s+/g, ' ')).toContain('SDK preview access does not mean public SDK publication');
    expect(EN.replace(/\s+/g, ' ')).toContain('Technical readiness does not mean regulatory authorization');
    expect(EN.replace(/\s+/g, ' ')).toContain('Readiness review is not Production approval');
  });
});

describe('P2D — onboarding artifacts', () => {
  const FLAG_DOCS = [ONBOARDING, CHECKLIST, PARTNER, READINESS];
  it('all artifacts exist with the required conservative flags', () => {
    for (const d of FLAG_DOCS) {
      expect(d.scope).toBe('sandbox_preview');
      expect(d.production_contract).toBe(false);
      expect(d.regulatory_approval).toBe(false);
      expect(d.live_rails).toBe(false);
      expect(d.public_sdk_packages_published).toBe(false);
    }
    // markdown template carries the flags in its comment block
    for (const f of ['scope: sandbox_preview', 'production_contract: false', 'regulatory_approval: false', 'live_rails: false', 'public_sdk_packages_published: false']) {
      expect(TEMPLATE.includes(f), `template missing flag: ${f}`).toBe(true);
    }
  });
  it('the journey has 8 bilingual stages with the full stage contract', () => {
    expect(ONBOARDING.journey).toHaveLength(8);
    for (const st of ONBOARDING.journey) {
      for (const k of ['objective', 'partner', 'banzami', 'output', 'not_included']) {
        expect(st[k].pt.length).toBeGreaterThan(5);
        expect(st[k].en.length).toBeGreaterThan(5);
      }
    }
    expect(ONBOARDING.hard_statements.pt).toHaveLength(4);
    expect(ONBOARDING.hard_statements.en).toHaveLength(4);
  });
  it('checklists and responsibilities are bilingual and complete', () => {
    expect(CHECKLIST.items.length).toBeGreaterThanOrEqual(17);
    expect(PARTNER.items.length).toBeGreaterThanOrEqual(11);
    expect(READINESS.criteria.length).toBeGreaterThanOrEqual(12);
    expect(READINESS.what_it_is_not.pt).toHaveLength(3);
    expect(READINESS.what_it_is_not.en).toHaveLength(3);
    for (const it2 of [...CHECKLIST.items, ...PARTNER.items, ...READINESS.criteria]) {
      expect(it2.pt.length).toBeGreaterThan(3);
      expect(it2.en.length).toBeGreaterThan(3);
    }
  });
  it('the manifest includes all five onboarding artifacts with the required entry shape', () => {
    const ob = MANIFEST.artifacts.filter((a: { role?: string }) => a.role === 'preview_onboarding');
    expect(ob).toHaveLength(5);
    const paths = ob.map((a: { path: string }) => a.path);
    for (const p of ['/developers/onboarding/sdk-preview-onboarding.json', '/developers/onboarding/sandbox-validation-checklist.json', '/developers/onboarding/partner-responsibilities.json', '/developers/onboarding/preview-issue-report-template.md', '/developers/onboarding/readiness-review-checklist.json']) {
      expect(paths).toContain(p);
    }
    for (const a of ob) {
      expect(a.scope).toBe('sandbox_preview');
      expect(a.production_contract).toBe(false);
      expect(a.recommended_integration_path).toBe(false);
    }
  });
  it('no artifact leaks private emails, URLs, IPs, hostnames, paths, logs, DB URLs, tokens or PII', () => {
    const all = [JSON.stringify(ONBOARDING), JSON.stringify(CHECKLIST), JSON.stringify(PARTNER), JSON.stringify(READINESS), TEMPLATE].join('\n');
    expect(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(all)).toBe(false);
    expect(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/.test(all)).toBe(false);
    expect(all.includes('/srv/')).toBe(false);
    expect(all.includes('slack.com')).toBe(false);
    expect(all.includes('discord')).toBe(false);
    expect(/postgres:\/\/|redis:\/\//.test(all)).toBe(false);
    expect(/eyJ[A-Za-z0-9_-]{10,}/.test(all)).toBe(false);
    expect(/bz_(test|live)_(pk|sk)_(?!X{2,})[A-Za-z0-9]{8,}/.test(all)).toBe(false);
  });
});

describe('P2D — previous honesty preserved', () => {
  it('no self-service signup or public SDK publication claim; no fake installs', () => {
    const joined = (PT + EN).replace(/\s+/g, ' ');
    expect(joined).toContain('self-service');
    expect(joined.toLowerCase().includes('sign up now')).toBe(false);
    expect(joined.toLowerCase().includes('register now')).toBe(false);
    for (const cmd of FAKE_INSTALL_COMMANDS) {
      expect(joined.includes(cmd)).toBe(false);
    }
    // Published: each language documents the real install command.
    expect((PT + EN).split('npm install @banzami').length - 1).toBeGreaterThanOrEqual(2);
  });
  it('HTTP remains secondary; SDKs not published; PT/EN only; pending-E2E and simulated persist', () => {
    expect(PT).toContain('camada de referência técnica do protocolo');
    expect(EN).toContain('technical protocol reference layer');
    expect(EN).toContain('not publicly published');
    // "Pendente E2E" wording belongs on the page only while the manifest still
    // withholds a release. Asserting it unconditionally would pin a claim the
    // evidence has since overtaken.
    for (const { id } of CARD_CAPABILITIES) {
      if (isReleased(id)) continue;
      expect(PT).toContain('Pendente E2E');
      expect(EN).toContain('Pending E2E');
    }
    const dirs = readdirSync(join(REPO, 'apps/website/app/developers/docs'), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort();
    // P3A: area routes are directories too — the LOCALE rule is that 'en' is the
    // only locale dir and no other-language dir exists.
    expect(dirs).toContain('en');
    expect(dirs.filter((d) => /^(fr|es|de|it|zh|ru|pt)$/.test(d))).toEqual([]);
  });
  it('no production/live/BNA claims (BNA appears only inside prohibitions)', () => {
    for (const line of (PT + EN).split('\n')) {
      if (!/BNA/.test(line)) continue;
      expect(/não reivindicar|do not claim/i.test(line), `BNA outside prohibition: ${line.trim().slice(0, 90)}`).toBe(true);
    }
    expect((PT + EN).toLowerCase().includes('production ready')).toBe(false);
  });
});
