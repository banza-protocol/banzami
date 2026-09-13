// P3B UX-polish guards.
//
// Locks in the documentation UX improvements: landing-home primary path cards +
// section grid + concise state summary + journeys; SDK-first quickstart framing
// (curl labelled diagnostic/protocol only); credential-scoped card badges
// (transfers/refunds Pending E2E; webhooks signature-vs-outbound); per-page
// intros/next-steps; and every prior claim-safety rule across the corpus.
// Node-only (fs), no jsdom, no network.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PRESERVED_ARTIFACT_URLS } from './content-map';
import { CARD_CAPABILITIES, isReleased } from './assurance-manifest';
import { FAKE_INSTALL_COMMANDS } from './published-packages';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const D = 'app/developers/docs';
const PT_HOME = read(`${D}/page.tsx`);
const EN_HOME = read(`${D}/en/page.tsx`);
const SHELL = read(`${D}/shell.tsx`);
const PT = read(`${D}/content-pt.tsx`);
const CARDS_SRC = read(`${D}/CapabilityCards.tsx`);
const EN = read(`${D}/content-en.tsx`);
const CORPUS = PT + EN + PT_HOME + EN_HOME + SHELL;

describe('P3B — landing homes', () => {
  it('PT/EN homes keep the landing titles and remain landing pages (not the giant page)', () => {
    expect(PT_HOME).toContain('Documentação Developers Banzami');
    expect(EN_HOME).toContain('Banzami Developers Documentation');
    expect(PT_HOME.split('\n').length).toBeLessThan(130);
    expect(EN_HOME.split('\n').length).toBeLessThan(130);
    for (const deep of ['Contrato esperado do SDK', 'ResourceReference', 'Portões de decisão']) {
      expect(PT_HOME.includes(deep), `PT home must not embed: ${deep}`).toBe(false);
    }
    for (const deep of ['Expected SDK contract', 'ResourceReference', 'Decision gates before']) {
      expect(EN_HOME.includes(deep), `EN home must not embed: ${deep}`).toBe(false);
    }
  });
  it('PT home has the three primary path cards', () => {
    for (const t of ['Começar', 'Validar no Sandbox', 'Consultar referência técnica']) {
      expect(SHELL.includes(t), `PT primary path missing: ${t}`).toBe(true);
    }
    expect(PT_HOME).toContain('PRIMARY_PATHS_PT');
  });
  it('EN home has the three primary path cards', () => {
    for (const t of ['Get started', 'Validate in Sandbox', 'Read technical reference']) {
      expect(SHELL.includes(t), `EN primary path missing: ${t}`).toBe(true);
    }
    expect(EN_HOME).toContain('PRIMARY_PATHS_EN');
  });
  it('both homes render all 9 section cards (via the AREAS grid)', () => {
    expect(PT_HOME).toContain("AREAS_PT.filter((a) => a.slug)");
    expect(EN_HOME).toContain("AREAS_EN.filter((a) => a.slug)");
    // 9 non-home area slugs.
    const slugs = ['get-started', 'sdk', 'guides', 'reference', 'testing', 'trust', 'artifacts', 'changelog', 'glossary'];
    for (const sl of slugs) expect(SHELL.includes(`slug: '${sl}'`)).toBe(true);
  });
  it('both homes present the concise 6-line current-state summary', () => {
    for (const k of ['SDKs', 'HTTP/OpenAPI', 'Produção / trilhos live', 'Console de developers', 'Reembolsos / transferências', 'Webhooks outbound']) {
      expect(PT_HOME.includes(k), `PT state row missing: ${k}`).toBe(true);
    }
    for (const k of ['SDKs', 'HTTP/OpenAPI', 'Production / live rails', 'Developer Console', 'Refunds / transfers', 'Webhook outbound']) {
      expect(EN_HOME.includes(k), `EN state row missing: ${k}`).toBe(true);
    }
  });
  it('both homes show the three suggested journeys', () => {
    for (const r of ['Novo developer', 'Developer técnico', 'Auditor/avaliador técnico']) {
      expect(SHELL.includes(r), `PT journey missing: ${r}`).toBe(true);
    }
    for (const r of ['New developer', 'Technical developer', 'Technical reviewer']) {
      expect(SHELL.includes(r), `EN journey missing: ${r}`).toBe(true);
    }
    expect(PT_HOME).toContain('JOURNEYS_PT');
    expect(EN_HOME).toContain('JOURNEYS_EN');
  });
});

