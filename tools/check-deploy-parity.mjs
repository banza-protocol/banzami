#!/usr/bin/env node
/**
 * What is deployed, against what is committed.
 *
 * "Deployed at the right SHA" was checked by reading image tags, and image tags
 * lie in both directions: website-frontend is tagged `:latest` and carries its
 * revision in a label instead, and a service whose tag is two commits old may be
 * running byte-identical code because the only thing that changed was a test.
 *
 * So this asks the question that matters — does any file that ends up INSIDE the
 * artefact differ between the revision a container was built from and HEAD — and
 * names the files when the answer is yes. Test files and package.json scripts are
 * excluded because neither reaches a built binary or bundle; everything else
 * counts, including a comment, because a comment that differs means the source
 * tree differs and the next rebuild will not be a no-op.
 *
 *   node tools/check-deploy-parity.mjs
 */
import { execFileSync } from 'node:child_process';

const REMOTE = process.env.BANZAMI_REMOTE ?? 'root@217.160.9.248';

// Deployed component → the source it is built from. `common` is vendored into
// every Go service, so a change there is a change to all of them.
const COMPONENTS = [
  { container: 'developer-api', paths: ['services/developer-api', 'services/common'] },
  { container: 'api-gateway-staging', paths: ['services/api-gateway', 'services/common'] },
  { container: 'admin-api', paths: ['services/admin-api', 'services/common'] },
  { container: 'public-api-staging', paths: ['services/public-api', 'services/common'] },
  { container: 'core-api-staging', paths: ['core'] },
  { container: 'admin-frontend', paths: ['apps/admin'] },
  { container: 'pay-frontend', paths: ['apps/pay'] },
  { container: 'banzami-website-frontend-1', paths: ['apps/website'], name: 'website-frontend' },
];

// Files that exist in the tree and never in the artefact.
const NOT_SHIPPED = /(_test\.(go|rs)|_tests\.rs|\.test\.(ts|tsx|mjs)|\.selftest\.mjs|\/package\.json$|\/__tests__\/)/;

const sh = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8', maxBuffer: 1 << 24 }).trim();
let failures = 0;
const fail = (m) => { console.error(`  ✗ ${m}`); failures += 1; };
const pass = (m) => console.log(`  ✓ ${m}`);

const HEAD = sh('git', ['rev-parse', 'HEAD']);
// Against the WORKING TREE, not against HEAD. Comparing two commits says nothing
// about a change that is written but not committed, and an uncommitted edit to a
// deployed service is exactly the state where "it's deployed" stops being true.
const dirty = sh('git', ['status', '--porcelain']).length > 0;
console.log(`deploy parity — HEAD ${HEAD.slice(0, 8)}${dirty ? ' (working tree has uncommitted changes; they count)' : ''}\n`);

// One ssh call: every running container's name and the revision it was built from.
const revisions = new Map();
for (const line of sh('ssh', [REMOTE, `docker ps --format '{{.Names}}' | while read c; do printf '%s\\t%s\\n' "$c" "$(docker inspect -f '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$c" 2>/dev/null)"; done`]).split('\n')) {
  const [name, rev] = line.split('\t');
  if (name) revisions.set(name.replace(/^bzsandbox-[0-9-]+-/, ''), (rev ?? '').trim());
}

for (const c of COMPONENTS) {
  const label = c.name ?? c.container;
  let rev = revisions.get(c.container);
  if (rev === undefined) { fail(`${label}: no running container named ${c.container}`); continue; }

  // A container without the label predates it; fall back to the image tag, which
  // the sandbox deploy writes as the commit.
  if (!rev) {
    const tag = sh('ssh', [REMOTE, `docker inspect -f '{{.Config.Image}}' $(docker ps --format '{{.Names}}' | grep -m1 ${c.container})`]);
    rev = (tag.split(':').pop() ?? '').trim();
  }
  if (!/^[0-9a-f]{8,40}$/.test(rev)) { fail(`${label}: cannot tell what revision it was built from (${rev || 'no label, no sha tag'})`); continue; }

  let changed;
  try {
    changed = sh('git', ['diff', '--name-only', rev, '--', ...c.paths]).split('\n').filter(Boolean);
  } catch {
    fail(`${label}: built from ${rev.slice(0, 8)}, which is not a commit in this repository`);
    continue;
  }
  const shipped = changed.filter((f) => !NOT_SHIPPED.test(f));
  shipped.length === 0
    ? pass(`${label} (${rev.slice(0, 8)}): every file that reaches the artefact matches the tree${changed.length ? ` (${changed.length} test/script file(s) differ and ship in nothing)` : ''}`)
    : fail(`${label} (${rev.slice(0, 8)}): ${shipped.length} shipped file(s) differ from the tree\n      ${shipped.join('\n      ')}`);
}

if (failures) { console.error(`\n✗ ${failures} component(s) are not running this tree's source`); process.exit(1); }
console.log('\n✓ every deployed component is running the source in this tree');
