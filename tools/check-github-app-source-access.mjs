#!/usr/bin/env node
/**
 * check-github-app-source-access.mjs — static gate for the GitHub App canonical
 * source-access plan (docs/operations/GITHUB_APP_CANONICAL_SOURCE_ACCESS.md).
 *
 * Rejects (exit 1):
 *   A. personal access tokens (ghp_/github_pat_ literals, or PAT-based auth) in the
 *      source-access templates/doc;
 *   B. deploy-key / SSH use for the canonical repo in the templates (must be HTTPS
 *      App-token);
 *   C. SSH aliases / remotes pointing at the stale `banzami/banzami` redirect in the
 *      executable templates;
 *   D. App-token persistence in a Git remote URL (token-in-URL) in the templates;
 *   E. GitHub App credentials referenced by Docker Compose / runtime service env;
 *   F. any WRITE (or admin) permission in the documented App permission set.
 *
 * Usage: node tools/check-github-app-source-access.mjs  (make check-github-app-source-access)
 */
import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const DOC = 'docs/operations/GITHUB_APP_CANONICAL_SOURCE_ACCESS.md';
const HELPER = 'infra/deployment/github-app-token-helper.sh';
const WRAPPER = 'infra/deployment/github-app-source-clone.sh';
const TEMPLATES = [HELPER, WRAPPER];
let failures = 0;
const fail = m => { console.error(`  ✗ ${m}`); failures++; };
const pass = m => console.log(`  ✓ ${m}`);
const read = f => { try { return readFileSync(resolve(ROOT, f), 'utf8'); } catch { return ''; } };

for (const f of [DOC, ...TEMPLATES]) {
  if (!existsSync(resolve(ROOT, f))) fail(`missing deliverable: ${f}`);
}

// ── A. No personal access tokens (literals or PAT-based auth) ────────────────
{
  const bad = [];
  for (const f of [DOC, ...TEMPLATES]) {
    const s = read(f);
    if (/\bghp_[A-Za-z0-9]{10,}\b/.test(s) || /\bgithub_pat_[A-Za-z0-9_]{10,}\b/.test(s)) bad.push(`${f} (token literal)`);
    if (/PERSONAL_ACCESS_TOKEN|(^|[^A-Z])PAT_TOKEN|GH_PAT\b/.test(s)) bad.push(`${f} (PAT-based auth)`);
  }
  bad.length ? fail(`A: personal access token usage found: ${bad.join(', ')}`)
             : pass('A: no personal access tokens (literals or PAT-based auth)');
}
// ── B. Templates use HTTPS App-token, not SSH/deploy key ─────────────────────
{
  const bad = [];
  for (const f of TEMPLATES) {
    const s = read(f);
    if (/git@github\.com[:/].*banza-protocol\/banzami/.test(s)) bad.push(`${f} (ssh remote)`);
    if (/\bssh-keygen\b|IdentityFile|deploy[_-]?key/i.test(s)) bad.push(`${f} (deploy-key mechanism)`);
  }
  // positive: at least one template must use the HTTPS canonical URL + App token.
  const usesHttps = TEMPLATES.some(f => /https:\/\/github\.com\/banza-protocol\/banzami\.git/.test(read(f)))
    && read(WRAPPER).includes('x-access-token');
  (!bad.length && usesHttps)
    ? pass('B: templates use HTTPS App-token (no SSH/deploy-key for the canonical repo)')
    : fail(`B: templates must use HTTPS App-token, not SSH/deploy keys${bad.length ? ': ' + bad.join(', ') : ''}`);
}
// ── C. No stale banzami/banzami redirect / alias in the executable templates ─
{
  const bad = TEMPLATES.filter(f => /banzami\/banzami|github\.com-banzami/.test(read(f)));
  bad.length ? fail(`C: stale banzami/banzami redirect referenced in template(s): ${bad.join(', ')}`)
             : pass('C: no stale banzami/banzami redirect / SSH alias in the templates');
}
// ── D. No App-token persisted in a Git remote URL ────────────────────────────
{
  const bad = [];
  for (const f of TEMPLATES) {
    const s = read(f);
    // a token embedded in an https remote: https://x-access-token:...@ or https://<tok>@github
    if (/https:\/\/x-access-token:[^@\s"']+@github/.test(s)) bad.push(`${f} (token-in-URL)`);
    if (/git\s+remote\s+set-url[^\n]*@github/.test(s)) bad.push(`${f} (remote set-url with credential)`);
  }
  // positive: the wrapper must verify no token persisted in .git/config
  const verifies = /\.git\/config/.test(read(WRAPPER)) && /x-access-token|ghs_/.test(read(WRAPPER));
  (!bad.length && verifies)
    ? pass('D: no token persisted in a Git remote; wrapper verifies a tokenless .git/config')
    : fail(`D: token must never be persisted in a Git remote${bad.length ? ': ' + bad.join(', ') : ' (missing tokenless verification)'}`);
}
// ── E. No GitHub App credentials in Docker Compose / runtime services ────────
{
  const tracked = execSync('git ls-files', { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
  const composes = tracked.filter(f => /docker-compose[^/]*\.ya?ml$|compose[^/]*\.ya?ml$/i.test(f));
  const re = /GH_APP_PRIVATE_KEY|GITHUB_APP_PRIVATE_KEY|GH_APP_INSTALLATION|INSTALL_TOKEN|github-app.*(key|token)/i;
  const bad = composes.filter(f => re.test(read(f)));
  bad.length ? fail(`E: GitHub App credentials referenced by compose/runtime: ${bad.join(', ')}`)
             : pass(`E: no GitHub App credentials in Docker Compose / runtime services (${composes.length} scanned)`);
}
// ── F. Documented App permission set grants no write/admin ───────────────────
{
  const doc = read(DOC);
  const m = doc.match(/app-permissions:begin\s*([\s\S]*?)\s*app-permissions:end/);
  if (!m) { fail('F: machine-readable app-permissions block missing from the doc'); }
  else {
    let perms;
    try { perms = JSON.parse(m[1].trim()); } catch { perms = null; }
    if (!perms || typeof perms !== 'object') fail('F: app-permissions block is not valid JSON');
    else {
      const entries = Object.entries(perms);
      const writes = entries.filter(([, v]) => /write|admin/i.test(String(v)));
      const hasContentsRead = /^read$/i.test(String(perms.Contents || ''));
      const hasMetadataRead = /^read$/i.test(String(perms.Metadata || ''));
      const allReadOrNone = entries.every(([, v]) => /^(read|none)$/i.test(String(v)));
      (writes.length === 0 && hasContentsRead && hasMetadataRead && allReadOrNone)
        ? pass('F: documented App permissions are Contents:read + Metadata:read only (no write/admin)')
        : fail(`F: documented App permission set must be read-only Contents+Metadata (writes: ${writes.map(w => w[0]).join(',') || 'none'})`);
    }
  }
}

if (failures) { console.log(`\n✗ github-app source-access plan: ${failures} violation(s)`); process.exit(1); }
console.log('\n✓ github-app source-access plan: clean (least-privilege, read-only, no credential leakage)');
