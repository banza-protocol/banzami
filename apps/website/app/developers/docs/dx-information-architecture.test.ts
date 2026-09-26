// DOCS-DX-001 information architecture and claim-safety guards.
//
// Replaces the P3A/P3B/P3C suites, which pinned the previous page set (nine
// areas, three "primary paths", three suggested journeys) and wording the
// editorial pass retired. What those suites protected that is still true is kept
// here, against the task-oriented structure: every page exists in both
// languages, the home page starts from tasks, old /docs/guides links land on the
// page their section became, capability badges track the assurance manifest,
// artifacts stay where integrations fetch them, and no page overclaims.
// Node-only (fs), no jsdom, no network.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AREAS_EN, AREAS_PT, NAV_GROUPS } from './shell';
import { GUIDES_MOVED } from './GuidesMoved';
import { PRESERVED_ARTIFACT_URLS } from './content-map';
import { CARD_CAPABILITIES, isReleased } from './assurance-manifest';
import { FAKE_INSTALL_COMMANDS } from './published-packages';
import { ENDPOINT_META } from './endpoint-meta';
import { SCOPE_PURPOSE } from './reference';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const DIR = 'app/developers/docs';
const PT = read(`${DIR}/content-pt.tsx`);
const EN = read(`${DIR}/content-en.tsx`);
const HOME = read(`${DIR}/HomePage.tsx`);
const CARDS = read(`${DIR}/CapabilityCards.tsx`);
const CORPUS = PT + EN + HOME;
const MANIFEST = JSON.parse(read('public/developers/artifacts/manifest.json'));

