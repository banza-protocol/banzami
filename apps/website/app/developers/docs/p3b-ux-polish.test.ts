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

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const D = 'app/developers/docs';
const PT_HOME = read(`${D}/page.tsx`);
const EN_HOME = read(`${D}/en/page.tsx`);
const SHELL = read(`${D}/shell.tsx`);
const PT = read(`${D}/content-pt.tsx`);
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
    for (const t of ['Começar com preview SDK', 'Validar no Sandbox', 'Consultar referência técnica']) {
      expect(SHELL.includes(t), `PT primary path missing: ${t}`).toBe(true);
    }
    expect(PT_HOME).toContain('PRIMARY_PATHS_PT');
  });
  it('EN home has the three primary path cards', () => {
    for (const t of ['Start with SDK preview', 'Validate in Sandbox', 'Read technical reference']) {
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
    for (const k of ['SDKs', 'HTTP/OpenAPI', 'Produção / trilhos live', 'Console visual', 'Reembolsos / transferências', 'Webhooks outbound']) {
      expect(PT_HOME.includes(k), `PT state row missing: ${k}`).toBe(true);
    }
    for (const k of ['SDKs', 'HTTP/OpenAPI', 'Production / live rails', 'Visual Console', 'Refunds / transfers', 'Webhook outbound']) {
      expect(EN_HOME.includes(k), `EN state row missing: ${k}`).toBe(true);
    }
  });
  it('both homes show the three suggested journeys', () => {
    for (const r of ['Novo parceiro aprovado', 'Developer técnico', 'Auditor/avaliador técnico']) {
      expect(SHELL.includes(r), `PT journey missing: ${r}`).toBe(true);
    }
    for (const r of ['New approved partner', 'Technical developer', 'Technical reviewer']) {
      expect(SHELL.includes(r), `EN journey missing: ${r}`).toBe(true);
    }
    expect(PT_HOME).toContain('JOURNEYS_PT');
    expect(EN_HOME).toContain('JOURNEYS_EN');
  });
});

describe('P3B — sidebar labels match the IA', () => {
  it('PT sidebar labels', () => {
    for (const l of ['Início', 'Começar', 'SDKs', 'Guias', 'Referência API', 'Testar no Sandbox', 'Confiança e prontidão', 'Artefactos', 'Changelog', 'Glossário']) {
      expect(SHELL.includes(`label: '${l}'`), `PT sidebar label missing: ${l}`).toBe(true);
    }
  });
  it('EN sidebar labels', () => {
    for (const l of ['Home', 'Get started', 'SDKs', 'Guides', 'API Reference', 'Sandbox testing', 'Trust and readiness', 'Artifacts', 'Changelog', 'Glossary']) {
      expect(SHELL.includes(`label: '${l}'`), `EN sidebar label missing: ${l}`).toBe(true);
    }
  });
});

describe('P3B — quickstart is SDK-first, curl is diagnostic-only', () => {
  it('PT quickstart states the recommended path and curl-for-validation-only', () => {
    expect(PT).toContain('Caminho recomendado: SDK preview aprovado');
    expect(PT.replace(/\s+/g, ' ')).toContain('use curl apenas para validar o protocolo, diagnosticar o Sandbox ou auditar chamadas de baixo nível');
    // step 7 no longer frames direct HTTP as the primary "continue" path.
    expect(PT.includes('Continue por HTTP direto (curl) ou, opcionalmente')).toBe(false);
  });
  it('EN quickstart states the recommended path and curl-for-validation-only', () => {
    expect(EN).toContain('Recommended path: approved SDK preview');
    expect(EN.replace(/\s+/g, ' ')).toContain('use curl only to validate the protocol, diagnose Sandbox behaviour, or audit low-level calls');
    expect(EN.includes('Continue over direct HTTP (curl) or, optionally')).toBe(false);
  });
  it('direct HTTP is never called the official/recommended implementation path', () => {
    for (const bad of ['official http integration path', 'caminho oficial é http', 'recommended direct http', 'http direto é o caminho recomendado']) {
      expect(CORPUS.toLowerCase().includes(bad)).toBe(false);
    }
  });
});

describe('P3B — credential-scoped badge clarity', () => {
  it('transfers and refunds cards read Pending E2E for developer keys', () => {
    expect(PT).toContain("badgeText: 'Pendente E2E para chave developer'");
    // two cards carry it (transfers + refunds)
    expect((PT.match(/Pendente E2E para chave developer/g) || []).length).toBeGreaterThanOrEqual(2);
  });
  it('webhooks card distinguishes signature from outbound simulation', () => {
    expect(PT).toContain("badgeText: 'Assinatura documentada · outbound simulado'");
  });
  it('the docs-claims gate still sees the released-capability tone (transfers tone ok kept)', () => {
    // href → tone adjacency preserved for the manifest-disposition gate.
    expect(/href: '\/docs\/guides#transferencias',\s*\n\s*tone: 'ok'/.test(PT)).toBe(true);
  });
});

describe('P3B — page intros / next steps', () => {
  it('every thin PT area page gained a lede or next-steps', () => {
    // guides/reference/testing/artifacts/changelog/glossary get a PageLede.
    for (const t of [
      'Guias práticos de integração',
      'Camada de <strong>referência do protocolo</strong>',
      'Como validar a integração no Sandbox',
      'Artefactos públicos de <strong>referência Sandbox/Preview</strong>',
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
      'Public <strong>Sandbox/Preview reference</strong> artifacts',
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
  it('SDKs controlled preview / not published; HTTP secondary; no fake installs', () => {
    expect(PT).toContain('pré-visualização controlada');
    expect(EN).toContain('controlled preview');
    expect(PT).toContain('camada de referência técnica do protocolo');
    expect(EN).toContain('technical protocol reference layer');
    for (const cmd of ['pip install banzami', 'composer require banzami/sdk', 'pub add banzami', 'pod "Banzami"']) {
      expect(CORPUS.includes(cmd)).toBe(false);
    }
  });
  it('pending-E2E, simulated webhooks, demo Console, Stage C not approved persist', () => {
    expect(PT).toContain('Pendente E2E');
    expect(EN).toContain('Pending E2E');
    expect(EN).toContain('simulated');
    expect(EN).toContain('demo previews, not operational');
    expect(PT).toContain('Stage C não implementado/não aprovado');
    expect(EN).toContain('Stage C not implemented/approved');
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
    expect(PRESERVED_ARTIFACT_URLS).toHaveLength(20);
    for (const url of PRESERVED_ARTIFACT_URLS) {
      expect(existsSync(join(process.cwd(), 'public', url)), `missing public artifact: ${url}`).toBe(true);
    }
  });
});
