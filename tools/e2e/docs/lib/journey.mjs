/**
 * What every documentation journey harness shares: a rubric whose summary is
 * derived and cannot contradict its steps, and the plumbing a cold reader has —
 * a Console session, an empty directory with the published SDK in it, a public
 * HTTPS endpoint of their own, and the public KYB document path.
 *
 * Extracted from tools/e2e/docs/quickstart-e2e.mjs so the DOA tutorial harness
 * holds itself to exactly the same rules instead of a second, looser copy.
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const DOCS = process.env.BZ_DOCS ?? 'https://developers.banzami.com';
export const API = process.env.BZ_DEV_API ?? 'https://developer-api.banzami.com';
export const GW = process.env.BZ_GATEWAY ?? 'https://sandbox-api.banzami.com';
export const CONSUMER = `${GW}/consumer`;
export const ORIGIN = process.env.BZ_CONSOLE ?? 'https://developers.banzami.com';
export const HOST = process.env.BZ_SANDBOX_HOST ?? 'root@217.160.9.248';

export const VERDICTS = new Set(['PASS', 'FAIL', 'PENDING', 'NOT_RUN']);

/**
 * A journey over a fixed rubric. Every step starts NOT_RUN, so an unvisited
 * step is visible; the summary is PASS only when every step is PASS; and
 * `assertConsistent` throws rather than print a green summary beside a
 * non-green step.
 */
export function journey(rubric, { log = true } = {}) {
  let steps = rubric.map((name, i) => ({ n: i + 1, name, verdict: 'NOT_RUN', detail: '' }));
  const mark = (n, verdict, detail = '') => {
    if (!VERDICTS.has(verdict)) throw new Error(`step ${n}: impossible verdict ${verdict}`);
    if (n < 1 || n > rubric.length) throw new Error(`step ${n} is not in a ${rubric.length}-step rubric`);
    steps[n - 1] = { ...steps[n - 1], verdict, detail };
    if (!log) return;
    const icon = verdict === 'PASS' ? '✓' : verdict === 'PENDING' ? '…' : verdict === 'NOT_RUN' ? '·' : '✗';
    (verdict === 'FAIL' ? console.error : console.log)(`  ${icon} [${String(n).padStart(2, '0')}] ${steps[n - 1].name}${detail ? ` — ${detail}` : ''}`);
  };
  const summarise = (list = steps) => {
    if (list.length !== rubric.length) throw new Error(`the rubric has ${rubric.length} steps, ${list.length} were reported`);
    const passed = list.filter((s) => s.verdict === 'PASS').length;
    return { passed, total: rubric.length, verdict: passed === rubric.length ? 'PASS' : 'FAIL' };
  };
  const assertConsistent = (list = steps, summary = summarise(list)) => {
    const notPass = list.filter((s) => s.verdict !== 'PASS');
    if (summary.verdict === 'PASS' && notPass.length > 0) {
      throw new Error(`INCONSISTENT: summary PASS with ${notPass.length} step(s) not PASS — ${notPass.map((s) => `${s.n}:${s.verdict}`).join(', ')}`);
    }
    if (summary.verdict !== 'PASS' && notPass.length === 0) throw new Error('INCONSISTENT: every step PASS but the summary is not PASS');
    return summary;
  };
  return {
    mark, summarise, assertConsistent,
    get steps() { return steps; },
    restore(saved) { if (saved?.length === rubric.length) steps = saved; },
    verdict: (n) => steps[n - 1].verdict,
  };
}

/** A deployed page as text, the way a reader sees it. */
export const flatten = (html) => html
  .replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ')
  .replace(/<[^>]+>/g, '\n')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&#x27;|&apos;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&#123;/g, '{').replace(/&#125;/g, '}');

export async function readDeployedPage(path) {
  const res = await fetch(`${DOCS}${path}`);
  if (!res.ok) throw new Error(`${path} answered http ${res.status}`);
  return flatten(await res.text());
}

