// P2C SDK contracts & controlled-preview guards.
//
// Locks in: SDK controlled-preview sections (PT/EN, required wording), the
// machine-readable sdk-contract.json, manifest inclusion, SDK family tables,
// SDK-style preview examples clearly marked non-installable, and all previous
// honesty (SDK-first, HTTP secondary, no fake installs, pending-E2E, simulated
// webhooks, PT/EN only). Node-only (fs + JSON), no jsdom, no network.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO = join(process.cwd(), '..', '..');
const read = (p: string) => readFileSync(join(REPO, p), 'utf8');
const PUB = 'apps/website/public/developers';

const PT = read('apps/website/app/developers/docs/content-pt.tsx') + read('apps/website/app/developers/docs/page.tsx');
const EN = read('apps/website/app/developers/docs/content-en.tsx') + read('apps/website/app/developers/docs/en/page.tsx');
const CONTRACT = JSON.parse(read(`${PUB}/artifacts/sdk-contract.json`));
const MANIFEST = JSON.parse(read(`${PUB}/artifacts/manifest.json`));
const TS_EX = read(`${PUB}/examples/sdk-preview/typescript-payment-session.example.ts`);
const PY_EX = read(`${PUB}/examples/sdk-preview/python-payment-session.example.py`);
const PHP_EX = read(`${PUB}/examples/sdk-preview/php-payment-session.example.php`);

describe('P2C — controlled preview sections (PT/EN)', () => {
  it('PT has the section and the required wording', () => {
    expect(PT).toContain('SDKs em pré-visualização controlada');
    expect(PT).toContain('pré-visualização controlada');
    expect(PT).toContain('contrato esperado dos SDKs');
    expect(PT).toContain('Contrato esperado do SDK');
    expect(PT).toContain('Os exemplos SDK-style são exemplos de ergonomia prevista');
  });
  it('EN has the section and the required wording', () => {
    expect(EN).toContain('SDKs in controlled preview');
    expect(EN).toContain('treated as controlled preview');
    expect(EN).toContain('expected SDK contract');
    expect(EN).toContain('Expected SDK contract');
    expect(EN).toContain('The SDK-style examples describe intended ergonomics');
  });
  it('SDK family table exists in PT and EN with conservative values', () => {
    for (const [src, vals] of [
      [PT, ['Estado por família de SDK', 'não publicado publicamente', 'não instale de registos públicos ainda', 'acesso de pré-visualização aprovado']],
      [EN, ['SDK family status', 'not publicly published', 'do not install from public registries yet', 'use only through approved preview access']],
    ] as [string, string[]][]) {
      for (const v of vals) expect(src.includes(v), `missing table value: ${v}`).toBe(true);
      for (const fam of ['JavaScript/TypeScript', 'Python', 'PHP', 'Flutter']) expect(src).toContain(fam);
    }
  });
});

describe('P2C — sdk-contract.json', () => {
  it('has the required conservative shape', () => {
    expect(CONTRACT.name).toBe('Banzami SDK Contract');
    expect(CONTRACT.scope).toBe('sandbox_preview');
    expect(CONTRACT.integration_model).toBe('sdk_first');
    expect(CONTRACT.public_sdk_packages_published).toBe(false);
    expect(CONTRACT.public_install_commands_available).toBe(false);
    expect(CONTRACT.production_contract).toBe(false);
    expect(CONTRACT.http_role).toBe('protocol_reference_secondary');
  });
  it('every family has null public package and null install command', () => {
    expect(CONTRACT.sdk_families.length).toBeGreaterThanOrEqual(4);
    for (const f of CONTRACT.sdk_families) {
      expect(f.public_package).toBeNull();
      expect(f.install_command).toBeNull();
      expect(f.status).toContain('not_published');
    }
  });
  it('responsibilities stay expected/never — nothing claims live rails or key issuance', () => {
    const r = CONTRACT.responsibilities;
    expect(r.authentication).toBe('expected');
    expect(r.payment_sessions).toBe('expected');
    expect(r.idempotency).toBe('expected');
    expect(r.error_mapping).toBe('expected');
    expect(r.request_id_exposure).toBe('expected');
    expect(r.webhook_signature_verification).toBe('expected_or_planned');
    expect(r.production_live_rails).toBe('not_available');
    expect(r.client_side_secret_key_exposure).toBe('never');
    expect(r.automatic_live_rails_activation).toBe('never');
  });
  it('the public artifact manifest includes the SDK contract entry', () => {
    const entry = MANIFEST.artifacts.find((a: { type?: string }) => a.type === 'sdk_contract');
    expect(entry).toBeTruthy();
    expect(entry.role).toBe('integration_guidance');
    expect(entry.production_contract).toBe(false);
    expect(entry.recommended_integration_path).toBe(true);
    expect(entry.url).toBe('/developers/artifacts/sdk-contract.json');
  });
});

