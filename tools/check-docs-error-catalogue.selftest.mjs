#!/usr/bin/env node
/**
 * Mutation proof for tools/check-docs-error-catalogue.mjs.
 *
 * A gate that has only ever printed PASS has proved nothing. Each case below
 * copies the source the gate reads into a scratch tree, breaks it in one
 * specific way, and requires the gate to fail — on the counter that names that
 * break, and not merely somewhere. The unmodified copy must pass.
 *
 *   node tools/check-docs-error-catalogue.selftest.mjs
 */
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const GATE = join(ROOT, 'tools/check-docs-error-catalogue.mjs');
const COPY = [
  'services/api-gateway/internal/server', 'services/api-gateway/internal/handler',
  'services/api-gateway/internal/middleware', 'services/api-gateway/internal/service',
  'core/api/src/routes', 'services/developer-api/internal', 'services/developer-api/cmd',
  'services/public-api/internal/handler', 'services/public-api/internal/server',
  'apps/website/app/developers/page.tsx', 'apps/website/app/developers/docs',
  'docs/developer/openapi',
];

function tree() {
  const dir = mkdtempSync(join(tmpdir(), 'bz-errcat-'));
  for (const p of COPY) {
    cpSync(join(ROOT, p), join(dir, p), {
      recursive: true,
      filter: (src) => !/node_modules|\.test\.|\.next/.test(src),
    });
  }
  return dir;
}
const edit = (dir, file, fn) => { const p = join(dir, file); writeFileSync(p, fn(readFileSync(p, 'utf8'))); };
const run = (dir) => {
  const r = spawnSync(process.execPath, [GATE], { env: { ...process.env, BZ_ERRCAT_ROOT: dir }, encoding: 'utf8' });
  const counters = Object.fromEntries([...(r.stdout ?? '').matchAll(/^([A-Z_]+)=(\S+)$/gm)].map((m) => [m[1], m[2]]));
  return { code: r.status, counters, out: `${r.stdout}${r.stderr}` };
};