/** The Console, with the reader's own session cookie and CSRF token. */
export function consoleCaller(token) {
  return async (path, method = 'GET', body) => {
    const headers = { cookie: `__Host-bz_dev_session=${token}` };
    if (method !== 'GET') {
      const me = await (await fetch(`${API}/auth/me`, { headers })).json().catch(() => ({}));
      Object.assign(headers, { 'content-type': 'application/json', origin: ORIGIN, 'x-csrf-token': me.csrf_token ?? '' });
    }
    const r = await fetch(API + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
}

/** Run an ES module in the reader's clean directory, with their key in the environment. */
export function runInReaderDir(dir, source, env) {
  const file = join(dir, `step-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.mjs`);
  writeFileSync(file, source);
  const out = execFileSync('node', [file], { cwd: dir, encoding: 'utf8', timeout: 180000, env: { ...process.env, ...env } }).trim();
  return JSON.parse(out.split('\n').pop());
}

/** What the reader's own webhook endpoint received. The sink stands in for their server. */
export function sinkRequests(cap) {
  const out = execFileSync('ssh', ['-o', 'BatchMode=yes', HOST,
    `docker exec banzami-webhook-sink wget -qO- 'http://localhost:8090/admin/requests?run=${cap}'`], { encoding: 'utf8', timeout: 60000 });
  return JSON.parse(out);
}
export function sinkConfigure(cap) {
  execFileSync('ssh', ['-o', 'BatchMode=yes', HOST,
    `docker exec banzami-webhook-sink wget -qO- --post-data='{}' --header='content-type: application/json' 'http://localhost:8090/admin/configure?run=${cap}'`], { encoding: 'utf8', timeout: 60000 });
}

/**
 * A synthetic KYB document: a minimal, valid PDF that says in its own text that
 * it is a Sandbox test document. The gateway sniffs magic bytes, so it must be a
 * real PDF — and unmistakably fake to whoever opens it in review.
 */
export function syntheticPdf(label, purpose = 'Banzami public documentation journey') {
  const text = `SANDBOX TEST DOCUMENT - ${label} - NOT A REAL DOCUMENT - ${purpose}`;
  const stream = `BT /F1 10 Tf 40 780 Td (${text}) Tj ET`;
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let body = '%PDF-1.4\n';
  const offsets = [];
  objs.forEach((o, i) => { offsets.push(body.length); body += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = body.length;
  body += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  body += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, 'latin1');
}

/** Upload what an application currently needs, through the public signed-URL path. */
export async function uploadDueDocuments(applicationId, due, purpose) {
  const done = [], failed = [];
  for (const d of due.filter((x) => x.kind === 'document')) {
    const bytes = syntheticPdf(d.code, purpose);
    const up = await fetch(`${GW}/v1/merchant/applications/${applicationId}/documents/upload-url`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ document_type: d.code, filename: `${d.code.toLowerCase()}-sandbox-test.pdf`, mime_type: 'application/pdf', size_bytes: bytes.length }),
    });
    const u = await up.json().catch(() => ({}));
    if (!up.ok || !u.upload_url) { failed.push(`${d.code}: upload-url http ${up.status} ${u.error?.code ?? u.code ?? ''}`); continue; }
    const put = await fetch(u.upload_url, { method: u.method ?? 'PUT', headers: u.headers ?? { 'content-type': 'application/pdf' }, body: bytes });
    if (!put.ok) { failed.push(`${d.code}: storage PUT http ${put.status}`); continue; }
    const conf = await fetch(`${GW}/v1/merchant/applications/${applicationId}/documents/${u.document_id}/confirm`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
    });
    conf.ok ? done.push(d.code) : failed.push(`${d.code}: confirm http ${conf.status}`);
  }
  return { done, failed };
}

/**
 * Read-only count on the Sandbox. The session is forced read-only by
 * PGOPTIONS, so a mistake in the query cannot become a write.
 */
export function sandboxCount(sql) {
  const out = execFileSync('ssh', ['-o', 'BatchMode=yes', HOST,
    `PG=$(docker ps --format '{{.Names}}' | grep postgres | grep bzsandbox | head -1); `
    + `CORE=$(docker ps --format '{{.Names}}' | grep core-api-staging | head -1); `
    + `PW=$(docker exec $CORE sh -c 'cat /run/secrets/db_url' | sed -E 's#.*://[^:]+:([^@]+)@.*#\\1#'); `
    + `docker exec -e PGPASSWORD=$PW -e PGOPTIONS='-c default_transaction_read_only=on' $PG psql -U bl_app_runtime -d banzami_staging -At -c "${sql.replace(/"/g, '\\"')}"`], { encoding: 'utf8', timeout: 60000 });
  return Number(out.trim()) || 0;
}
