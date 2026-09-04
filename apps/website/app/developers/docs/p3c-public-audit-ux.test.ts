// P3C public-audit UX guards.
//
// Locks in the post-P3B audit fixes: consistent H2 page titles on every area
// page (sdk/trust no longer open on an H3), no duplicate-title heading stacks
// on testing, PT/EN guides parity (charges/transfers/refunds present in EN),
// next-steps on every area page incl. changelog/glossary, and all prior
// claim-safety. Node-only (fs), no jsdom, no network.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PRESERVED_ARTIFACT_URLS } from './content-map';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const D = 'app/developers/docs';
const PT = read(`${D}/content-pt.tsx`);
const EN = read(`${D}/content-en.tsx`);
const PT_HOME = read(`${D}/page.tsx`);
const EN_HOME = read(`${D}/en/page.tsx`);
const SHELL = read(`${D}/shell.tsx`);
const CORPUS = PT + EN + PT_HOME + EN_HOME + SHELL;
const AREAS = ['get-started', 'sdk', 'guides', 'reference', 'testing', 'trust', 'artifacts', 'changelog', 'glossary'];

describe('P3C — audit evidence + routes', () => {
  it('the public-audit evidence file exists', () => {
    expect(existsSync(join(process.cwd(), '..', '..', 'evidence/developer-docs/DEVELOPERS_DOCS_P3C_PUBLIC_AUDIT.md'))).toBe(true);
  });
  it('every PT and EN area route still exists; no locale beyond en', () => {
    for (const a of AREAS) {
      expect(existsSync(join(process.cwd(), `${D}/${a}/page.tsx`)), `PT ${a}`).toBe(true);
      expect(existsSync(join(process.cwd(), `${D}/en/${a}/page.tsx`)), `EN ${a}`).toBe(true);
    }
    expect(existsSync(join(process.cwd(), `${D}/fr`))).toBe(false);
  });
  it('public artifact URLs unchanged (20 files present)', () => {
    expect(PRESERVED_ARTIFACT_URLS).toHaveLength(20);
    for (const url of PRESERVED_ARTIFACT_URLS) {
      expect(existsSync(join(process.cwd(), 'public', url)), `missing: ${url}`).toBe(true);
    }
  });
});

describe('P3C — consistent heading hierarchy', () => {
  it('the SDK and Trust pages open with an H2 page title (no lone H3 opening)', () => {
    // sdk/trust content now carry a top-level H2 title.
    expect(PT).toContain('<Section id="sdks">\n              <H2>SDKs</H2>');
    expect(EN).toContain('<Section id="sdks">\n              <H2>SDKs</H2>');
    expect(PT).toContain('<Section id="trust">\n              <H2>Confiança e prontidão</H2>');
    expect(EN).toContain('<Section id="trust-page">\n              <H2>Trust and readiness</H2>');
    // the stray mid-page H2 "SDKs" was demoted to an H3 subsection.
    expect(PT).toContain('Matriz de maturidade dos SDKs');
    expect(EN).toContain('SDK maturity matrix');
  });
  it('no duplicate-title H3 stack on the testing pages', () => {
    expect(PT.includes('id="testar-sandbox"')).toBe(false);
    expect(EN.includes('id="testing-sandbox"')).toBe(false);
    // the H2 titles remain.
    expect(PT).toContain('<H2>Testar no Sandbox</H2>');
    expect(EN).toContain('<H2>Sandbox testing</H2>');
  });
});

describe('P3C — PT/EN guides parity', () => {
  it('EN guides now has the charges, transfers and refunds sections (parity with PT)', () => {
    for (const id of ['id="charges"', 'id="transfers"', 'id="refunds"']) {
      expect(EN.includes(id), `EN guides missing ${id}`).toBe(true);
    }
  });
  it('EN refunds keeps the typed-source contract and Pending-E2E credential note', () => {
    expect(EN).toContain('ACQUIRING_PAYMENT');
    expect(EN).toContain('WALLET_PAYMENT');
    expect(EN).toContain('refunds:write');
    expect(EN.replace(/\s+/g, ' ')).toContain('developer-key refund request is rejected (403)');
    // never the obsolete/internal contract.
    expect(EN.includes('transaction_id')).toBe(false);
    expect(EN.includes('payment_id')).toBe(false);
  });
  it('EN transfers is credential-scoped (developer transfers scope Pending E2E)', () => {
    expect(EN).toContain('transfers:*');
    // raw source carries JSX tags around the tokens; assert the tokens + framing.
    expect(EN).toContain('The developer-key scopes (<Code>transfers:*</Code>)');
    expect(EN.replace(/\s+/g, ' ')).toContain('are <strong>Pending E2E</strong>');
  });
});

describe('P3C — next-step navigation on every area page', () => {
  it('changelog and glossary now carry next-step links in both languages', () => {
    // Count NextSteps usages — one per area page that has them; changelog + glossary added in P3C.
    expect((PT.match(/<NextSteps/g) || []).length).toBeGreaterThanOrEqual(8);
    expect((EN.match(/<NextSteps/g) || []).length).toBeGreaterThanOrEqual(8);
    // changelog/glossary ledes still present.
    expect(PT).toContain('Registo de mudanças de documentação');
    expect(EN).toContain('Documentation, API-contract and Sandbox change tracking');
  });
});

describe('P3C — claim safety preserved', () => {
  it('SDK-first, controlled preview, HTTP secondary, curl diagnostic-only', () => {
    expect(PT).toContain('Caminho recomendado: o SDK TypeScript');
    expect(EN).toContain('Recommended path: the TypeScript SDK');
    expect(PT).toContain('pré-visualização controlada');
    expect(EN).toContain('controlled preview');
    expect(PT).toContain('camada de referência técnica do protocolo');
    expect(EN).toContain('technical protocol reference layer');
    for (const bad of ['official http integration path', 'recommended direct http', 'caminho oficial é http']) {
      expect(CORPUS.toLowerCase().includes(bad)).toBe(false);
    }
  });
  it('pending-E2E and Stage C not approved persist', () => {
    expect(PT).toContain('Pendente E2E');
    expect(EN).toContain('Pending E2E');
    expect(PT).toContain('Stage C não implementado/não aprovado');
    expect(EN).toContain('Stage C not implemented/approved');
  });
  it('no fake installs, no production/live/BNA/provider/regulatory/certification overclaims', () => {
    for (const cmd of ['pip install banzami', 'composer require banzami/sdk', 'pub add banzami', 'pod "Banzami"']) {
      expect(CORPUS.includes(cmd)).toBe(false);
    }
    for (const bad of ['production ready', 'Production is available', 'BNA approved', 'SOC 2', 'ISO 27001', 'PCI DSS', 'certified uptime', '99.9', 'sign up now']) {
      expect(CORPUS.toLowerCase().includes(bad.toLowerCase()), `overclaim: ${bad}`).toBe(false);
    }
    for (const line of CORPUS.split('\n')) {
      if (!/BNA/.test(line)) continue;
      expect(/não reivindicar|do not claim/i.test(line)).toBe(true);
    }
  });
});