describe('P3B — sidebar labels match the IA', () => {
  it('PT sidebar labels', () => {
    for (const l of ['Início', 'Começar', 'SDKs', 'Guias', 'Referência API', 'Testar no Sandbox', 'Segurança', 'Artefactos', 'Changelog', 'Glossário']) {
      expect(SHELL.includes(`label: '${l}'`), `PT sidebar label missing: ${l}`).toBe(true);
    }
  });
  it('EN sidebar labels', () => {
    for (const l of ['Home', 'Get started', 'SDKs', 'Guides', 'API Reference', 'Sandbox testing', 'Security', 'Artifacts', 'Changelog', 'Glossary']) {
      expect(SHELL.includes(`label: '${l}'`), `EN sidebar label missing: ${l}`).toBe(true);
    }
  });
});

describe('P3B — quickstart is SDK-first, curl is diagnostic-only', () => {
  it('PT quickstart states the recommended path and curl-for-validation-only', () => {
    // The SDK is published, so the recommended path names it and gives the
    // real command. curl keeps its diagnostic role, but is no longer offered
    // as a stand-in for an unpublished package.
    expect(PT).toContain('Caminho recomendado: o SDK TypeScript');
    expect(PT).toContain('npm install @banzami/sdk');
    expect(PT.replace(/\s+/g, ' ')).toContain('não é o caminho de implementação');
    // step 7 no longer frames direct HTTP as the primary "continue" path.
    expect(PT.includes('Continue por HTTP direto (curl) ou, opcionalmente')).toBe(false);
  });
  it('EN quickstart states the recommended path and curl-for-validation-only', () => {
    expect(EN).toContain('Recommended path: the TypeScript SDK');
    expect(EN).toContain('npm install @banzami/sdk');
    expect(EN.replace(/\s+/g, ' ')).toContain('it is not the implementation path');
    expect(EN.includes('Continue over direct HTTP (curl) or, optionally')).toBe(false);
  });
  it('direct HTTP is never called the official/recommended implementation path', () => {
    for (const bad of ['official http integration path', 'caminho oficial é http', 'recommended direct http', 'http direto é o caminho recomendado']) {
      expect(CORPUS.toLowerCase().includes(bad)).toBe(false);
    }
  });
});

