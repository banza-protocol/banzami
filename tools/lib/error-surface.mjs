/**
 * Which error codes can a developer's program actually receive?
 *
 * Not "which codes does the gateway contain" — it contains 122, most of them
 * for merchants, onboarding, KYB review and operators. And not "which codes
 * does a surface handler write directly" — the first version of this looked at
 * handler method bodies only and missed every code written by a helper the
 * handler calls, and every code the financial core writes and the gateway
 * passes through unchanged. Both are as real to the caller as a literal.
 *
 * So this follows the calls:
 *
 *   1. the routes a developer key, the dual-credential surface or a public
 *      route can reach, read from server.go (not from a list someone keeps);
 *   2. from each, the transitive closure of the handler-package functions it
 *      calls, and of the middleware the route group mounts;
 *   3. every literal code those functions write — `Respond(…, "CODE", …)` and
 *      `Code = "CODE"` assignments that end up in one;
 *   4. every place in that closure that writes a code it did NOT choose
 *      (`Respond(w, r, ce.Status, code, msg)`). Those are forwarding points, and
 *      each must be declared — with the core handler it forwards from — or the
 *      derivation refuses to answer. The core codes are then derived the same
 *      way, from the Rust handler's own closure.
 *
 * Pure: reads source, returns data. Used by tools/check-docs-error-catalogue.mjs.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const CODE = /[A-Z][A-Z0-9_]{2,}/;

// ── bodies ──────────────────────────────────────────────────────────────────

/** Index of the `}` matching the `{` at `open`, skipping strings and comments. */
function matchBrace(src, open, lang) {
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    const c = src[i];
    const n = src[i + 1];
    if (c === '/' && n === '/') { i = src.indexOf('\n', i); if (i < 0) return src.length; continue; }
    if (c === '/' && n === '*') { i = src.indexOf('*/', i + 2) + 1; continue; }
    if (c === '"') { i += 1; while (i < src.length && src[i] !== '"') i += src[i] === '\\' ? 2 : 1; continue; }
    if (lang === 'go' && c === '`') { i = src.indexOf('`', i + 1); continue; }
    if (lang === 'go' && c === "'") { i += 1; while (i < src.length && src[i] !== "'") i += src[i] === '\\' ? 2 : 1; continue; }
    if (lang === 'rs' && c === 'r' && (n === '#' || n === '"') && !/\w/.test(src[i - 1] ?? '')) {
      const m = /^r(#*)"/.exec(src.slice(i, i + 8));
      if (m) { i = src.indexOf(`"${m[1]}`, i + m[0].length) + m[1].length; continue; }
    }
    if (lang === 'rs' && c === "'" && (src[i + 2] === "'" || (n === '\\' && src[i + 3] === "'"))) { i += n === '\\' ? 3 : 2; continue; }
    if (c === '{') depth += 1;
    else if (c === '}') { depth -= 1; if (depth === 0) return i; }
  }
  return src.length;
}

/** The `{` that opens a function body: the first one after its parameter list closes. */
function bodyOpen(src, from) {
  let i = src.indexOf('(', from);
  let depth = 0;
  for (; i < src.length; i += 1) {
    if (src[i] === '(') depth += 1;
    else if (src[i] === ')') { depth -= 1; if (depth === 0) break; }
  }
  // Skip a parenthesised Go result list, then take the next brace.
  return src.indexOf('{', i);
}

/** Every Go function in a directory: key `Type.Method` or `func`, with body and file. */
export function goFunctions(dir) {
  const out = new Map();
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.go') && !x.endsWith('_test.go'))) {
    const src = readFileSync(join(dir, f), 'utf8');
    for (const m of src.matchAll(/^func\s+(?:\(\s*(\w+)\s+\*?(\w+)\s*\)\s*)?(\w+)\s*\(/gm)) {
      const open = bodyOpen(src, m.index + m[0].length - 1);
      const close = matchBrace(src, open, 'go');
      const key = m[2] ? `${m[2]}.${m[3]}` : m[3];
      out.set(key, { key, recv: m[1] ?? null, type: m[2] ?? null, name: m[3], file: f, body: src.slice(open, close + 1) });
    }
  }
  return out;
}

