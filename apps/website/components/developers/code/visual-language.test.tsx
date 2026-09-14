// @vitest-environment jsdom
//
// DOCS-VISUAL-DX-002 — the Developer Platform's visual language, held.
//
// What a reader sees must stay derived from the contract and exact about the
// code: every method the OpenAPI uses has a colour, every endpoint shows its
// real verb and path and its OpenAPI status, every code block on every page is
// highlighted without changing a character, and Copy writes the source.
import { readFileSync } from 'node:fs';
import type { ComponentType } from 'react';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, within } from '@testing-library/react';
import { METHOD_SWATCH, isHttpMethod } from '../api/http';
import { CodeTabs, CodeView } from './CodeView';
import { HIGHLIGHTED_LANGS, highlight, langFromLabel, type CodeLang } from './highlight';
import { ENDPOINTS, ResourceReference } from '@/app/developers/docs/reference';
import openapiStatuses from '@/app/developers/docs/openapi-statuses.json';
import { statusesFrom } from '../../../../../tools/docs/build-openapi-statuses.mjs';

const ROOT = process.cwd();
const SPEC = JSON.parse(readFileSync(join(ROOT, 'public/developers/openapi/banzami-sandbox.openapi.json'), 'utf8'));
const HTTP_VERBS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];

beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} });
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('HTTP methods and statuses come from the OpenAPI', () => {
  it('OPENAPI_HTTP_METHODS_WITH_VISUAL_MAPPING: every method the OpenAPI uses has a swatch', () => {
    const used = new Set<string>();
    for (const ops of Object.values(SPEC.paths) as Record<string, unknown>[]) for (const m of Object.keys(ops)) if (HTTP_VERBS.includes(m)) used.add(m.toUpperCase());
    expect(used.size).toBeGreaterThan(0);
    const unmapped = [...used].filter((m) => !isHttpMethod(m) || !METHOD_SWATCH[m]);
    expect(unmapped).toEqual([]);
  });

  it('no two methods share a colour', () => {
    const verbs = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;
    expect(new Set(verbs.map((v) => METHOD_SWATCH[v].fg)).size).toBe(verbs.length);
  });

  it('openapi-statuses.json is what the OpenAPI says today', () => {
    expect(openapiStatuses).toEqual(statusesFrom(SPEC));
  });

  it('REFERENCE_HTTP_METHOD_OPENAPI_DRIFT=0: every documented endpoint is an OpenAPI operation with a success status', () => {
    const drift = ENDPOINTS.filter((e) => !((openapiStatuses as Record<string, number[]>)[`${e.method} ${e.path}`]?.length));
    expect(drift.map((e) => `${e.method} ${e.path}`)).toEqual([]);
  });
});

describe('API_REFERENCE_ENDPOINTS_WITH_NEW_METHOD_UI = 100%', () => {
  for (const lang of ['pt', 'en'] as const) {
    it(`${lang}: every endpoint shows its verb, its path and its OpenAPI status`, () => {
      const { container } = render(<ResourceReference lang={lang} onCopy={() => {}} />);
      const wrong: string[] = [];
      for (const e of ENDPOINTS) {
        const article = container.querySelector(`[id="${e.id}"]`);
        const heading = article?.querySelector('[data-endpoint-heading]');
        const verb = heading?.querySelector('[data-http-method]');
        const path = heading?.querySelector('[data-api-path]');
        if (verb?.textContent !== e.method || verb.getAttribute('data-http-method') !== e.method) wrong.push(`${e.id}: method`);
        if (path?.textContent !== e.path) wrong.push(`${e.id}: path`);
        if (e.response) {
          const ok = (openapiStatuses as Record<string, number[]>)[`${e.method} ${e.path}`];
          const shown = Number(article?.querySelector('[data-http-status]')?.getAttribute('data-http-status'));
          if (!ok.includes(shown)) wrong.push(`${e.id}: status ${shown} not in ${ok}`);
        }
        if (!heading?.parentElement?.querySelector('[data-environment-badge]')) wrong.push(`${e.id}: environment badge`);
      }
      expect(wrong).toEqual([]);
    });
  }
});

// Every docs page, both languages.
const PAGES = (import.meta as unknown as { glob: (p: string, o: { eager: true }) => Record<string, unknown> }).glob('/app/developers/docs/**/page.tsx', { eager: true }) as Record<string, { default: ComponentType }>;
const pageEntries = Object.entries(PAGES).filter(([p]) => !p.includes('node_modules'));
const SECRET = /\bbz_(?:test|live)_(?:sk|pk)_(?!X{8,})[A-Za-z0-9]{8,}/;
// Blocks that are deliberately not highlighted: they are not a programming language.
const PLAIN_ALLOWED = new Set(['Texto · prefixos das chaves de teste', 'Texto · test key prefixes']);