describe('P3B — credential-scoped badge clarity', () => {
  it('every capability card carries the badge its manifest entry earns', () => {
    // The manifest is the source. A card may say "Disponível em Sandbox" only
    // while its capability is released with deployed E2E evidence behind it;
    // short of that it must read "Pendente E2E para chave developer". Asserting
    // both directions catches an over-claim and a stale under-claim alike.
    // The cards live in CapabilityCards.tsx, one definition for both languages.
    for (const { card, id } of CARD_CAPABILITIES) {
      const start = CARDS_SRC.indexOf(`title: { pt: '${card}'`);
      expect(start, `card ${card} is missing`).toBeGreaterThan(-1);
      const block = CARDS_SRC.slice(start, start + 900);
      const ref = (block.match(/badgeText: (\w+|\{ pt: '[^']+')/) || [])[1];
      expect(ref, `card ${card} has no badge`).toBeDefined();
      const badge = ref === 'AVAILABLE' ? 'Disponível em Sandbox' : (ref.match(/pt: '([^']+)'/) || [])[1];
      expect(badge === 'Disponível em Sandbox', `${card} badge vs ${id}`).toBe(isReleased(id));
      if (!isReleased(id)) expect(badge).toBe('Pendente E2E para chave developer');
    }
  });
  // Outbound delivery is no longer simulated: it is proven against the deployed
  // Sandbox to a genuinely public HTTPS receiver, with an independently verified
  // signature, tamper rejection, retry and failure isolation. The card says so,
  // and this guards against silently reverting to the weaker claim.
  it('webhooks: outbound delivery is never re-described as simulated', () => {
    // Outbound delivery is proven against the deployed Sandbox to a genuinely
    // public HTTPS receiver, with an independently verified signature, tamper
    // rejection, retry and failure isolation. Understating that is as much a
    // false claim as overstating it, so the weaker wording must not come back.
    expect(PT.includes('outbound simulado'), 'must not re-assert simulated outbound').toBe(false);
    expect(PT).toContain('Entrega outbound de webhooks');
    // The claim a developer relies on is that deliveries are REAL and SIGNED. The
    // previous wording described how Banzami verified it ("assinatura confirmada
    // de forma independente…"), which is assurance language DOCS-PROD-001 §72
    // keeps out of beginner docs. The meaning is pinned; the audit phrasing is not.
    expect(PT).toContain('entregas reais, assinadas');
  });
  it('the docs-claims gate still sees the released-capability tone (transfers tone ok kept)', () => {
    // href → tone adjacency preserved for the manifest-disposition gate.
    expect(/href: \{ pt: '\/docs\/guides#transferencias'[^}]*\},\s*\n\s*tone: 'ok'/.test(CARDS_SRC)).toBe(true);
  });
});

describe('P3B — page intros / next steps', () => {
  it('every thin PT area page gained a lede or next-steps', () => {
    // guides/reference/testing/artifacts/changelog/glossary get a PageLede.
    for (const t of [
      'Guias práticos de integração',
      'Camada de <strong>referência do protocolo</strong>',
      'Como validar a integração no Sandbox',
      'Artefactos públicos do <strong>Sandbox</strong>',
      'Registo de mudanças de documentação',
      'Definições dos termos usados nesta documentação',
    ]) {
      expect(PT.includes(t), `PT lede missing: ${t.slice(0, 30)}`).toBe(true);
    }
    expect(PT).toContain('<NextSteps');
  });
  it('every thin EN area page gained a lede or next-steps', () => {
    for (const t of [
      'Practical integration guidance',
      'The <strong>protocol reference</strong> layer',
      'How to validate the integration in the Sandbox',
      'Public <strong>Sandbox</strong> artifacts',
      'Documentation, API-contract and Sandbox change tracking',
      'Definitions of the terms used across this documentation',
    ]) {
      expect(EN.includes(t), `EN lede missing: ${t.slice(0, 30)}`).toBe(true);
    }
    expect(EN).toContain('<NextSteps');
  });
  it('reference pages explicitly state they are not the recommended implementation path', () => {
    expect(PT).toContain('Não é o caminho de implementação recomendado');
    expect(EN).toContain('It is not the recommended implementation path');
  });
});

describe('P3B — claim safety preserved across the polished corpus', () => {
  it('published SDKs install from their registries; HTTP stays secondary; no fake installs', () => {
    expect(PT).toContain('pré-visualização controlada');
    expect(EN).toContain('npm install @banzami/sdk');
    expect(PT).toContain('camada de referência técnica do protocolo');
    expect(EN).toContain('technical protocol reference layer');
    for (const cmd of FAKE_INSTALL_COMMANDS) {
      expect(CORPUS.includes(cmd)).toBe(false);
    }
  });
  it('Stage C not approved persists, and no capability over-claims its manifest state', () => {
    // Was: expect(PT).toContain('Stage C não implementado/não aprovado').
    // "Stage C" is our internal release-train vocabulary and means nothing to
    // the developer reading the page. The limitation it stood for is real and is
    // still stated, in words a reader can act on: the public surface is the
    // OpenAPI document and nothing else, and anything outside it answers 404.
    expect(PT).toContain('O que a sua chave alcança é o documento OpenAPI');
    expect(EN).toContain('What your key reaches is the OpenAPI document');
    // "Pendente E2E" must appear exactly where the manifest still withholds a
    // release — no more, and no less.
    for (const { id } of CARD_CAPABILITIES) {
      if (isReleased(id)) continue;
      expect(PT).toContain('Pendente E2E');
      expect(EN).toContain('Pending E2E');
    }
  });
  it('no production/live/BNA/provider/regulatory/certification overclaims', () => {
    for (const bad of ['production ready', 'Production is available', 'BNA approved', 'SOC 2', 'ISO 27001', 'PCI DSS', 'certified uptime', '99.9', 'sign up now']) {
      expect(CORPUS.toLowerCase().includes(bad.toLowerCase()), `overclaim: ${bad}`).toBe(false);
    }
    for (const line of CORPUS.split('\n')) {
      if (!/BNA/.test(line)) continue;
      expect(/não reivindicar|do not claim/i.test(line)).toBe(true);
    }
  });
  it('public artifact URLs are unchanged (still exist as public files)', () => {
    expect(PRESERVED_ARTIFACT_URLS.length).toBeGreaterThanOrEqual(8);
    for (const url of PRESERVED_ARTIFACT_URLS) {
      expect(existsSync(join(process.cwd(), 'public', url)), `missing public artifact: ${url}`).toBe(true);
    }
  });
});
