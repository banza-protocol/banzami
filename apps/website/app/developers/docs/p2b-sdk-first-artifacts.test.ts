// P2B SDK-first artifact guards.
//
// Locks in the SDK-first integration model: SDKs are the recommended path,
// HTTP/OpenAPI is the secondary protocol reference layer, no SDK package is
// presented as publicly published, and the public static artifacts stay
// Sandbox/Preview-scoped, honest and in parity with their repo sources.
// Node-only (fs + JSON), no jsdom, no network.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO = join(process.cwd(), '..', '..');
const read = (p: string) => readFileSync(join(REPO, p), 'utf8');
const PUB = 'apps/website/public/developers';

const PT = read('apps/website/app/developers/docs/page.tsx');
const EN = read('apps/website/app/developers/docs/en/page.tsx');
const README = read('docs/developer/examples/README.md');
const SDK_MANIFEST = JSON.parse(read(`${PUB}/artifacts/sdk-first-manifest.json`));
const ART_MANIFEST = JSON.parse(read(`${PUB}/artifacts/manifest.json`));

describe('P2B — SDK-first wording in PT and EN', () => {
  it('PT contains the SDK-first model with the required wording', () => {
    expect(PT).toContain('Modelo de integração SDK-first');
    expect(PT).toContain('A filosofia de integração da Banzami é');
    expect(PT).toContain('camada de referência técnica do protocolo');
    expect(PT).toContain('pré-visualização controlada até publicação oficial');
  });
  it('EN contains the SDK-first integration model with the required wording', () => {
    expect(EN).toContain('SDK-first integration model');
    expect(EN).toContain('technical protocol reference layer');
    expect(EN).toContain('controlled preview until official publication');
  });
  it('docs never call direct HTTP the official/recommended integration path', () => {
    for (const [name, src] of Object.entries({ PT, EN, README })) {
      const low = src.toLowerCase();
      for (const bad of ['official http integration path', 'caminho oficial é http', 'official public documentation path', 'recommended direct http', 'http direto é o caminho recomendado', 'caminho recomendado hoje — a mesma api rest']) {
        expect(low.includes(bad), `${name} must not contain "${bad}"`).toBe(false);
      }
    }
  });
  it('artifact sections are labelled protocol reference in both languages', () => {
    expect(PT).toContain('Artefactos técnicos de referência');
    expect(PT).toContain('referência do protocolo');
    expect(EN).toContain('Technical reference artifacts');
    expect(EN).toContain('protocol reference');
    // curl examples labelled diagnostic/protocol reference
    expect(PT).toContain('diagnóstico / referência do protocolo');
    expect(EN).toContain('diagnostic / protocol reference');
  });
});

describe('P2B — no fake install commands, SDKs not publicly published', () => {
  it('no public install command anywhere in docs or artifacts', () => {
    const surfaces = { PT, EN, README, SDK: JSON.stringify(SDK_MANIFEST), ART: JSON.stringify(ART_MANIFEST) };
    for (const [name, src] of Object.entries(surfaces)) {
      for (const cmd of ['pip install banzami', 'composer require banzami/sdk', 'pub add banzami', 'go get github.com/banzami', 'pod "Banzami"']) {
        expect(src.includes(cmd), `${name} must not contain "${cmd}"`).toBe(false);
      }
      // npm install may appear ONLY inside the explicit anti-instruction.
      const n = src.split('npm install @banzami').length - 1;
      expect(n, `${name} has too many npm install mentions`).toBeLessThanOrEqual(1);
    }
    expect(PT).toContain('Não corra');
    expect(EN).toContain('Do not run');
  });
  it('SDKs remain not publicly published in both languages', () => {
    expect(PT).toContain('não estão publicados');
    expect(EN).toContain('not yet publicly published');
  });
});

describe('P2B — sdk-first manifest', () => {
  it('exists with the required machine-readable statement', () => {
    expect(SDK_MANIFEST.integration_model).toBe('sdk_first');
    expect(SDK_MANIFEST.recommended_path).toBe('banzami_sdks');
    expect(SDK_MANIFEST.http_role).toBe('protocol_reference_secondary');
    expect(SDK_MANIFEST.public_sdk_packages_published).toBe(false);
    expect(SDK_MANIFEST.public_install_commands_available).toBe(false);
    expect(SDK_MANIFEST.scope).toBe('sandbox_preview');
    expect(SDK_MANIFEST.production_contract).toBe(false);
  });
  it('every SDK family is controlled preview / not published', () => {
    expect(SDK_MANIFEST.sdk_families.length).toBeGreaterThanOrEqual(4);
    for (const f of SDK_MANIFEST.sdk_families) {
      expect(f.status).toContain('not_published');
      expect(f.registry).toContain('not published');
    }
  });
});

