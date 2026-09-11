/**
 * assurance-manifest-lib.mjs
 *
 * Shared parser for quality/operator-assurance-manifest.yaml.
 *
 * The manifest deliberately uses a strict, flat subset of YAML (2-space
 * indent, no anchors/aliases/flow-collections except none) so it can be
 * parsed without external dependencies. If the file drifts outside this
 * subset the parser throws — that is intentional: the manifest is a
 * governed artifact, not free-form YAML.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

export const MANIFEST_PATH = 'quality/operator-assurance-manifest.yaml';

export const VALID_STATUS = ['verified', 'in-audit', 'blocked', 'deprecated', 'removed'];
export const VALID_AUTHORITY = ['protocol', 'operator-extension', 'internal'];
export const VALID_PUBLIC_STATUS = ['public-sandbox', 'public-live', 'internal', 'preview-disabled', 'not-exposed'];
export const VALID_DISPOSITION = ['active-required', 'active-needs-remediation', 'legacy-compat-justified', 'obsolete-candidate', 'removed'];
export const VALID_GATE = ['sandbox-e2e-required', 'integration-required', 'static-only', 'none-docs-only'];

// External-Sandbox surface: is this capability reachable by / claimed to
// external sandbox users (public), reachable only via server-side authorized
// internal callers (internal), or not exposed at all (none)?
export const VALID_SURFACE = ['public', 'internal', 'none'];

// Definitive external-Sandbox disposition (one per capability):
//   released      — deployed-E2E verified AND publicly documented
//   quarantined   — intentionally unreachable externally + absent from public docs/SDK
//   removed       — code/routes/build/docs/tests/config removed
//   internal_only — no public route/SDK/doc claim; server-side authz + tested
//   pending-e2e   — public + reachable but NOT yet deployed-E2E verified (HOLD)
//   blocked-external — code-ready + verified, HELD only on an external decision
//                    (e.g. registry ownership) that no in-repo work can resolve
export const VALID_EXT_DISPOSITION = ['released', 'quarantined', 'removed', 'internal_only', 'pending-e2e', 'blocked-external'];

const LIST_FIELDS = ['implementation', 'api_surface', 'evidence'];
const TEST_KINDS = ['unit', 'integration', 'e2e_sandbox', 'negative_security'];

export function parseManifest(root) {
  const raw = readFileSync(join(root, MANIFEST_PATH), 'utf-8');
  const lines = raw.split('\n');
  const capabilities = [];
  let meta = {};
  let cap = null;
  let listField = null;   // current list being filled: 'implementation' | ... or tests.<kind>
  let inTests = false;
  let inEnv = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*#/.test(line) || line.trim() === '') continue;

    const indent = line.length - line.trimStart().length;
    const t = line.trim();

    if (indent === 0) {
      const m = t.match(/^([A-Za-z_]+):\s*(.*)$/);
      if (m && m[1] !== 'capabilities') meta[m[1]] = m[2];
      continue;
    }

    // New capability entry
    if (/^-\s+id:\s*/.test(t) && indent === 2) {
      cap = { _line: i + 1, tests: {}, environments: {} };
      TEST_KINDS.forEach(k => (cap.tests[k] = []));
      LIST_FIELDS.forEach(k => (cap[k] = []));
      cap.id = t.replace(/^-\s+id:\s*/, '').trim();
      capabilities.push(cap);
      listField = null; inTests = false; inEnv = false;
      continue;
    }
    if (!cap) continue;

    // List items ("- value")
    if (/^-\s+/.test(t)) {
      const val = t.replace(/^-\s+/, '').trim();
      if (listField) {
        if (inTests) cap.tests[listField].push(val);
        else cap[listField].push(val);
      }
      continue;
    }

    const kv = t.match(/^([a-z0-9_]+):\s*(.*)$/);
    if (!kv) throw new Error(`Manifest parse error at line ${i + 1}: "${t}"`);
    const [, key, valRaw] = kv;
    const val = valRaw.replace(/\s+#.*$/, '').trim();

    if (key === 'tests') { inTests = true; inEnv = false; listField = null; continue; }
    if (key === 'environments') { inEnv = true; inTests = false; listField = null; continue; }

    if (inTests && TEST_KINDS.includes(key)) {
      listField = key;
      if (val && val !== '' && val !== '[]') {
        // inline list: [a, b]
        const items = val.replace(/^\[|\]$/g, '').split(',').map(s => s.trim()).filter(Boolean);
        cap.tests[key].push(...items);
        listField = null;
      } else if (val === '[]') {
        listField = null;
      }
      continue;
    }
    if (inEnv && (key === 'sandbox' || key === 'live')) {
      cap.environments[key] = val === 'true';
      continue;
    }

    inTests = false; inEnv = false;
    if (LIST_FIELDS.includes(key)) {
      listField = key;
      if (val === '[]') listField = null;
      continue;
    }
    listField = null;

    // multi-line folded strings (>) — consume continuation lines
    if (val === '>' || val === '>-' || val === '|') {
      let folded = [];
      while (i + 1 < lines.length) {
        const next = lines[i + 1];
        const nIndent = next.length - next.trimStart().length;
        if (next.trim() === '' || nIndent > indent) { folded.push(next.trim()); i++; }
        else break;
      }
      cap[key] = folded.join(' ');
      continue;
    }
    cap[key] = val;
  }

  return { meta, capabilities };
}

