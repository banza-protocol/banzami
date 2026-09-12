/**
 * A revealed API key secret must be unrecoverable the moment the dialog closes.
 *
 * "Shown once" is a claim about the whole system, not about one component. The
 * dialog can be perfectly correct and the guarantee still be false if anything
 * downstream keeps a copy — web storage, a cookie, a query string, an analytics
 * payload, or a second endpoint that hands the secret back. A behavioural test
 * cannot prove absence; it can only show that the paths it happened to exercise
 * stayed clean. So this reads the Console's own source and the developer-api
 * routes, and asserts the sinks do not exist at all.
 *
 * The two facts this pins:
 *   1. the Console never writes key material anywhere it could be read back;
 *   2. the server has no route that returns a stored secret — it stores only
 *      HMAC-SHA-256 of the key, so it could not return one even if asked.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd(); // apps/website
const DEV_API = join(ROOT, '../../services/developer-api/internal/developer');

const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

/**
 * Source with comments blanked and line numbers preserved.
 *
 * Every scan below is about what the code *does*, and this file is full of
 * prose about what it deliberately does not: DeveloperAuth.tsx says it keeps
 * the CSRF token "never in localStorage/sessionStorage", which a naive grep
 * reads as a use of both. `://` is left alone so a URL is not mistaken for the
 * start of a comment and the rest of its line silently dropped from the scan.
 */
function code(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (_m, keep: string) => keep);
}

/** Every .ts/.tsx file of the Console — the whole surface a secret could leak from. */
function consoleSources(): { path: string; src: string }[] {
  const roots = ['app/developers', 'components/developers', 'lib'];
  const out: { path: string; src: string }[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(join(ROOT, dir))) {
      const rel = `${dir}/${entry}`;
      if (statSync(join(ROOT, rel)).isDirectory()) {
        walk(rel);
        continue;
      }
      if (!/\.tsx?$/.test(entry) || /\.test\.tsx?$/.test(entry)) continue;
      out.push({ path: rel, src: code(readFileSync(join(ROOT, rel), 'utf8')) });
    }
  };
  roots.forEach(walk);
  return out;
}

const SOURCES = consoleSources();

// The identifiers the raw secret actually travels under. `k.secret` /
// `rotated.secret` off the API response, and the transient state it lands in.
const SECRET_BEARING = /\b(revealSecret|setRevealSecret|\.secret\b|\bsecret\b)/;