/** Every Rust fn in the core routes directory, keyed `file#name`. */
export function rustFunctions(dir) {
  const out = new Map();
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.rs') && !x.endsWith('_tests.rs'))) {
    let src = readFileSync(join(dir, f), 'utf8');
    // Test items are not reachable from a request. Cut each `#[cfg(test)]`
    // item — a `mod tests { … }` can sit in the middle of a file, with real
    // handlers after it, so truncating at the first one loses handlers.
    for (let t = src.search(/#\[cfg\(test\)\]/); t >= 0; t = src.search(/#\[cfg\(test\)\]/)) {
      const open = src.indexOf('{', t);
      const semi = src.indexOf(';', t);
      const end = semi >= 0 && semi < open ? semi : matchBrace(src, open, 'rs');
      src = src.slice(0, t) + src.slice(end + 1);
    }
    for (const m of src.matchAll(/^\s*(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?fn\s+(\w+)\s*(?:<[^>]*>)?\s*\(/gm)) {
      const open = src.indexOf('{', (() => { let i = m.index + m[0].length - 1, d = 0; for (; i < src.length; i += 1) { if (src[i] === '(') d += 1; else if (src[i] === ')') { d -= 1; if (d === 0) break; } } return i; })());
      const close = matchBrace(src, open, 'rs');
      const mod = f.replace(/\.rs$/, '');
      out.set(`${mod}#${m[1]}`, { key: `${mod}#${m[1]}`, mod, name: m[1], file: f, body: src.slice(open, close + 1) });
    }
  }
  return out;
}

// ── the gateway surface ─────────────────────────────────────────────────────

function groupBodies(server, marker) {
  const out = [];
  for (const m of server.matchAll(/r\.Group\(\s*func\s*\([^)]*\)\s*\{/g)) {
    const open = server.indexOf('{', m.index);
    const b = server.slice(open, matchBrace(server, open, 'go') + 1);
    if (b.includes(marker)) out.push(b);
  }
  return out;
}

/**
 * @param root repository root
 * @returns {{ entries: string[], middleware: string[], codes: Map<string, Set<string>>, forwarding: {entry:string, at:string, line:string}[] }}
 */
export function gatewaySurface(root) {
  const G = join(root, 'services/api-gateway/internal');
  const server = readFileSync(join(G, 'server/server.go'), 'utf8');
  const handlers = goFunctions(join(G, 'handler'));
  const middleware = goFunctions(join(G, 'middleware'));

  const mountPublic = server.indexOf('func mountPublicProofVerify(');
  const publicBody = mountPublic >= 0 ? server.slice(server.indexOf('{', mountPublic), matchBrace(server, server.indexOf('{', mountPublic), 'go') + 1) : '';
  const surface = [...groupBodies(server, 'middleware.DeveloperKeyAuth('), ...groupBodies(server, 'middleware.DualAuth('), publicBody].join('\n');

  const varType = new Map();
  for (const m of server.matchAll(/(\w+)\s*:?=\s*handler\.New(\w+Handler)\(/g)) varType.set(m[1], m[2]);

  const entries = new Set();
  for (const m of surface.matchAll(/\b(\w+)\.(\w+)\)/g)) { const t = varType.get(m[1]); if (t && handlers.has(`${t}.${m[2]}`)) entries.add(`${t}.${m[2]}`); }
  for (const m of surface.matchAll(/handler\.New(\w+Handler)\([^)]*\)\.(\w+)\)/g)) if (handlers.has(`${m[1]}.${m[2]}`)) entries.add(`${m[1]}.${m[2]}`);

  // The middleware the surface mounts, and what they call in turn.
  const mw = new Set();
  for (const m of surface.matchAll(/middleware\.(\w+)\(/g)) if (middleware.has(m[1])) mw.add(m[1]);

  const closure = (start, fns) => {
    const seen = new Set();
    const stack = [start];
    while (stack.length) {
      const k = stack.pop();
      if (seen.has(k) || !fns.has(k)) continue;
      seen.add(k);
      const fn = fns.get(k);
      // h.method( — a method on the receiver itself. NOT h.svc.Method(: that
      // is a service, and matching it by name once linked a surface handler to
      // an unrelated handler method of the same name.
      if (fn.recv) for (const c of fn.body.matchAll(new RegExp(`(?<![.\\w])${fn.recv}\\.(\\w+)\\(`, 'g'))) if (fns.has(`${fn.type}.${c[1]}`)) stack.push(`${fn.type}.${c[1]}`);
      // A package function.
      for (const c of fn.body.matchAll(/(?<![.\w])([A-Za-z_]\w*)\s*\(/g)) if (fns.has(c[1])) stack.push(c[1]);
      // A package function passed by name (e.g. used as a callback).
      for (const c of fn.body.matchAll(/(?<![.\w])([a-z]\w*)(?=[,)])/g)) if (fns.has(c[1])) stack.push(c[1]);
    }
    return seen;
  };

  const codes = new Map();
  const statuses = new Map();
  const forwarding = [];
  const add = (code, where, status) => {
    if (!codes.has(code)) { codes.set(code, new Set()); statuses.set(code, new Set()); }
    codes.get(code).add(where);
    if (status) statuses.get(code).add(status);
  };
  const scan = (fn, entry) => {
    const where = `${fn.file}:${fn.name}`;
    for (const m of fn.body.matchAll(/Respond\(\s*w,\s*r,\s*http\.Status(\w+),\s*"([A-Z][A-Z0-9_]{2,})"/g)) add(m[2], where, HTTP[m[1]] ?? m[1]);
    // `out.Code, out.Status = "X", http.StatusY` — the status travels beside it.
    for (const m of fn.body.matchAll(/\bCode\s*,\s*\w+\.Status\s*=\s*"([A-Z][A-Z0-9_]{2,})"\s*,\s*http\.Status(\w+)/g)) add(m[1], where, HTTP[m[2]] ?? m[2]);
    // `out.Code, out.Status = "X", …` / `code = "X"` / `Code: "X"` — a code
    // chosen here and written by a Respond elsewhere in the closure.
    for (const m of fn.body.matchAll(/\b[Cc]ode\b[^=:\n]*(?:=|:)\s*"([A-Z][A-Z0-9_]{2,})"/g)) add(m[1], where);
    for (const m of fn.body.matchAll(/Respond\(\s*w,\s*r,\s*([^,]+),\s*(?=[^\s"])([^,]+),/g)) {
      forwarding.push({ entry, at: where, line: `Respond(w, r, ${m[1].trim()}, ${m[2].trim()}, …)` });
    }
  };

  for (const e of entries) for (const k of closure(e, handlers)) scan(handlers.get(k), e);
  for (const m of mw) for (const k of closure(m, middleware)) scan(middleware.get(k), `middleware.${m}`);

  // Services the surface handlers call can still choose a code the handler
  // writes verbatim (service.RefundError). Those are declared as forwarding
  // points too, so they are caught at the Respond above; their fallback codes
  // are declared in the catalogue and checked to exist where it says.
  return { entries: [...entries].sort(), middleware: [...mw].sort(), codes, statuses, forwarding };
}

/** Every code the gateway source writes anywhere — the universe to classify. */
export function gatewayAllCodes(root) {
  const G = join(root, 'services/api-gateway/internal');
  const all = new Set();
  for (const d of ['handler', 'middleware']) {
    for (const fn of goFunctions(join(G, d)).values()) {
      for (const m of fn.body.matchAll(/Respond\(\s*w,\s*r,\s*[^,]+,\s*"([A-Z][A-Z0-9_]{2,})"/g)) all.add(m[1]);
      for (const m of fn.body.matchAll(/\b[Cc]ode\b[^=:\n]*(?:=|:)\s*"([A-Z][A-Z0-9_]{2,})"/g)) all.add(m[1]);
    }
  }
  return all;
}

// ── the financial core, for forwarded codes ────────────────────────────────

const RS_FIXED = { bad_request: 'BAD_REQUEST', not_found: 'NOT_FOUND', forbidden: 'FORBIDDEN', internal: 'INTERNAL_ERROR' };
const RS_STATUS = { bad_request: 400, not_found: 404, forbidden: 403, internal: 500, conflict: 409, unprocessable: 422, gone: 410, too_many_requests: 429 };

/** net/http status names → numbers, for the ones the gateway uses. */
export const HTTP = {
  BadRequest: 400, Unauthorized: 401, Forbidden: 403, NotFound: 404, MethodNotAllowed: 405, Conflict: 409, Gone: 410,
  RequestEntityTooLarge: 413, UnsupportedMediaType: 415, UnprocessableEntity: 422, Locked: 423, TooManyRequests: 429,
  InternalServerError: 500, NotImplemented: 501, BadGateway: 502, ServiceUnavailable: 503, GatewayTimeout: 504,
};

/**
 * Codes a core handler can return, from its own closure within core/api/src/routes.
 * `includeServerErrors` — whether a 5xx is forwarded as-is (refunds) or
 * replaced by the gateway with UPSTREAM_ERROR (everything else).
 */
export function coreCodes(root, starts, { includeServerErrors = false } = {}) {
  const fns = rustFunctions(join(root, 'core/api/src/routes'));
  const missing = starts.filter((s) => !fns.has(s));
  const seen = new Set();
  const stack = [...starts];
  while (stack.length) {
    const k = stack.pop();
    if (seen.has(k) || !fns.has(k)) continue;
    seen.add(k);
    const fn = fns.get(k);
    for (const c of fn.body.matchAll(/(?<![:\w])([a-z_]\w*)\b/g)) if (fns.has(`${fn.mod}#${c[1]}`)) stack.push(`${fn.mod}#${c[1]}`);
    // super::risk::ensure_not_frozen — overlapping, so `super::risk` does not
    // consume the `risk::ensure_not_frozen` that follows it.
    for (const c of fn.body.matchAll(/(?=\b([a-z_]\w*)::([a-z_]\w*)\b)/g)) if (fns.has(`${c[1]}#${c[2]}`)) stack.push(`${c[1]}#${c[2]}`);
  }
  const codes = new Map();
  const statuses = new Map();
  const add = (code, where, status) => {
    if (!codes.has(code)) { codes.set(code, new Set()); statuses.set(code, new Set()); }
    codes.get(code).add(where);
    if (status) statuses.get(code).add(status);
  };
  for (const k of seen) {
    const { body } = fns.get(k);
    for (const m of body.matchAll(/ApiError::(\w+)\(\s*(?:"([A-Z][A-Z0-9_]{2,})")?/g)) {
      if (RS_FIXED[m[1]]) { if (m[1] !== 'internal' || includeServerErrors) add(RS_FIXED[m[1]], k, RS_STATUS[m[1]]); }
      else if (m[2]) add(m[2], k, RS_STATUS[m[1]]);
    }
    // ADR-028 fee-destination blockers are returned through unprocessable(code, …).
    for (const m of body.matchAll(/blocker\s*=\s*Some\(\s*"([A-Z][A-Z0-9_]{2,})"/g)) add(m[1], k, 422);
  }
  return { codes, statuses, reached: [...seen].sort(), missing };
}

/** Codes the Console backend (services/developer-api) writes. */
export function consoleCodes(root) {
  const dir = join(root, 'services/developer-api');
  const out = new Set();
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.go') && !e.name.endsWith('_test.go')) {
        for (const m of readFileSync(p, 'utf8').matchAll(/Error\w*\(\s*\w+,\s*[^,]+,\s*"([A-Z][A-Z0-9_]{2,})"/g)) out.add(m[1]);
      }
    }
  };
  walk(dir);
  return out;
}

export { CODE };

// ── routes, for per-endpoint accuracy ───────────────────────────────────────

/**
 * Every chi route in server.go with its full path, handler and the middleware
 * stacked above it. Groups inherit their parent's middleware; Route blocks add a
 * prefix. `if … { r.Use(A) } else { r.Use(B) }` yields both, which only ever
 * widens what a route is taken to be able to return.
 */
export function gatewayRoutes(root) {
  const server = readFileSync(join(root, 'services/api-gateway/internal/server/server.go'), 'utf8');
  const varType = new Map();
  for (const m of server.matchAll(/(\w+)\s*:?=\s*handler\.New(\w+Handler)\(/g)) varType.set(m[1], m[2]);
  const routes = [];

  const handlerKey = (expr) => {
    const e = expr.trim();
    let m = /^handler\.New(\w+Handler)\([\s\S]*\)\.(\w+)$/.exec(e);
    if (m) return `${m[1]}.${m[2]}`;
    m = /^(\w+)\.(\w+)$/.exec(e);
    if (m && varType.has(m[1])) return `${varType.get(m[1])}.${m[2]}`;
    return null;
  };

  // Split a call's argument list at top-level commas.
  const args = (src, open) => {
    let d = 0; const parts = []; let start = open + 1;
    for (let i = open; i < src.length; i += 1) {
      const c = src[i];
      if (c === '"') { i += 1; while (src[i] !== '"') i += src[i] === '\\' ? 2 : 1; continue; }
      if (c === '(' || c === '{' || c === '[') d += 1;
      else if (c === ')' || c === '}' || c === ']') { d -= 1; if (d === 0) { parts.push(src.slice(start, i)); return { parts, end: i }; } }
      else if (c === ',' && d === 1) { parts.push(src.slice(start, i)); start = i + 1; }
    }
    return { parts, end: src.length };
  };

  const walk = (block, prefix, mws) => {
    const stack = [...mws];
    const re = /\br\.(Route|Group|Use|Get|Post|Put|Patch|Delete|With)\(/g;
    let m;
    while ((m = re.exec(block))) {
      const open = m.index + m[0].length - 1;
      const { parts, end } = args(block, open);
      const kind = m[1];
      if (kind === 'Use') {
        for (const p of parts) for (const x of p.matchAll(/middleware\.(\w+)\(/g)) stack.push(x[1]);
      } else if (kind === 'Route' || kind === 'Group') {
        const fnSrc = parts[parts.length - 1];
        const bOpen = fnSrc.indexOf('{');
        const inner = fnSrc.slice(bOpen + 1, matchBrace(fnSrc, bOpen, 'go'));
        const sub = kind === 'Route' ? prefix + JSON.parse(parts[0].trim()) : prefix;
        walk(inner, sub, stack);
      } else if (kind === 'With') {
        const withMws = [...stack];
        for (const p of parts) for (const x of p.matchAll(/middleware\.(\w+)\(/g)) withMws.push(x[1]);
        const tail = /^\s*\.(Get|Post|Put|Patch|Delete)\(/.exec(block.slice(end + 1));
        if (tail) {
          const o2 = end + 1 + tail[0].length - 1;
          const r2 = args(block, o2);
          const path = (prefix + JSON.parse(r2.parts[0].trim())).replace(/\/$/, '') || '/';
          routes.push({ method: tail[1].toUpperCase(), path, handler: handlerKey(r2.parts[1]), middleware: withMws });
          re.lastIndex = r2.end + 1;
          continue;
        }
      } else {
        const path = (prefix + JSON.parse(parts[0].trim())).replace(/\/$/, '') || '/';
        routes.push({ method: kind.toUpperCase(), path, handler: handlerKey(parts[1] ?? ''), middleware: [...stack] });
      }
      re.lastIndex = end + 1;
    }
  };

  // Top-level: every func body in server.go that mounts routes.
  for (const m of server.matchAll(/^func\s+(\w+)\s*\(/gm)) {
    const open = bodyOpen(server, m.index + m[0].length - 1);
    walk(server.slice(open + 1, matchBrace(server, open, 'go')), '', []);
  }
  return routes;
}

/**
 * Codes one route can return: its handler's closure, its middleware's closure,
 * and — for a declared forwarding handler — the core handler's codes.
 */
export function routeCodes(root, route, forwarded = []) {
  const G = join(root, 'services/api-gateway/internal');
  const handlers = goFunctions(join(G, 'handler'));
  const middleware = goFunctions(join(G, 'middleware'));
  const codes = new Set();
  const collect = (start, fns) => {
    const seen = new Set(); const st = [start];
    while (st.length) {
      const k = st.pop(); if (seen.has(k) || !fns.has(k)) continue; seen.add(k);
      const fn = fns.get(k);
      if (fn.recv) for (const c of fn.body.matchAll(new RegExp(`(?<![.\\w])${fn.recv}\\.(\\w+)\\(`, 'g'))) st.push(`${fn.type}.${c[1]}`);
      for (const c of fn.body.matchAll(/(?<![.\w])([A-Za-z_]\w*)\s*\(/g)) st.push(c[1]);
      for (const c of fn.body.matchAll(/(?<![.\w])([a-z]\w*)(?=[,)])/g)) st.push(c[1]);
      for (const x of fn.body.matchAll(/Respond\(\s*w,\s*r,\s*[^,]+,\s*"([A-Z][A-Z0-9_]{2,})"/g)) codes.add(x[1]);
      for (const x of fn.body.matchAll(/\b[Cc]ode\b[^=:\n]*(?:=|:)\s*"([A-Z][A-Z0-9_]{2,})"/g)) codes.add(x[1]);
    }
  };
  if (route.handler) collect(route.handler, handlers);
  for (const m of route.middleware) collect(m, middleware);
  for (const f of forwarded.filter((x) => x.surface === route.handler)) {
    for (const c of coreCodes(root, f.core, { includeServerErrors: f.server_errors === 'forwarded' }).codes.keys()) codes.add(c);
  }
  return codes;
}