describe('DOCS_CODE_LANGUAGES_HIGHLIGHTED = 100%, losslessly, on every page', () => {
  it('finds the pages', () => { expect(pageEntries.length).toBeGreaterThan(40); });

  const perPage: Record<string, number> = {};
  for (const [path, mod] of pageEntries) {
    it(path.replace('/app/developers/docs', '') || '/', () => {
      const { container } = render(<mod.default />);
      const blocks = [...container.querySelectorAll<HTMLElement>('[data-code-block]')];
      perPage[path] = blocks.length;
      for (const b of blocks) {
        const lang = b.getAttribute('data-lang') as CodeLang;
        const pre = b.querySelector('pre')!;
        const label = pre.getAttribute('aria-label') ?? '';
        expect(String(pre.textContent?.length), `${label}: rendered text differs from the source`).toBe(b.getAttribute('data-raw-length'));
        if (lang === 'text') expect(PLAIN_ALLOWED.has(label), `${label}: plain code block not allowlisted`).toBe(true);
        else expect(pre.querySelector('[data-token]'), `${label}: no syntax tokens`).not.toBeNull();
        expect(SECRET.test(pre.textContent ?? ''), `${label}: credential-shaped value`).toBe(false);
      }
      cleanup();
    });
  }

  it('PT and EN pages carry the same number of code blocks', () => {
    const drift = Object.keys(perPage).filter((p) => !p.includes('/en/')).flatMap((pt) => {
      const en = pt.replace('/app/developers/docs/', '/app/developers/docs/en/');
      return en in perPage && perPage[en] !== perPage[pt] ? [`${pt}: ${perPage[pt]} vs ${perPage[en]}`] : [];
    });
    expect(drift).toEqual([]);
    expect(Object.values(perPage).reduce((a, b) => a + b, 0)).toBeGreaterThan(50);
  });
});

describe('the highlighter never changes the code', () => {
  const sources = ['content-pt.tsx', 'content-en.tsx', 'reference.tsx', 'events.ts'].map((f) => readFileSync(join(ROOT, 'app/developers/docs', f), 'utf8'));
  const samples = sources.flatMap((s) => [...s.matchAll(/`((?:\\`|[^`])*)`/g)].map((m) => m[1])).filter((x) => x.includes('\n'));
  it('collects the corpus', () => { expect(samples.length).toBeGreaterThan(40); });
  it('every docs template literal round-trips through every highlighted language', () => {
    const broken: string[] = [];
    for (const src of samples) for (const lang of HIGHLIGHTED_LANGS) if (highlight(src, lang).map((t) => t.v).join('') !== src) broken.push(`${lang}: ${src.slice(0, 40)}`);
    expect(broken).toEqual([]);
  });
  it('labels map to their language', () => {
    expect(['curl · x', 'ts · x', 'TypeScript · x', 'json · x', 'bash · x', 'http · x'].map(langFromLabel)).toEqual(['curl', 'ts', 'ts', 'json', 'shell', 'http']);
  });
  it('a cURL request is classified, not just coloured', () => {
    const t = highlight('curl -X POST https://sandbox-api.banzami.com/v1/me \\\n  -H "Authorization: Bearer $BANZAMI_SECRET_KEY"', 'curl');
    const of = (type: string) => t.filter((x) => x.t === type).map((x) => x.v);
    expect(of('method')).toContain('POST');
    expect(of('url')).toContain('https://sandbox-api.banzami.com/v1/me');
    expect(of('header')).toContain('Authorization');
    expect(of('variable')).toContain('$BANZAMI_SECRET_KEY');
  });
});

describe('Copy', () => {
  const RAW = 'curl https://sandbox-api.banzami.com/v1/me \\\n  -H "Idempotency-Key: idem_1"';
  it('writes the raw source exactly, and announces it', async () => {
    const writeText = vi.fn((_: string) => Promise.resolve());
    Object.assign(navigator, { clipboard: { writeText } });
    const { container } = render(<CodeView raw={RAW} lang="curl" context="GET /v1/me" />);
    const btn = within(container).getByRole('button');
    expect(btn.getAttribute('aria-label')).toBe('Copiar: cURL · GET /v1/me');
    await act(async () => { fireEvent.click(btn); });
    expect(writeText).toHaveBeenCalledWith(RAW);
    expect(container.querySelector('[role="status"]')?.textContent).toBe('Código copiado para a área de transferência');
    expect(btn.textContent).toContain('Copiado');
  });
  it('an Idempotency-Key header is a focus line', () => {
    const { container } = render(<CodeView raw={RAW} lang="curl" />);
    expect(container.querySelectorAll('[data-line-mark="focus"]').length).toBe(1);
  });
});

describe('language tabs', () => {
  it('are a keyboard tablist whose hidden panel is inert, and Copy follows the active tab', async () => {
    const writeText = vi.fn((_: string) => Promise.resolve());
    Object.assign(navigator, { clipboard: { writeText } });
    const { container } = render(<CodeTabs items={[{ lang: 'ts', raw: 'const a = 1;' }, { lang: 'curl', raw: 'curl https://x' }]} />);
    const tabs = within(container).getAllByRole('tab');
    expect(tabs.map((t) => t.getAttribute('aria-selected'))).toEqual(['true', 'false']);
    fireEvent.keyDown(tabs[0], { key: 'ArrowRight' });
    expect(tabs.map((t) => t.getAttribute('aria-selected'))).toEqual(['false', 'true']);
    const panels = container.querySelectorAll('[role="tabpanel"]');
    expect(panels[0].getAttribute('aria-hidden')).toBe('true');
    await act(async () => { fireEvent.click(within(container).getByRole('button', { name: /Copiar/ })); });
    expect(writeText).toHaveBeenCalledWith('curl https://x');
  });
});