const CASES = [
  {
    name: 'baseline copy passes',
    mutate: () => {},
    expect: (c) => c.code === 0 && c.counters.DOC_ERROR_CATALOGUE === 'PASS',
  },
  {
    name: 'A — a surface handler starts returning a new code',
    mutate: (d) => edit(d, 'services/api-gateway/internal/handler/me.go', (s) => s.replace(
      '"UNAUTHORIZED", "authentication required")',
      '"UNAUTHORIZED", "authentication required")\n\t\tapierror.Respond(w, r, http.StatusTeapot, "BRAND_NEW_CODE", "x")')),
    expect: (c) => c.code !== 0 && Number(c.counters.DOC_ERRORS_MISSING) >= 1,
  },
  {
    name: 'A — the financial core starts returning a new code the gateway forwards',
    mutate: (d) => edit(d, 'core/api/src/routes/payment_sessions.rs', (s) => s.replace(
      'return Err(ApiError::bad_request(\n                "amount_minor must be a positive integer when provided",',
      'return Err(ApiError::conflict("CORE_NEW_CODE", "x")); #[allow(unreachable_code)] return Err(ApiError::bad_request(\n                "amount_minor must be a positive integer when provided",')),
    expect: (c) => c.code !== 0 && Number(c.counters.DOC_ERRORS_MISSING) >= 1 && /CORE_NEW_CODE/.test(c.out),
  },
  {
    name: 'A — a code classified internal becomes reachable',
    mutate: (d) => edit(d, 'services/api-gateway/internal/handler/me.go', (s) => s.replace(
      '"UNAUTHORIZED", "authentication required")',
      '"UNAUTHORIZED", "authentication required")\n\t\tapierror.Respond(w, r, http.StatusForbidden, "KYB_DECIDED_BY_REVIEW", "x")')),
    expect: (c) => c.code !== 0 && /KYB_DECIDED_BY_REVIEW \(classified INTERNAL/.test(c.out),
  },
  {
    name: 'A — a service a Sandbox route forwards to starts returning a new code',
    mutate: (d) => edit(d, 'services/public-api/internal/handler/sandbox_test_payers.go', (s) => s.replace(
      '"TEST_PAYER_RETIRED", "this test payer is retired")',
      '"TEST_PAYER_RETIRED", "this test payer is retired")\n\t\tapierror.Respond(w, r, http.StatusTeapot, "FORWARDED_NEW_CODE", "x")')),
    expect: (c) => c.code !== 0 && /FORWARDED_NEW_CODE/.test(c.out) && Number(c.counters.DOC_ERRORS_MISSING) >= 1,
  },
  {
    name: 'A — a route forwards to another service and nothing declares it',
    mutate: (d) => edit(d, 'apps/website/app/developers/docs/error-catalogue.json', (s) => {
      const j = JSON.parse(s);
      delete j.forwarded_services;
      return JSON.stringify(j, null, 2);
    }),
    expect: (c) => c.code !== 0 && Number(c.counters.DOC_ERRORS_UNDECLARED_FORWARDING) >= 1,
  },
  {
    name: 'B — the catalogue documents a code nothing returns',
    mutate: (d) => edit(d, 'apps/website/app/developers/docs/error-catalogue.json', (s) => {
      const j = JSON.parse(s);
      j.errors.push({ ...j.errors[0], code: 'VALIDATION_ERROR' });
      return JSON.stringify(j, null, 2);
    }),
    expect: (c) => c.code !== 0 && Number(c.counters.DOC_ERRORS_NOT_PUBLIC) >= 1,
  },
  {
    name: 'B — prose names an internal code',
    mutate: (d) => edit(d, 'apps/website/app/developers/docs/content-pt.tsx', (s) => s.replace(
      '<H2 id="catalogo-de-erros">', '<P><Code>403 KYB_DECIDED_BY_REVIEW</Code></P>\n              <H2 id="catalogo-de-erros">')),
    expect: (c) => c.code !== 0 && Number(c.counters.DOC_ERRORS_NOT_PUBLIC) >= 1 && /INTERNAL code/.test(c.out),
  },
  {
    name: 'B — the landing page lists an invented lower-case code',
    mutate: (d) => edit(d, 'apps/website/app/developers/page.tsx', (s) => s.replace(
      "  { code: 'RATE_LIMITED',", "  { code: 'rate_limit_exceeded', desc: 'x' },\n  { code: 'RATE_LIMITED',")),
    expect: (c) => c.code !== 0 && Number(c.counters.DOC_ERRORS_NOT_PUBLIC) >= 1,
  },
  {
    name: 'route — an endpoint documents a code that route cannot return',
    mutate: (d) => edit(d, 'apps/website/app/developers/docs/reference.tsx', (s) => s.replace(
      "{ code: '404 NO_LINK',", "{ code: '422 REFUND_NOT_FUNDABLE', note: { pt: 'x', en: 'x' } },\n      { code: '404 NO_LINK',")),
    expect: (c) => c.code !== 0 && Number(c.counters.DOC_ERRORS_ROUTE_DRIFT) >= 1,
  },
  {
    name: 'classification — a merchant-only handler adds a code nobody classified',
    mutate: (d) => edit(d, 'services/api-gateway/internal/handler/compliance.go', (s) => s.replace(
      '"consumer authentication required")', '"consumer authentication required")\n\t\tapierror.Respond(w, r, http.StatusForbidden, "UNCLASSIFIED_NEW", "x")')),
    expect: (c) => c.code !== 0 && Number(c.counters.DOC_ERRORS_UNCLASSIFIED) >= 1 && Number(c.counters.DOC_ERRORS_MISSING) === 0,
  },
  {
    name: 'forwarding — a surface handler forwards a code from somewhere undeclared',
    mutate: (d) => edit(d, 'apps/website/app/developers/docs/error-catalogue.json', (s) => {
      const j = JSON.parse(s);
      j.forwarded = j.forwarded.filter((f) => f.surface !== 'RefundHandler.Create');
      return JSON.stringify(j, null, 2);
    }),
    expect: (c) => c.code !== 0 && Number(c.counters.DOC_ERRORS_UNDECLARED_FORWARDING) >= 1,
  },
  {
    name: 'status — the catalogue claims the wrong HTTP status',
    mutate: (d) => edit(d, 'apps/website/app/developers/docs/error-catalogue.json', (s) => {
      const j = JSON.parse(s);
      j.errors.find((e) => e.code === 'NO_QR').http = [400];
      return JSON.stringify(j, null, 2);
    }),
    expect: (c) => c.code !== 0 && Number(c.counters.DOC_ERRORS_STATUS_DRIFT) >= 1,
  },
  {
    name: 'PT/EN — an action exists in one language only',
    mutate: (d) => edit(d, 'apps/website/app/developers/docs/error-catalogue.json', (s) => {
      const j = JSON.parse(s);
      j.errors[3].action.en = '';
      return JSON.stringify(j, null, 2);
    }),
    expect: (c) => c.code !== 0 && Number(c.counters.DOC_ERROR_CATALOGUE_PT_EN_DRIFT) >= 1,
  },
  {
    name: 'PT/EN — English prose names a code Portuguese does not',
    mutate: (d) => edit(d, 'apps/website/app/developers/docs/content-en.tsx', (s) => s.replace(
      '<H2 id="error-catalogue">', '<P><Code>409 BINDING_CHANGED</Code></P>\n              <H2 id="error-catalogue">')),
    expect: (c) => c.code !== 0 && Number(c.counters.DOC_ERROR_CATALOGUE_PT_EN_DRIFT) >= 1,
  },
  {
    name: 'security — catalogue text exposes an implementation detail',
    mutate: (d) => edit(d, 'apps/website/app/developers/docs/error-catalogue.json', (s) => {
      const j = JSON.parse(s);
      j.errors.find((e) => e.code === 'UPSTREAM_ERROR').meaning.en = 'core-api returned 500 from postgres';
      return JSON.stringify(j, null, 2);
    }),
    expect: (c) => c.code !== 0 && Number(c.counters.DOC_ERRORS_INTERNAL_DETAIL) >= 1,
  },
  {
    name: 'E — a public service stops rewriting 502/504, so a documented 503 is not what arrives',
    mutate: (d) => edit(d, 'services/public-api/internal/server/server.go', (s) => s.replace('r.Use(edgestatus.Middleware("/internal/"))', '')),
    expect: (c) => c.code !== 0 && Number(c.counters.DOC_ERRORS_STATUS_DRIFT) >= 1 && /UPSTREAM_ERROR|PAYMENT_NOT_CONFIRMED/.test(c.out),
  },
  {
    name: 'E — the catalogue documents a 504 the edge would replace',
    mutate: (d) => edit(d, 'apps/website/app/developers/docs/error-catalogue.json', (s) => {
      const j = JSON.parse(s); j.errors.find((e) => e.code === 'SANDBOX_SIMULATED_TIMEOUT').http = [504]; return JSON.stringify(j, null, 2);
    }),
    expect: (c) => c.code !== 0 && Number(c.counters.DOC_ERRORS_EDGE_UNREADABLE_STATUS) >= 1,
  },
];

let failed = 0;
for (const k of CASES) {
  const dir = tree();
  try {
    k.mutate(dir);
    const r = run(dir);
    const ok = k.expect(r);
    console.log(`  ${ok ? '✓' : '✗'} ${k.name}${ok ? '' : `\n      exit ${r.code} ${JSON.stringify(r.counters)}\n${r.out.split('\n').filter((l) => /✗/.test(l)).slice(0, 6).join('\n')}`}`);
    if (!ok) failed += 1;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
console.log(`\nDOC_ERROR_CATALOGUE_MUTATIONS=${CASES.length - 1}`);
console.log(`DOC_ERROR_CATALOGUE_SELFTEST=${failed === 0 ? 'PASS' : 'FAIL'}`);
process.exit(failed ? 1 : 0);
