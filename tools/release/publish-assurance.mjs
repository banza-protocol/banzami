#!/usr/bin/env node
/**
 * Publish generated assurance evidence to a durable store.
 *
 * The harnesses write to a workspace under the system temp directory. That is
 * correct as EXECUTION space — fast, disposable, per-revision — and wrong as a
 * system of record: temp is swept by the OS, and evidence that disappears on
 * reboot cannot support a release claim made a week later.
 *
 * So the ceremony has two steps, and they are different in kind:
 *
 *     run    → <tmpdir>/banzami-assurance/<sha>/…      execution workspace
 *     publish → <store>/<sha>/…                        durable record
 *
 * The store defaults to ~/.banzami/assurance — outside the repository, outside
 * temp, and outside the machine's build scratch. Point BANZAMI_ASSURANCE_STORE
 * at shared or archival storage where that exists.
 *
 * Publication is verified, not assumed: every file is checksummed at the source
 * and re-read at the destination, and an index records what was published, for
 * which revision, with which verdicts. Only after that may the workspace be
 * removed — and this tool never removes it, so a failed publish cannot destroy
 * the only copy.
 *
 *   node tools/release/publish-assurance.mjs --sha <full> [--json]
 */
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const storeRoot = () =>
  process.env.BANZAMI_ASSURANCE_STORE || join(homedir(), '.banzami', 'assurance');

const workspaceRoot = (sha) =>
  join(process.env.BANZAMI_ASSURANCE_ROOT || join(tmpdir(), 'banzami-assurance'), sha);

const sha256 = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');

function walk(dir, base = dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, base, out);
    else if (e.isFile()) out.push(relative(base, p));
  }
  return out;
}

export function publish(sha) {
  const src = workspaceRoot(sha);
  if (!existsSync(src)) throw new Error(`no assurance workspace for ${sha} at ${src}`);

  const dest = join(storeRoot(), sha);
  mkdirSync(dest, { recursive: true });

  const files = walk(src);
  if (files.length === 0) throw new Error(`assurance workspace for ${sha} is empty`);

  const published = [];
  for (const rel of files) {
    const from = join(src, rel), to = join(dest, rel);
    mkdirSync(join(to, '..'), { recursive: true });
    const before = sha256(from);
    copyFileSync(from, to);
    // Re-read at the destination. A copy that reports success and lands
    // truncated is exactly what a full disk produces.
    if (sha256(to) !== before) throw new Error(`checksum mismatch after copy: ${rel}`);
    published.push({ file: rel, sha256: before, bytes: statSync(to).size });
  }

  // Summarise the verdicts so the index is readable without opening every file.
  const suites = [];
  for (const rel of files.filter((f) => f.endsWith('.json'))) {
    try {
      const r = JSON.parse(readFileSync(join(dest, rel), 'utf8'));
      if (r.schema === 'banzami-assurance-result/v1') {
        suites.push({ suite: r.suite_slug, verdict: r.verdict, pass: r.pass, fail: r.fail,
                      blocked: r.blocked, simulated: r.simulated, runtime_sha: r.runtime_sha });
      }
    } catch { /* not a result envelope */ }
  }

  const durability = proveDurable(dest);
  const index = {
    schema: 'banzami-assurance-index/v2',
    candidate_sha: sha,
    published_at: new Date().toISOString(),
    store: dest,
    durability,
    files: published,
    suites,
    // A blocked or failing suite must be visible here, not buried in a file.
    verdict: suites.length > 0 && suites.every((s) => s.verdict === 'PASS') ? 'PASS' : 'FAIL',
    simulated_total: suites.reduce((n, s) => n + (s.simulated ?? 0), 0),
    blocked_total: suites.reduce((n, s) => n + (s.blocked ?? 0), 0),
  };
  writeFileSync(join(dest, 'index.json'), JSON.stringify(index, null, 2) + '\n');
  return index;
}

/**
 * Durability, proven rather than asserted.
 *
 * The field names are deliberately unambiguous. An earlier report rendered
 * `outside_tmp: true` as "fora do /tmp: NAO" — a human inversion in release
 * provenance, which is worse than a missing field because it reads as evidence.
 * Both the positive and the negative form are emitted so no reader has to
 * mentally negate anything, and containment is decided by real path comparison
 * rather than string prefixes, which `/tmpfoo` would defeat.
 */
export function proveDurable(dest) {
  const real = (p) => { try { return realpathSync(p); } catch { return resolve(p); } };
  const under = (child, parent) => {
    const c = real(child), p = real(parent);
    return c === p || c.startsWith(p.endsWith(sep) ? p : p + sep);
  };
  const path = real(dest);
  const tmpRoots = [process.env.TMPDIR || tmpdir(), '/tmp', '/private/tmp'].filter(Boolean);
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

  const inside_tmpdir = tmpRoots.some((t) => under(path, t));
  const inside_repository = under(path, repoRoot);

  return {
    path,
    repository_root: real(repoRoot),
    tmpdir_roots: tmpRoots.map(real),
    inside_tmpdir,
    inside_repository,
    durable_outside_tmpdir: !inside_tmpdir,
    durable_outside_repository: !inside_repository,
    durable: !inside_tmpdir && !inside_repository,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const i = process.argv.indexOf('--sha');
  if (i === -1) { console.error('usage: publish-assurance.mjs --sha <full-sha>'); process.exit(2); }
  const sha = process.argv[i + 1];
  const index = publish(sha);
  const d = proveDurable(index.store);

  if (process.argv.includes('--json')) { console.log(JSON.stringify({ index, durability: d }, null, 2)); }
  else {
    console.log(`\n▸ assurance published for ${sha}`);
    console.log(`  store        ${index.store}`);
    console.log(`  files        ${index.files.length} (checksum verified at destination)`);
    for (const s of index.suites) {
      console.log(`  ${String(s.suite).padEnd(30)} ${s.verdict}  ${s.pass}/${s.pass + s.fail}` +
                  `${s.simulated ? `  simulated=${s.simulated}` : ''}${s.blocked ? `  blocked=${s.blocked}` : ''}`);
    }
    console.log(`  inside tmpdir      ${d.inside_tmpdir}`);
    console.log(`  inside repository  ${d.inside_repository}`);
    console.log(`  durable            outside tmpdir: ${d.durable_outside_tmpdir} · outside repository: ${d.durable_outside_repository}`);
    console.log(`  verdict      ${index.verdict}\n`);
  }
  process.exit(d.durable ? 0 : 1);
}
