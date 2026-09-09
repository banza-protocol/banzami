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
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, relative } from 'node:path';

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

  const index = {
    schema: 'banzami-assurance-index/v1',
    candidate_sha: sha,
    published_at: new Date().toISOString(),
    store: dest,
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

/** Durability, proven rather than asserted: not in the repo, not under temp. */
export function proveDurable(dest) {
  const t = process.env.TMPDIR || tmpdir();
  const inTemp = dest.startsWith(t) || dest.startsWith('/tmp/') || dest.startsWith('/private/tmp/');
  const inRepo = dest.includes('/banzami/evidence') || dest.includes('/banzami/tools');
  return { path: dest, outside_tmp: !inTemp, outside_repo: !inRepo, durable: !inTemp && !inRepo };
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
    console.log(`  durable      outside tmp: ${d.outside_tmp} · outside repo: ${d.outside_repo}`);
    console.log(`  verdict      ${index.verdict}\n`);
  }
  process.exit(d.durable ? 0 : 1);
}
