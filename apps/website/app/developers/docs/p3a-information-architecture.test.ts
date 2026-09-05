// P3A information-architecture guards.
//
// Locks in the new multi-area documentation structure: all PT/EN routes exist,
// PT/EN parity per area, home is a landing (not the giant page), every major
// P0–P2E content group is mapped and present at its route (content-map.ts),
// public artifact URLs are unchanged, and every claim-safety rule holds across
// the corpus. Node-only (fs), no jsdom, no network.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CONTENT_MAP, PRESERVED_ARTIFACT_URLS } from './content-map';
import { CARD_CAPABILITIES, isReleased } from './assurance-manifest';
import { FAKE_INSTALL_COMMANDS } from './published-packages';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const DOCS_DIR = 'app/developers/docs';
const AREAS = ['get-started', 'sdk', 'guides', 'reference', 'testing', 'trust', 'artifacts', 'changelog', 'glossary'];

const PT_CONTENT = read(`${DOCS_DIR}/content-pt.tsx`);
const EN_CONTENT = read(`${DOCS_DIR}/content-en.tsx`);
const PT_HOME = read(`${DOCS_DIR}/page.tsx`);
const EN_HOME = read(`${DOCS_DIR}/en/page.tsx`);
const PT = PT_CONTENT + PT_HOME;
const EN = EN_CONTENT + EN_HOME;
const MANIFEST = JSON.parse(readFileSync(join(process.cwd(), 'public/developers/artifacts/manifest.json'), 'utf8'));

describe('P3A — route structure', () => {
  it('every PT area route exists', () => {
    for (const a of AREAS) {
      expect(existsSync(join(process.cwd(), `${DOCS_DIR}/${a}/page.tsx`)), `missing PT route ${a}`).toBe(true);
    }
    expect(existsSync(join(process.cwd(), `${DOCS_DIR}/page.tsx`))).toBe(true);
  });
  it('every EN area route exists (PT/EN parity)', () => {
    for (const a of AREAS) {
      expect(existsSync(join(process.cwd(), `${DOCS_DIR}/en/${a}/page.tsx`)), `missing EN route ${a}`).toBe(true);
    }
    expect(existsSync(join(process.cwd(), `${DOCS_DIR}/en/page.tsx`))).toBe(true);
  });
  it('no locale beyond en exists (fr and friends unsupported)', () => {
    for (const loc of ['fr', 'es', 'de', 'it', 'pt']) {
      expect(existsSync(join(process.cwd(), `${DOCS_DIR}/${loc}/page.tsx`)) && loc !== 'en', `unexpected locale dir ${loc}`).toBe(loc === 'en');
    }
    expect(existsSync(join(process.cwd(), `${DOCS_DIR}/fr`))).toBe(false);
  });
  it('the homes are landing pages, not the former giant pages', () => {
    // Landing pages must be small and must NOT embed the deep content blocks.
    expect(PT_HOME.split('\n').length).toBeLessThan(120);
    expect(EN_HOME.split('\n').length).toBeLessThan(120);
    for (const deep of ['Contrato esperado do SDK', 'ResourceReference', 'Portões de decisão']) {
      expect(PT_HOME.includes(deep), `PT home must not embed: ${deep}`).toBe(false);
    }
    for (const deep of ['Expected SDK contract', 'ResourceReference', 'Decision gates before']) {
      expect(EN_HOME.includes(deep), `EN home must not embed: ${deep}`).toBe(false);
    }
    // But they carry the required landing content.
    expect(PT_HOME).toContain('Documentação Developers Banzami');
    expect(EN_HOME).toContain('Banzami Developers Documentation');
    expect(PT_HOME).toContain('Sandbox / Pré-visualização');
    expect(EN_HOME).toContain('Sandbox / Preview');
  });
});

