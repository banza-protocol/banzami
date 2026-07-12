// P2E trust & readiness package guards.
//
// Locks in the trust/readiness sections (PT/EN), the seven public artifacts
// with the conservative flag set, manifest inclusion, no-overclaim rules
// (no certification/audit/uptime/SLA claims), and all previous honesty.
// Node-only (fs + JSON), no jsdom, no network.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO = join(process.cwd(), '..', '..');
const read = (p: string) => readFileSync(join(REPO, p), 'utf8');
const TR = 'apps/website/public/developers/trust';

const PT = read('apps/website/app/developers/docs/content-pt.tsx') + read('apps/website/app/developers/docs/page.tsx');
const EN = read('apps/website/app/developers/docs/content-en.tsx') + read('apps/website/app/developers/docs/en/page.tsx');
const MANIFEST = JSON.parse(read('apps/website/public/developers/artifacts/manifest.json'));
const JSON_ARTIFACTS = [
  'developer-trust-summary.json',
  'sandbox-evidence-map.json',
  'risk-limitations-matrix.json',
  'partner-readiness-package.json',
  'decision-gates.json',
  'preview-security-posture.json',
].map((f) => ({ file: f, data: JSON.parse(read(`${TR}/${f}`)) }));
const SUMMARY_MD = read(`${TR}/trust-readiness-summary.md`);

describe('P2E — trust/readiness sections exist in PT and EN', () => {
  it('PT sections', () => {
    for (const t of ['Confiança técnica e prontidão', 'Mapa de evidências Sandbox', 'Matriz de riscos e limitações', 'Pacote de prontidão para parceiros aprovados', 'Portões de decisão antes de qualquer avanço', 'Resumo de postura de segurança do preview']) {
      expect(PT.includes(t), `PT missing: ${t}`).toBe(true);
    }
    const flat = PT.replace(/\s+/g, ' ');
    expect(flat).toContain('o que não deve ser interpretado como aprovação de Produção, ativação de trilhos live ou autorização regulatória');
    expect(flat).toContain('Nenhum portão nesta documentação autoriza trilhos live');
    expect(flat).toContain('não autorizam dinheiro real e não representam aprovação regulatória');
  });
  it('EN sections', () => {
    for (const t of ['Technical trust and readiness', 'Sandbox evidence map', 'Risk and limitation matrix', 'Readiness package for approved partners', 'Decision gates before any next phase', 'Preview security posture summary']) {
      expect(EN.includes(t), `EN missing: ${t}`).toBe(true);
    }
    const flat = EN.replace(/\s+/g, ' ');
    expect(flat).toContain('must not be interpreted as Production approval, live rails activation, or regulatory authorization');
    expect(flat).toContain('No gate in this documentation authorizes live rails, real-money payments, public launch, production key issuance, or regulatory approval');
    expect(flat).toContain('do not authorize real money, and do not represent regulatory approval');
  });
  it('availability summary exists in both, with conservative states only', () => {
    const STATES = ['available_controlled_sandbox', 'documented_preview', 'pending_e2e', 'simulated', 'not_public', 'not_available', 'not_approved'];
    for (const src of [PT, EN]) {
      for (const st of STATES) expect(src.includes(st), `missing state: ${st}`).toBe(true);
    }
    // Conservative bindings preserved.
    expect(PT).toContain("['Reembolsos (chave developer)', 'pending_e2e']");
    expect(PT).toContain("['Entrega outbound de webhooks', 'simulated']");
    expect(PT).toContain("['Trilhos de Produção/live', 'not_available']");
    expect(EN).toContain("['Refunds (developer key)', 'pending_e2e']");
    expect(EN).toContain("['Webhook outbound delivery', 'simulated']");
    expect(EN).toContain("['Production/live rails', 'not_available']");
  });
  it('evidence caveats present in both languages', () => {
    expect(PT.replace(/\s+/g, ' ')).toContain('Passar os testes de documentação não ativa trilhos de pagamento');
    expect(EN.replace(/\s+/g, ' ')).toContain('Passing documentation tests does not activate payment rails');
  });
});

