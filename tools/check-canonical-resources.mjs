#!/usr/bin/env node
/**
 * Everything active on the Sandbox, against everything declared canonical.
 *
 * Residue does not announce itself. 267 workspaces nobody could reach, a dozen
 * fixture identities and eight stranded payee bindings all survived by being
 * things nobody had a reason to look at. The counters that caught them were
 * written after the fact and pointed at shapes already known to be wrong.
 *
 * This inverts that. ops/canonical-resources.yaml names every identity,
 * workspace, project and key that is allowed to be active and says who owns it
 * and why it must exist; anything active and unnamed is a failure. A resource
 * cannot survive by being forgotten, because being forgotten is the failure.
 *
 * It reads the live Sandbox — names, owners and states only, never key material.
 *
 *   node tools/check-canonical-resources.mjs
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const REMOTE = process.env.BANZAMI_REMOTE ?? 'root@217.160.9.248';

const doc = readFileSync(resolve(ROOT, 'ops/canonical-resources.yaml'), 'utf8');

/** The declared names per section, and the required fields on each entry. */
const REQUIRED = ['resource', 'owner', 'purpose', 'why_now', 'classification', 'authority', 'lifetime'];
function declared(section) {
  const body = doc.split(new RegExp(`\\n${section}:\\n`))[1];
  if (body === undefined) return null;
  const stop = body.search(/\n[a-z_]+:\n/);
  const chunk = stop === -1 ? body : body.slice(0, stop);
  // The leading entry has no newline before it, so split on a normalised copy —
  // without this the first entry of every section is silently dropped, and the
  // gate reports the thing it is most confident about as unclassified.
  const entries = `\n${chunk}`.split(/\n  - /).slice(1);
  return entries.map((e) => {
    const name = /^resource:\s*(.+)/.exec(e)?.[1]?.trim();
    const missing = REQUIRED.filter((f) => !new RegExp(`(^|\\n)\\s*${f}:`).test(`resource: ${e}`));
    return { name, missing };
  });
}

let failures = 0;
const fail = (m) => { console.error(`  ✗ ${m}`); failures += 1; };
const pass = (m) => console.log(`  ✓ ${m}`);

// The live side. Single ssh call; psql literals are built with chr() so no
// quoting survives two shells and changes meaning.
const A = "chr(65)||chr(67)||chr(84)||chr(73)||chr(86)||chr(69)";
const script = `
set -u
P=$(docker ps --format '{{.Names}}' | grep -m1 'bzsandbox-.*-core-api-staging' | sed -E 's/-core-api-staging$//')
PG="$P-postgres-1"; CORE="$P-core-api-staging"
PW=$(docker exec "$CORE" sh -c 'cat /run/secrets/db_url' | sed -E 's#.*://[^:]+:([^@]+)@.*#\\1#')
q(){ docker exec -e PGPASSWORD="$PW" "$PG" psql -U bl_app_runtime -d banzami_staging -At -F'|' -c "$1" 2>/dev/null; }
echo "--identities"
q "select email from account_identity.identity_users where status = ${A}"
echo "--workspaces"
q "select name from developer.dev_workspaces where status = ${A}"
echo "--projects"
q "select name from developer.dev_projects where status = ${A}"
echo "--keys"
q "select name from developer.dev_api_keys where status = ${A}"
echo "--unsealed"
q "select count(*) from developer.dev_project_sandbox_binding b join developer.dev_projects p on p.id = b.project_id where b.state = ${A} and b.artifact_created = false and p.status <> ${A}"
`;

const out = execFileSync('ssh', [REMOTE, 'bash', '-s'], { input: script, encoding: 'utf8', maxBuffer: 1 << 24 });
const live = {};
let key = null;
for (const line of out.split('\n')) {
  if (line.startsWith('--')) { key = line.slice(2); live[key] = []; continue; }
  if (key && line.trim()) live[key].push(line.trim());
}

console.log(`canonical resources — SANDBOX, ${new Date().toISOString()}\n`);

const SECTIONS = [
  ['identities', 'IDENTITIES'],
  ['workspaces', 'WORKSPACES'],
  ['projects', 'PROJECTS'],
  ['keys', 'KEYS'],
];

for (const [section, label] of SECTIONS) {
  const decl = declared(section);
  if (decl === null) { fail(`ops/canonical-resources.yaml has no "${section}" section`); continue; }

  // Every declaration must actually classify: a name with no owner or no reason
  // is a list, not a classification.
  for (const d of decl) {
    if (d.missing.length) fail(`${section}: "${d.name}" is missing ${d.missing.join(', ')}`);
  }

  const names = new Set(decl.map((d) => d.name));
  const actual = live[section] ?? [];
  const unclassified = actual.filter((n) => !names.has(n));
  const declaredGone = [...names].filter((n) => !actual.includes(n));

  console.log(`\n── ${label} — ${actual.length} active, ${names.size} declared ──`);
  unclassified.length
    ? fail(`UNCLASSIFIED_ACTIVE_${label} = ${unclassified.length}: ${unclassified.join(', ')}`)
    : pass(`UNCLASSIFIED_ACTIVE_${label} = 0`);
  // A declaration for something that no longer exists is stale, not dangerous —
  // reported so the file stays true, and it does not fail the gate.
  if (declaredGone.length) console.log(`  · declared but no longer active (stale entry): ${declaredGone.join(', ')}`);
}

console.log('\n── BINDINGS ──');
const unsealed = Number(live.unsealed?.[0] ?? -1);
unsealed === 0
  ? pass('no UNSEALED binding is left ACTIVE on an archived project')
  : fail(`${unsealed} unsealed binding(s) still ACTIVE on archived projects — retire those projects through /internal/v1/projects/{id}/retire`);

if (failures) { console.error(`\n✗ ${failures} classification failure(s)`); process.exit(1); }
console.log('\n✓ everything active on the Sandbox is declared canonical, with an owner and a reason');