describe('DX — routes', () => {
  it('every page in the sidebar exists in Portuguese and English', () => {
    expect(AREAS_PT.map((a) => a.slug)).toEqual(AREAS_EN.map((a) => a.slug));
    for (const { slug } of AREAS_PT) {
      const pt = slug ? `${DIR}/${slug}/page.tsx` : `${DIR}/page.tsx`;
      const en = slug ? `${DIR}/en/${slug}/page.tsx` : `${DIR}/en/page.tsx`;
      expect(existsSync(join(process.cwd(), pt)), `missing ${pt}`).toBe(true);
      expect(existsSync(join(process.cwd(), en)), `missing ${en}`).toBe(true);
    }
  });
  it('no locale beyond en exists', () => {
    const dirs = readdirSync(join(process.cwd(), DIR), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
    expect(dirs.filter((d) => /^(fr|es|de|it|zh|ru|pt)$/.test(d))).toEqual([]);
  });
  it('the sidebar groups every page once, by task', () => {
    expect(NAV_GROUPS.map((g) => g.title.en)).toEqual(['Get started', 'Build', 'Console', 'Reference', 'Learn', 'Resources']);
    const listed = NAV_GROUPS.flatMap((g) => g.slugs);
    expect([...listed].sort()).toEqual(AREAS_PT.map((a) => a.slug).sort());
  });
  it('every retired /docs/guides anchor lands on a page that exists', () => {
    const slugs = new Set(AREAS_PT.map((a) => a.slug));
    for (const lang of ['pt', 'en'] as const) {
      for (const target of Object.values(GUIDES_MOVED[lang])) {
        const slug = target.replace(/^\/docs(\/en)?\//, '').split('#')[0];
        expect(slugs.has(slug), `${lang} guides redirect → ${target}`).toBe(true);
      }
    }
  });
});

describe('DX — the home page starts from tasks', () => {
  it('is a short task page, not a table of contents or the old giant page', () => {
    expect(HOME.split('\n').length).toBeLessThan(160);
    expect(HOME).toContain('<TaskCards');
    expect(HOME).toContain('<PathDiagram');
    for (const cta of ['Começar a construir', 'Start building', 'Referência da API', 'API reference']) expect(HOME).toContain(cta);
    for (const status of ['Sandbox disponível', 'Operações com dinheiro real indisponíveis', 'Sandbox available', 'Real-money operations unavailable']) expect(HOME).toContain(status);
  });
});

describe('DX — capability badges track the assurance manifest', () => {
  it('every capability card carries the badge its manifest entry earns', () => {
    for (const { card, id } of CARD_CAPABILITIES) {
      const start = CARDS.indexOf(`title: { pt: '${card}'`);
      expect(start, `card ${card} is missing`).toBeGreaterThan(-1);
      const block = CARDS.slice(start, start + 900);
      const ref = (block.match(/badgeText: (\w+|\{ pt: '[^']+')/) || [])[1];
      expect(ref, `card ${card} has no badge`).toBeDefined();
      const badge = ref === 'AVAILABLE' ? 'Disponível em Sandbox' : (ref.match(/pt: '([^']+)'/) || [])[1];
      expect(badge === 'Disponível em Sandbox', `${card} badge vs ${id}`).toBe(isReleased(id));
    }
  });
});

describe('DX — artifacts stay where integrations fetch them', () => {
  it('every preserved artifact URL exists as a public file and is linked from the docs', () => {
    for (const url of PRESERVED_ARTIFACT_URLS) {
      expect(existsSync(join(process.cwd(), 'public', url)), `missing public artifact: ${url}`).toBe(true);
    }
    for (const src of [PT, EN]) for (const f of ['banzami-sandbox.openapi.json', 'banzami-sandbox.postman_collection.json', 'sdk-first-manifest.json']) expect(src).toContain(f);
  });
  it('the manifest still indexes the OpenAPI document and the SDK contract', () => {
    const paths = MANIFEST.artifacts.map((a: { path: string }) => a.path);
    expect(paths).toContain('/developers/openapi/banzami-sandbox.openapi.json');
    expect(paths).toContain('/developers/artifacts/sdk-contract.json');
    expect(paths).not.toContain('/developers/trust/decision-gates.json');
  });
});

describe('DX — claim safety across the corpus', () => {
  it('real install commands only; SDK recommended; HTTP never the recommended path', () => {
    expect(CORPUS.split('npm install @banzami/sdk').length - 1).toBeGreaterThanOrEqual(2);
    for (const cmd of FAKE_INSTALL_COMMANDS) expect(CORPUS.includes(cmd), `fake install ${cmd}`).toBe(false);
    for (const bad of ['official http integration path', 'caminho oficial é http', 'recommended direct http']) {
      expect(CORPUS.toLowerCase().includes(bad)).toBe(false);
    }
    expect(PT).toContain('São o caminho recomendado');
    expect(EN).toContain('They are the recommended path');
  });
  it('a project key reaches the OpenAPI document and nothing else; unreleased capabilities are never available', () => {
    expect(PT).toContain('A chave de projeto só alcança os endpoints do documento OpenAPI');
    expect(EN).toContain('A project key reaches only the endpoints in the OpenAPI document');
    for (const { id } of CARD_CAPABILITIES) {
      if (isReleased(id)) continue;
      expect(PT).toContain('Pendente E2E');
      expect(EN).toContain('Pending E2E');
    }
  });
  it('no demo-Console or simulated-webhook claims come back', () => {
    for (const stale of ['demo previews, not operational', 'demo / non-operational', 'outbound simulado']) {
      expect(CORPUS.includes(stale), stale).toBe(false);
    }
    expect(PT).toContain('A entrega de webhooks é real');
    expect(EN).toContain('Webhook delivery is real');
  });
  it('no production, live, regulatory or certification overclaims', () => {
    for (const bad of ['production ready', 'Production is available', 'BNA approved', 'SOC 2', 'ISO 27001', 'PCI DSS', 'certified uptime', '99.9', 'sign up now']) {
      expect(CORPUS.toLowerCase().includes(bad.toLowerCase()), `overclaim: ${bad}`).toBe(false);
    }
    for (const line of CORPUS.split('\n')) {
      if (!/BNA/.test(line)) continue;
      expect(/não reivindicar|do not claim/i.test(line)).toBe(true);
    }
  });
  it('every page opens with one h1 and ends with next steps, in both languages', () => {
    for (const [lang, src, prefix] of [['pt', PT, 'Pt'], ['en', EN, 'En']] as const) {
      const fns = [...src.matchAll(new RegExp(`export function ${prefix}(\\w+)\\(`, 'g'))];
      expect(fns.length).toBe(AREAS_PT.length - 1);
      fns.forEach((m, i) => {
        const body = src.slice(m.index, i + 1 < fns.length ? fns[i + 1].index : src.length);
        expect((body.match(/<h1 /g) ?? []).length, `${lang} ${m[1]} h1`).toBe(1);
        expect(body.includes('<NextStepCards'), `${lang} ${m[1]} next steps`).toBe(true);
      });
    }
  });
});

describe('scopes by task', () => {
  it('describes exactly the scopes the endpoint contracts require', () => {
    const required = new Set(Object.values(ENDPOINT_META).map((m) => m.scope).filter(Boolean));
    expect([...required].filter((s) => !SCOPE_PURPOSE[s as string]), 'scope with no purpose').toEqual([]);
    expect(Object.keys(SCOPE_PURPOSE).filter((s) => !required.has(s)), 'purpose for a scope no endpoint requires').toEqual([]);
  });
});