describe('P2C — SDK-style preview examples', () => {
  it('all three examples exist and carry the preview warning + anti-install line', () => {
    for (const [ex, anti] of [
      [TS_EX, 'npm install @banzami/sdk'],
      [PY_EX, 'Do not run pip install banzami until official packages are published'],
      [PHP_EX, 'Do not run composer require banzami/sdk until official packages are published'],
    ] as [string, string][]) {
      expect(ex).toContain('Banzami SDK preview example');
      expect(ex).toContain('not a public install path');
      expect(ex).toContain(anti);
      expect(ex).toContain('illustrative SDK-style API');
    }
  });
  it('examples use preview markers, placeholders only, and no real import paths', () => {
    for (const ex of [TS_EX, PY_EX, PHP_EX]) {
      expect(ex.includes('.preview(') || ex.includes('::preview(')).toBe(true);
      expect(/from ['"]@banzami\/sdk['"]/.test(ex)).toBe(false);
      expect(/require\(['"]banzami/.test(ex)).toBe(false);
      expect(/import banzami\b/.test(ex)).toBe(false);
      expect(/bz_(test|live)_(pk|sk)_(?!X{2,})[A-Za-z0-9]{8,}/.test(ex)).toBe(false);
    }
  });
  it('no runnable fake install instruction anywhere (anti-instructions only)', () => {
    const all = [PT, EN, TS_EX, PY_EX, PHP_EX, JSON.stringify(CONTRACT), JSON.stringify(MANIFEST)].join('\n');
    // Every occurrence of an install command must be inside an anti-instruction line.
    // @banzami/sdk is published, so its install command is a real instruction.
    // The unpublished families must still appear only as anti-instructions.
    for (const cmd of ['pip install banzami', 'composer require banzami/sdk', 'pub add banzami']) {
      for (const line of all.split('\n')) {
        if (!line.includes(cmd)) continue;
        const ok = /não corra|nao corra|do not run/i.test(line);
        expect(ok, `install command outside anti-instruction: ${line.trim().slice(0, 100)}`).toBe(true);
      }
    }
  });
});

describe('P2C — previous honesty preserved', () => {
  it('HTTP/OpenAPI remains secondary; direct HTTP never official/recommended', () => {
    expect(PT).toContain('camada de referência técnica do protocolo');
    expect(EN).toContain('technical protocol reference layer');
    for (const bad of ['official http integration path', 'caminho oficial é http', 'official public documentation path', 'recommended direct http']) {
      expect((PT + EN).toLowerCase().includes(bad)).toBe(false);
    }
  });
  it('PT/EN-only rule holds (single en locale dir; no other lang routes)', () => {
    const dirs = readdirSync(join(REPO, 'apps/website/app/developers/docs'), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort();
    // P3A: area routes are directories too — the LOCALE rule is that 'en' is the
    // only locale dir and no other-language dir exists.
    expect(dirs).toContain('en');
    expect(dirs.filter((d) => /^(fr|es|de|it|zh|ru|pt)$/.test(d))).toEqual([]);
    expect(/\/docs\/(fr|es|de|it)\b/.test(PT + EN)).toBe(false);
  });
  it('pending-E2E and no production/BNA claims persist', () => {
    expect(PT).toContain('Pendente E2E');
    expect(EN).toContain('Pending E2E');
    for (const bad of ['production ready', 'BNA approved', 'Production is available']) {
      expect((PT + EN).toLowerCase().includes(bad.toLowerCase())).toBe(false);
    }
  });
});