// ---------------------------------------------------------------------------
// api_surface ↔ router comparison
// ---------------------------------------------------------------------------

// The two public HTTP surfaces. They are different products: the gateway serves
// the merchant/developer API; public-api serves the Consumer app (behind
// /consumer/ at the edge). A declared route is checked against the gateway
// unless the entry names public-api — a route mounted only on the Consumer
// surface is not a developer-API surface, and merging the two routers let the
// registry claim `/v1/transfers` for the gateway, where SEC-015 unmounted it.
export const PUBLIC_ROUTERS = {
  gateway: 'services/api-gateway/internal/server/server.go',
  'public-api': 'services/public-api/internal/server/server.go',
};

const HTTP_VERBS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const normRoute = p => p.replace(/\{[^}]+\}/g, '{p}').replace(/(.)\/$/, '$1');

// Parse chi registrations from a router source file into [{ method, path }].
// Path parameters are normalised to {p}.
export function parseMountedRoutes(src) {
  const routes = [];
  const stack = [];
  let depth = 0;
  for (const line of src.split('\n')) {
    const route = line.match(/\.Route\("([^"]+)"/);
    // Any receiver, not just a bare `r.`: registrations are frequently chained
    // through middleware (`r.With(cap(...)).Get("/v1/...")`), and anchoring on
    // `r.` silently skipped exactly those — including a mounted proof route.
    // A chained registration may also BEGIN a line, with the dot left on the
    // previous one (`r.With(...).` then `Get("/v1/...")`).
    const verb = line.match(/(?:^\s*|\.)(Get|Post|Put|Patch|Delete)\("([^"]+)"/);
    if (verb) {
      // A registration may carry the full path already, or be relative to the
      // enclosing r.Route prefix. Absolute wins; prefixing it would invent
      // `/v1/v1/...` and make a mounted route look absent.
      const raw = verb[2];
      const p = raw.startsWith('/v1') ? raw
        : stack.map(s => s.prefix).join('') + (raw === '/' ? '' : raw);
      routes.push({ method: verb[1].toUpperCase(), path: normRoute(p) });
    }
    const opens = (line.match(/\{/g) ?? []).length;
    const closes = (line.match(/\}/g) ?? []).length;
    if (route) stack.push({ prefix: route[1], depth });
    depth += opens - closes;
    while (stack.length && depth <= stack[stack.length - 1].depth) stack.pop();
  }
  return routes;
}

export function loadMountedRoutes(root) {
  const out = {};
  for (const [svc, rel] of Object.entries(PUBLIC_ROUTERS)) {
    out[svc] = parseMountedRoutes(readFileSync(join(root, rel), 'utf-8'));
  }
  return out;
}

// Every declared `/v1/...` api_surface path must be a route the named service
// mounts EXACTLY — not a prefix of one. A prefix match let `/v1/qr` stand for
// CAP-PAY-003 (QR payments) because `/v1/qr/static` exists, while the route that
// pays a QR was removed (RA-053). An optional leading HTTP verb must match too.
// Entries without a `/v1/` token describe a mechanism, not a mount, and are
// skipped. Returns human-readable violations.
export function apiSurfaceViolations(caps, routesByService) {
  const out = [];
  for (const c of caps) {
    for (const raw of c.api_surface ?? []) {
      const entry = String(raw).trim();
      const tokens = entry.split(/\s+/);
      // "none (frozen; legacy /v1/splits returns 410 at edge)" declares NO
      // surface; the path in its note is history, not a claim.
      if (tokens[0] === 'none') continue;
      const idx = tokens.findIndex(t => t.startsWith('/v1/'));
      if (idx < 0) continue;
      const path = tokens[idx].replace(/[,;:)]+$/, '');
      const method = idx > 0 && HTTP_VERBS.includes(tokens[idx - 1]) ? tokens[idx - 1] : null;
      const svc = /\bpublic-api\b/.test(entry) ? 'public-api' : 'gateway';
      const norm = normRoute(path);
      const routes = routesByService[svc] ?? [];
      const hit = routes.some(r => r.path === norm && (!method || r.method === method));
      if (!hit) {
        out.push(`${c.id}: api_surface "${method ? `${method} ` : ''}${path}" is not a route ${svc} mounts ` +
          `(exact match required${svc === 'gateway' ? '; name public-api in the entry for a Consumer-surface route' : ''})`);
      }
    }
  }
  return out;
}
