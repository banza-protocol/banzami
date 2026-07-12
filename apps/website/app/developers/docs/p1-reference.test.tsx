// @vitest-environment jsdom
//
// P1 reference-guides guards (docs/developer/DOCUMENTATION_AUDIT.md — P1 scope).
// Locks in:
//   - PT/EN-only language rule (PT default at /docs, EN at /docs/en, nothing else);
//   - key P1 sections exist in BOTH PT and EN (resource reference, sandbox
//     testing guide, auth/keys guide, idempotency, error envelope, webhook
//     redelivery contract, categorised changelog);
//   - curl-first examples exist in both languages;
//   - claim safety holds in EN exactly as in PT (no fake installs, no invented
//     endpoints/events, refunds/transfers pending-E2E, webhooks simulated,
//     no production/live claims, Console demo/non-operational).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import DocsPage from './page';
import DocsPageEn from './en/page';
import PtTestingPage from './testing/page';
import PtReferencePage from './reference/page';
import EnTestingPage from './en/testing/page';
import EnReferencePage from './en/reference/page';
import EnSdkPage from './en/sdk/page';
import EnGuidesPage from './en/guides/page';
import EnGetStartedPage from './en/get-started/page';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
// P3A: PT/EN corpora = area content + landing pages.
const PT = read('app/developers/docs/content-pt.tsx') + read('app/developers/docs/page.tsx');
const EN = read('app/developers/docs/content-en.tsx') + read('app/developers/docs/en/page.tsx');
const REF = read('app/developers/docs/reference.tsx');

beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', class {
    observe() {} unobserve() {} disconnect() {}
  });
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('P1 — PT/EN-only language rule', () => {
  it("the docs directory's only locale subdirectory is en (area routes are not locales)", () => {
    const entries = readdirSync(join(process.cwd(), 'app/developers/docs'), { withFileTypes: true });
    const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
    expect(dirs).toContain('en');
    expect(dirs.filter((d) => /^(fr|es|de|it|zh|ru|pt)$/.test(d))).toEqual([]);
  });
  it('no other-language routes or lang markers exist (fr/es/de…)', () => {
    for (const src of [PT, EN, REF]) {
      expect(/\/docs\/(fr|es|de|it|zh|ru)\b/.test(src)).toBe(false);
      expect(/lang="(fr|es|de|it)"/.test(src)).toBe(false);
    }
  });
  it('PT and EN link to each other via the shared shell language switch', () => {
    const SHELL = read('app/developers/docs/shell.tsx');
    expect(SHELL).toContain("areaHref('en', active)");
    expect(SHELL).toContain("areaHref('pt', active)");
  });
});

describe('P1 — key sections exist in BOTH PT and EN', () => {
  it('PT renders the P1 sections (on their new area routes)', () => {
    render(<PtTestingPage />);
    expect(screen.getAllByText('Testar no Sandbox').length).toBeGreaterThan(0);
    cleanup();
    render(<PtReferencePage />);
    expect(screen.getAllByText('Referência por recurso').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Autenticação e gestão de chaves/).length).toBeGreaterThan(0);
  });
  it('EN renders the P1 sections (on their new area routes)', () => {
    render(<EnTestingPage />);
    expect(screen.getAllByText('Testing in the Sandbox').length).toBeGreaterThan(0);
    cleanup();
    render(<EnReferencePage />);
    expect(screen.getAllByText('Resource reference').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Credentials and capabilities').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Authentication and key management/).length).toBeGreaterThan(0);
    cleanup();
    render(<EnGuidesPage />);
    expect(screen.getAllByText('Redelivery contract').length).toBeGreaterThan(0);
    cleanup();
    render(<EnGetStartedPage />);
    expect(screen.getAllByText('Current status of this documentation').length).toBeGreaterThan(0);
  });
  it('the shared resource reference is bilingual and rendered by both pages', () => {
    expect(PT).toContain('<ResourceReference lang="pt"');
    expect(EN).toContain('<ResourceReference lang="en"');
    // Every endpoint spec carries both languages.
    expect((REF.match(/pt: '/g) ?? []).length).toBeGreaterThan(10);
    expect((REF.match(/en: '/g) ?? []).length).toBeGreaterThan(10);
  });
  it('webhook envelope, error envelope, idempotency and changelog categories exist in both', () => {
    for (const src of [PT, EN]) {
      expect(src).toContain('"request_id"');
      expect(src).toContain('Idempotency-Key: idem_');
      expect(src).toContain('"type": "payment_session.paid"'); // implemented envelope example
      expect(src).toContain('[Breaking]');
    }
  });
  it('curl-first examples exist in both languages', () => {
    expect(PT).toContain('curl https://sandbox-api.banzami.com/v1/me');
    expect(EN).toContain('curl https://sandbox-api.banzami.com/v1/me');
  });
});

describe('P1 — claim safety holds in EN and the shared reference', () => {
  const FORBIDDEN_EVENTS = ['payment.created', 'payment.confirmed', 'payment.failed', 'payment.refunded', 'wallet.credit', 'wallet.debit', 'transfer.completed'];
  const FAKE_INSTALLS = ['npm install @banzami', 'pip install banzami', 'composer require banzami', 'pub add banzami', 'pod "Banzami"', 'com.banzami:sdk'];

  it('no invented endpoints or unverified events in EN or the shared reference', () => {
    for (const src of [EN, REF]) {
      const code = src.split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n');
      expect(code.includes('/v1/payments')).toBe(false);
      for (const ev of FORBIDDEN_EVENTS) expect(code.includes(ev), `must not contain ${ev}`).toBe(false);
    }
  });
  it('no fake SDK install commands in EN (the PT anti-instruction pattern is kept)', () => {
    for (const cmd of FAKE_INSTALLS) {
      // EN may NAME the forbidden command only inside its own "Do not run" anti-instruction.
      const occurrences = EN.split(cmd).length - 1;
      if (cmd === 'npm install @banzami') {
        expect(occurrences).toBeLessThanOrEqual(1);
        if (occurrences === 1) expect(EN).toContain('Do not run');
      } else {
        expect(occurrences, `EN must not contain "${cmd}"`).toBe(0);
      }
    }
    expect(EN).toContain('not yet published');
  });
  it('refunds/transfers stay pending-E2E for developer keys in EN', () => {
    expect(EN).toContain('Pending E2E for developer keys');
    expect(EN).toContain('refunds:write');
  });
  it('webhooks outbound stays simulated / not claimed publicly active in EN', () => {
    expect(EN).toContain('simulated');
    expect(EN).toContain('We do not claim webhook delivery as public Production');
  });
  it('no production/live/real-money availability claims in EN', () => {
    for (const bad of ['Production is available', 'live payments are available', 'real money is enabled', 'production ready', 'BNA approved']) {
      expect(EN.toLowerCase().includes(bad.toLowerCase()), `EN must not claim "${bad}"`).toBe(false);
    }
    expect(EN).toContain('Production and real-money rails are not available');
    expect(EN).toContain('demo previews, not operational');
  });
  it('placeholder keys only in EN and the shared reference', () => {
    for (const src of [EN, REF]) {
      expect(/bz_(test|live)_(pk|sk)_(?!X{4,})[A-Za-z0-9]{8,}/.test(src)).toBe(false);
    }
  });
});