describe('P2E — public trust artifacts', () => {
  it('all six JSON artifacts carry the full conservative flag set', () => {
    for (const { file, data } of JSON_ARTIFACTS) {
      expect(data.scope, file).toBe('sandbox_preview');
      expect(data.production_contract, file).toBe(false);
      expect(data.regulatory_approval, file).toBe(false);
      expect(data.live_rails, file).toBe(false);
      expect(data.real_money, file).toBe(false);
      expect(data.public_sdk_packages_published, file).toBe(false);
      expect(data.self_service_access, file).toBe(false);
    }
    for (const f of ['scope: sandbox_preview', 'production_contract: false', 'regulatory_approval: false', 'live_rails: false', 'real_money: false', 'public_sdk_packages_published: false', 'self_service_access: false']) {
      expect(SUMMARY_MD.includes(f), `summary missing flag: ${f}`).toBe(true);
    }
  });
  it('structures are complete (15 capabilities, 12 risks, 10 gates, 9 evidence items, 5 package caveats)', () => {
    const byName = Object.fromEntries(JSON_ARTIFACTS.map((a) => [a.file, a.data]));
    expect(byName['developer-trust-summary.json'].availability_summary).toHaveLength(15);
    expect(byName['risk-limitations-matrix.json'].rows).toHaveLength(12);
    expect(byName['decision-gates.json'].gates).toHaveLength(10);
    expect(byName['sandbox-evidence-map.json'].evidence.length).toBeGreaterThanOrEqual(9);
    expect(byName['partner-readiness-package.json'].caveats.pt).toHaveLength(5);
    expect(byName['partner-readiness-package.json'].caveats.en).toHaveLength(5);
    for (const g of byName['decision-gates.json'].gates) {
      for (const k of ['purpose', 'required_evidence', 'pass_condition', 'does_not_authorize']) {
        expect(g[k].pt.length).toBeGreaterThan(3);
        expect(g[k].en.length).toBeGreaterThan(3);
      }
    }
  });
  it('the manifest includes all seven trust artifacts with the required entry shape', () => {
    const tr = MANIFEST.artifacts.filter((a: { role?: string }) => a.role === 'trust_readiness');
    expect(tr).toHaveLength(7);
    for (const a of tr) {
      expect(a.scope).toBe('sandbox_preview');
      expect(a.production_contract).toBe(false);
      expect(a.recommended_integration_path).toBe(false);
    }
  });
  it('no artifact leaks private emails, URLs, IPs, hostnames, paths, logs, DB URLs, tokens or PII', () => {
    const all = [...JSON_ARTIFACTS.map((a) => JSON.stringify(a.data)), SUMMARY_MD].join('\n');
    expect(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(all)).toBe(false);
    expect(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/.test(all)).toBe(false);
    expect(all.includes('/srv/')).toBe(false);
    expect(/postgres:\/\/|redis:\/\//.test(all)).toBe(false);
    expect(/eyJ[A-Za-z0-9_-]{10,}/.test(all)).toBe(false);
    expect(/bz_(test|live)_(pk|sk)_(?!X{2,})[A-Za-z0-9]{8,}/.test(all)).toBe(false);
  });
  it('no certification/audit/uptime/SLA overclaim anywhere in the package', () => {
    const all = [...JSON_ARTIFACTS.map((a) => JSON.stringify(a.data)), SUMMARY_MD, PT, EN].join('\n');
    for (const bad of ['SOC 2', 'SOC2', 'ISO 27001', 'ISO27001', 'PCI DSS', 'PCI-DSS', 'penetration test', 'pentest', 'certified uptime', '99.9', 'SLA de', 'guaranteed uptime']) {
      expect(all.toLowerCase().includes(bad.toLowerCase()), `overclaim token found: ${bad}`).toBe(false);
    }
  });
});

describe('P2E — previous honesty preserved', () => {
  it('SDK-first, no fake installs, HTTP secondary, PT/EN only', () => {
    expect(PT).toContain('camada de referência técnica do protocolo');
    expect(EN).toContain('technical protocol reference layer');
    for (const cmd of ['pip install banzami', 'composer require banzami/sdk', 'pub add banzami']) {
      expect((PT + EN).includes(cmd)).toBe(false);
    }
    const dirs = readdirSync(join(REPO, 'apps/website/app/developers/docs'), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort();
    // P3A: area routes are directories too — the LOCALE rule is that 'en' is the
    // only locale dir and no other-language dir exists.
    expect(dirs).toContain('en');
    expect(dirs.filter((d) => /^(fr|es|de|it|zh|ru|pt)$/.test(d))).toEqual([]);
  });
  it('pending-E2E, simulated, demo Console, Stage C not approved persist', () => {
    expect(PT).toContain('Pendente E2E');
    expect(EN).toContain('Pending E2E');
    expect(EN).toContain('simulated');
    expect(EN).toContain('demo previews, not operational');
    expect(PT).toContain('Stage C não implementado/não aprovado');
    expect(EN).toContain('Stage C not implemented/approved');
    expect((PT + EN).toLowerCase().includes('production ready')).toBe(false);
    expect((PT + EN).toLowerCase().includes('sign up now')).toBe(false);
  });
});