describe('P2B — public artifact manifest and parity', () => {
  it('manifest covers every artifact with conservative flags', () => {
    expect(ART_MANIFEST.scope).toBe('sandbox_preview');
    expect(ART_MANIFEST.production_contract).toBe(false);
    expect(ART_MANIFEST.artifacts.length).toBeGreaterThanOrEqual(6);
    for (const a of ART_MANIFEST.artifacts) {
      expect(a.scope).toBe('sandbox_preview');
      expect(a.production_contract).toBe(false);
      // Only the SDK contract (recommended-path guidance) may be flagged true;
      // every HTTP-level artifact stays secondary protocol reference.
      expect(a.recommended_integration_path).toBe(a.type === 'sdk_contract');
      expect(['protocol_reference', 'integration_guidance', 'preview_onboarding']).toContain(a.role);
    }
    const roles = Object.fromEntries(ART_MANIFEST.artifacts.map((a: { path: string; role: string }) => [a.path, a.role]));
    expect(roles['/developers/openapi/banzami-sandbox.openapi.json']).toBe('protocol_reference');
    expect(roles['/developers/postman/banzami-sandbox.postman_collection.json']).toBe('protocol_reference');
    expect(roles['/developers/examples/curl/get-me.sh']).toBe('protocol_reference');
    expect(roles['/developers/artifacts/sdk-first-manifest.json']).toBe('integration_guidance');
  });
  it('public static copies are byte-identical to the repo sources (parity)', () => {
    for (const [src, pub] of [
      ['docs/developer/openapi/banzami-sandbox.openapi.json', `${PUB}/openapi/banzami-sandbox.openapi.json`],
      ['docs/developer/postman/banzami-sandbox.postman_collection.json', `${PUB}/postman/banzami-sandbox.postman_collection.json`],
      ['docs/developer/availability/banzami-developers-availability.json', `${PUB}/availability/banzami-developers-availability.json`],
      ['docs/developer/examples/curl/get-me.sh', `${PUB}/examples/curl/get-me.sh`],
      ['docs/developer/examples/curl/create-payment-session.sh', `${PUB}/examples/curl/create-payment-session.sh`],
    ]) {
      expect(read(pub), `parity broken: ${pub}`).toBe(read(src));
    }
  });
  it('curl examples carry the diagnostic/protocol-reference label', () => {
    for (const f of [`${PUB}/examples/curl/get-me.sh`, `${PUB}/examples/curl/create-payment-session.sh`]) {
      const s = read(f);
      expect(s).toContain('DIAGNOSTIC / PROTOCOL REFERENCE EXAMPLE');
      expect(s).toContain('SDK-first');
    }
  });
  it('public artifacts contain no secrets/IPs/private hosts', () => {
    const all = [
      read(`${PUB}/openapi/banzami-sandbox.openapi.json`),
      read(`${PUB}/postman/banzami-sandbox.postman_collection.json`),
      read(`${PUB}/availability/banzami-developers-availability.json`),
      JSON.stringify(SDK_MANIFEST), JSON.stringify(ART_MANIFEST),
      read(`${PUB}/examples/curl/get-me.sh`), read(`${PUB}/examples/curl/create-payment-session.sh`),
    ].join('\n');
    expect(/bz_(test|live)_(pk|sk)_(?!X{2,})[A-Za-z0-9]{8,}/.test(all)).toBe(false);
    expect(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/.test(all)).toBe(false);
    expect(all.includes('/srv/')).toBe(false);
    expect(/eyJ[A-Za-z0-9_-]{10,}/.test(all)).toBe(false);
  });
});

describe('P2B — previous honesty preserved', () => {
  it('refunds/transfers remain pending E2E; webhooks outbound remain simulated', () => {
    expect(PT).toContain('Pendente E2E');
    expect(EN).toContain('Pending E2E');
    expect(EN).toContain('simulated');
    expect(EN).toContain('We do not claim webhook delivery as public Production');
  });
  it('no production/live/BNA/provider/Console-operational claims', () => {
    for (const bad of ['production ready', 'BNA approved', 'live payments are available', 'Production is available']) {
      expect(EN.toLowerCase().includes(bad.toLowerCase())).toBe(false);
      expect(PT.toLowerCase().includes(bad.toLowerCase())).toBe(false);
    }
    expect(EN).toContain('demo previews, not operational');
  });
});