describe('P3A — content preservation map', () => {
  it('every major P0–P2E content group is mapped and its tokens exist in the sources', () => {
    expect(CONTENT_MAP.length).toBeGreaterThanOrEqual(16);
    for (const g of CONTENT_MAP) {
      expect(PT.includes(g.ptToken), `[${g.group}] PT token missing: ${g.ptToken}`).toBe(true);
      expect(EN.includes(g.enToken), `[${g.group}] EN token missing: ${g.enToken}`).toBe(true);
      expect(g.ptRoute.startsWith('/docs')).toBe(true);
      expect(g.enRoute.startsWith('/docs/en')).toBe(true);
    }
  });
  it('area routes render the mapped content components (placement checks)', () => {
    const placements: [string, string, string][] = [
      // [route file, must import/render, language]
      [`${DOCS_DIR}/sdk/page.tsx`, 'PtSdk', 'pt'],
      [`${DOCS_DIR}/reference/page.tsx`, 'PtReference', 'pt'],
      [`${DOCS_DIR}/trust/page.tsx`, 'PtTrust', 'pt'],
      [`${DOCS_DIR}/artifacts/page.tsx`, 'PtArtifacts', 'pt'],
      [`${DOCS_DIR}/testing/page.tsx`, 'PtTesting', 'pt'],
      [`${DOCS_DIR}/changelog/page.tsx`, 'PtChangelog', 'pt'],
      [`${DOCS_DIR}/glossary/page.tsx`, 'PtGlossary', 'pt'],
      [`${DOCS_DIR}/en/sdk/page.tsx`, 'EnSdk', 'en'],
      [`${DOCS_DIR}/en/reference/page.tsx`, 'EnReference', 'en'],
      [`${DOCS_DIR}/en/trust/page.tsx`, 'EnTrust', 'en'],
      [`${DOCS_DIR}/en/artifacts/page.tsx`, 'EnArtifacts', 'en'],
      [`${DOCS_DIR}/en/testing/page.tsx`, 'EnTesting', 'en'],
      [`${DOCS_DIR}/en/changelog/page.tsx`, 'EnChangelog', 'en'],
      [`${DOCS_DIR}/en/glossary/page.tsx`, 'EnGlossary', 'en'],
    ];
    for (const [file, comp] of placements) {
      expect(read(file).includes(comp), `${file} must render ${comp}`).toBe(true);
    }
    // Section-to-component placement: the tokens live in the expected components.
    const ptSdkBlock = PT_CONTENT.slice(PT_CONTENT.indexOf('export function PtSdk'), PT_CONTENT.indexOf('export function PtGuides'));
    expect(ptSdkBlock).toContain('Modelo de integração SDK-first');
    expect(ptSdkBlock).toContain('Onboarding do preview SDK');
    const ptRefBlock = PT_CONTENT.slice(PT_CONTENT.indexOf('export function PtReference'), PT_CONTENT.indexOf('export function PtTesting'));
    expect(ptRefBlock).toContain('Credenciais e capacidades');
    expect(ptRefBlock).toContain('ResourceReference');
    const ptTrustBlock = PT_CONTENT.slice(PT_CONTENT.indexOf('export function PtTrust'), PT_CONTENT.indexOf('export function PtArtifacts'));
    expect(ptTrustBlock).toContain('Confiança técnica e prontidão');
  });
  it('the reference area states protocol-reference framing (SDK-first stays primary)', () => {
    expect(PT).toContain('camada de referência técnica do protocolo');
    expect(EN).toContain('technical protocol reference layer');
  });
});

describe('P3A — public artifact URLs unchanged', () => {
  it('all 20 preserved artifact URLs exist as public files', () => {
    expect(PRESERVED_ARTIFACT_URLS).toHaveLength(20);
    for (const url of PRESERVED_ARTIFACT_URLS) {
      expect(existsSync(join(process.cwd(), 'public', url)), `missing public artifact: ${url}`).toBe(true);
    }
  });
  it('the manifest still indexes its artifacts at unchanged paths', () => {
    const paths = MANIFEST.artifacts.map((a: { path: string }) => a.path);
    for (const p of PRESERVED_ARTIFACT_URLS.filter((u) => !u.includes('/examples/curl/') || paths.includes(u))) {
      if (paths.includes(p)) expect(paths).toContain(p);
    }
    expect(paths).toContain('/developers/artifacts/sdk-contract.json');
    expect(paths).toContain('/developers/trust/decision-gates.json');
  });
});

describe('P3A — claim safety across the reorganized corpus', () => {
  const CORPUS = PT + EN;
  it('no fake installs; no HTTP-recommended wording; SDK-first present', () => {
    expect(CORPUS.split('npm install @banzami/sdk').length - 1).toBeGreaterThanOrEqual(2); // the real command, per language
    for (const cmd of FAKE_INSTALL_COMMANDS) {
      expect(CORPUS.includes(cmd)).toBe(false);
    }
    for (const bad of ['official http integration path', 'caminho oficial é http', 'official public documentation path', 'recommended direct http']) {
      expect(CORPUS.toLowerCase().includes(bad)).toBe(false);
    }
    expect(PT).toContain('SDK-first');
    expect(EN).toContain('SDK-first');
  });
  // These pin the claims that are STILL true. Two former entries were retired
  // deliberately rather than relaxed: the Console is no longer a demo, and
  // outbound webhooks are no longer simulated. Both were proven end to end
  // against the deployed Sandbox, so continuing to assert the old wording would
  // pin an untruth — understating the platform, which is as wrong as
  // overstating it. What remains unproven is still pinned here.
  it('controlled preview, pending-E2E and Stage C not approved persist', () => {
    expect(PT).toContain('pré-visualização controlada');
    expect(EN).toContain('controlled preview');
    // "Pendente E2E" wording belongs on the page only while the manifest still
    // withholds a release. Asserting it unconditionally would pin a claim the
    // evidence has since overtaken.
    for (const { id } of CARD_CAPABILITIES) {
      if (isReleased(id)) continue;
      expect(PT).toContain('Pendente E2E');
      expect(EN).toContain('Pending E2E');
    }
    expect(PT).toContain('Stage C não implementado/não aprovado');
    expect(EN).toContain('Stage C not implemented/approved');
  });

  it('does not re-introduce the retired demo-Console or simulated-webhook claims', () => {
    for (const stale of ['demo previews, not operational', 'demo / non-operational']) {
      expect(EN.includes(stale), `EN must not re-assert: ${stale}`).toBe(false);
    }
    expect(PT.includes('demo / não-operacional'), 'PT must not re-assert demo Console').toBe(false);
  });
  it('no production/live/BNA/provider/regulatory or certification overclaims', () => {
    for (const bad of ['production ready', 'Production is available', 'BNA approved', 'SOC 2', 'ISO 27001', 'PCI DSS', 'certified uptime', '99.9']) {
      expect(CORPUS.toLowerCase().includes(bad.toLowerCase()), `overclaim: ${bad}`).toBe(false);
    }
    // BNA only inside prohibitions.
    for (const line of CORPUS.split('\n')) {
      if (!/BNA/.test(line)) continue;
      expect(/não reivindicar|do not claim/i.test(line)).toBe(true);
    }
  });
});