describe('a revealed key secret cannot be recovered — Console side', () => {
  it('reads the files it claims to check', () => {
    // Guards against the walk silently matching nothing and every assertion
    // below passing over an empty list.
    expect(SOURCES.length).toBeGreaterThan(20);
    expect(SOURCES.map((f) => f.path)).toContain('components/developers/portal/ApiKeysManager.tsx');
  });

  it('the key screens touch no web storage at all', () => {
    // Not "store nothing sensitive" — touch none of it. There is no legitimate
    // reason for the key screens to read or write storage, so any appearance is
    // the defect, not the value written.
    for (const path of [
      'components/developers/portal/ApiKeysManager.tsx',
      'components/developers/portal/ScopeDrawer.tsx',
      'app/developers/api-keys/page.tsx',
    ]) {
      const src = code(read(path));
      for (const sink of ['localStorage', 'sessionStorage', 'document.cookie', 'indexedDB', 'caches.']) {
        expect(src, `${path} touches ${sink}`).not.toContain(sink);
      }
    }
  });

  it('no line of the Console puts anything secret-bearing into a storage sink', () => {
    const sinks = /(localStorage|sessionStorage|document\.cookie|indexedDB|caches\.open|navigator\.sendBeacon)/;
    for (const { path, src } of SOURCES) {
      src.split('\n').forEach((line, i) => {
        if (!sinks.test(line)) return;
        expect(
          SECRET_BEARING.test(line),
          `${path}:${i + 1} writes something secret-bearing to storage — ${line.trim()}`,
        ).toBe(false);
      });
    }
  });

  it('web storage is used only for the two opaque UI preferences', () => {
    // The single module allowed to touch storage, and the only keys it writes:
    // which workspace and project the console reopens on. Both are opaque ids.
    // An ACCESS, not the word. The security guide tells developers never to put a
    // key in localStorage, and naming the thing you are forbidding is not using
    // it — matching the bare word made the documentation look like a storage
    // writer.
    const writers = SOURCES
      .filter((f) => /\b(?:window\.)?(?:localStorage|sessionStorage)\s*[.[]/.test(f.src))
      .map((f) => f.path);
    expect(writers).toEqual(['lib/developer-prefs.ts']);
    const prefs = code(read('lib/developer-prefs.ts'));
    expect(prefs).toContain("const WS_KEY = 'bz_dev_active_ws'");
    expect(prefs).toContain('bz_dev_active_prj_');
    expect(prefs).not.toMatch(/secret|api[_-]?key|token/i);
  });

  it('no secret ever reaches a URL', () => {
    // A query string or path segment is read by the browser history, the
    // referrer header and every proxy in between — a one-time reveal put there
    // is permanent.
    const nav = /(router\.(push|replace)|location\.(href|assign|replace)|URLSearchParams|window\.open|<Link)/;
    for (const { path, src } of SOURCES) {
      src.split('\n').forEach((line, i) => {
        if (!nav.test(line)) return;
        expect(
          /revealSecret|\.secret\b/.test(line),
          `${path}:${i + 1} routes with something secret-bearing — ${line.trim()}`,
        ).toBe(false);
      });
      expect(src, `${path} builds a URL carrying a secret`).not.toMatch(/[?&]secret=/);
    }
  });

  it('the Console ships no analytics client for a secret to reach', () => {
    // The strongest form of "not sent to analytics": there is no analytics
    // dependency and no analytics global in the tree.
    const pkg = JSON.parse(read('package.json')) as { dependencies: Record<string, string> };
    expect(Object.keys(pkg.dependencies).sort()).toEqual(['next', 'react', 'react-dom']);
    for (const { path, src } of SOURCES) {
      for (const client of ['gtag(', 'dataLayer', 'posthog', 'mixpanel', 'Sentry.', 'datadog', 'plausible(', 'analytics.track']) {
        expect(src, `${path} calls ${client}`).not.toContain(client);
      }
    }
  });

  it('the revealed secret lives in transient React state and is dropped on navigation', () => {
    const src = read('components/developers/portal/ApiKeysManager.tsx');
    // Held in state, never in a ref/module/global that would outlive the view.
    expect(src).toContain("const [revealSecret, setRevealSecret] = useState<string | null>(null)");
    // Cleared when the project changes or the subtree unmounts (route change /
    // logout), so the value cannot survive into another screen.
    expect(src).toContain('return () => setRevealSecret(null);');
    // And it only ever comes from the one-time create/rotate response.
    const assignments = [...src.matchAll(/setRevealSecret\(([^)]*)\)/g)].map((m) => m[1]);
    expect(assignments.sort()).toEqual(['k.secret', 'null', 'null', 'rotated.secret']);
  });

  it('the list rendering can only show the published prefix, never the secret', () => {
    const src = read('components/developers/portal/ApiKeysManager.tsx');
    // What the row renders and what the copy button copies both derive from
    // `prefix` / `public_value` — the two fields the list response carries.
    expect(src).toContain('return `${k.prefix}${SECRET_MASK}`;');
    expect(src).toContain("return k.kind === 'PUBLISHABLE' ? k.public_value || k.prefix : k.prefix;");
    // The list type has no secret field to render even by accident.
    const api = read('lib/developer-api.ts');
    const from = api.indexOf('export type ApiKey = {');
    const apiKeyType = api.slice(from, api.indexOf('\n};', from));
    expect(apiKeyType).not.toContain('secret');
  });

  it('only the two one-time POSTs can return a secret', () => {
    // NewKey is the only type carrying `secret`, and it is only ever the
    // response of a POST — there is no GET that could hand it back.
    const api = read('lib/developer-api.ts');
    for (const m of api.matchAll(/req<NewKey>\(([^\n]*)/g)) {
      expect(m[1], `a NewKey response is fetched without POST: ${m[1]}`).toContain("method: 'POST'");
    }
    expect(api).toContain("export type NewKey = ApiKey & { secret?: string };");
  });
});

describe('a revealed key secret cannot be recovered — server side', () => {
  const handlers = readFileSync(join(DEV_API, 'handlers.go'), 'utf8');

  it('the key view the server renders carries no secret and no hash', () => {
    const view = handlers.slice(handlers.indexOf('func keyView(k APIKey)'), handlers.indexOf('func keyViews'));
    expect(view).not.toMatch(/secret|key_hash|KeyHash/i);
  });

  it('no route returns a stored secret — only creation and rotation reveal, once', () => {
    // Every place the wire word "secret" is produced by a handler. If a reveal
    // endpoint were ever added, it would have to appear here.
    const revealingHandlers = handlers
      .split('\n')
      .filter((l) => /resp\["secret"\]/.test(l)).length;
    expect(revealingHandlers).toBe(4); // createKey, rotateKey, and the two createFixtureKey branches

    // And none of them sits behind a GET: a GET is what a reveal endpoint would
    // be, and is the shape a browser can be made to issue by accident.
    const routes = handlers.split('\n').filter((l) => /r\.Get\(/.test(l) && /key/i.test(l));
    expect(routes.map((l) => l.trim())).toEqual(['r.Get("/projects/{projID}/keys", h.listKeys)']);
  });

  it('the server keeps only an HMAC of the key, so it has no secret to return', () => {
    const crypto = readFileSync(join(DEV_API, 'crypto.go'), 'utf8');
    expect(crypto).toContain('func hashKey(raw, pepper string) string { return hashToken(raw, pepper) }');
    // The display prefix is the first 8 characters of the body — the key's
    // published identity, and the only part of a secret key that is ever
    // readable after creation.
    expect(crypto).toContain('displayPrefix = p + body[:8]');
  });
});
