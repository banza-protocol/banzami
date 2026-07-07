#!/usr/bin/env node
/**
 * check-dockerfile.mjs — reproducible, no-global-install Dockerfile lint gate for the
 * Banzami migration-runner. Deterministic, offline, no Docker/hadolint/secret/VM.
 *
 * (A pinned hadolint container — `docker run --rm -i hadolint/hadolint@sha256:...` —
 *  may additionally be run where Docker is available; this repo-contained linter is
 *  the always-available reproducible mechanism and is the gate of record.)
 *
 * Narrow, documented suppressions only. Usage: make check-dockerfile-lint
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../..');
const DF = resolve(ROOT, 'infra/blueprint/migration-runner/Dockerfile');
const df = readFileSync(DF, 'utf8');
let failures = 0;
const pass = (id, m) => console.log(`  ✓ ${id} ${m}`);
const fail = (id, m) => { console.error(`  ✗ ${id} ${m}`); failures++; };

const baseArgs = [...df.matchAll(/^ARG\s+(RUST_BUILDER|RUNTIME_BASE)=(\S+)/gm)].map(m => m[2]);
const SECRET = /(postgres(ql)?|mysql):[/][/][^/\s]+:[^@\s]+@|-----BEGIN[A-Z ]+PRIVATE KEY-----|\b(PASSWORD|SECRET|TOKEN)[A-Z0-9_]*\s*[:=]\s*[A-Za-z0-9][A-Za-z0-9+/=]{11,}/i;

// L1 no mutable :latest
!/:latest\b/.test(df) ? pass('L1', 'no mutable :latest tag') : fail('L1', 'must not use :latest');
// L2 base images digest-pinned (tag@sha256:64hex)
(baseArgs.length >= 2 && baseArgs.every(a => /@sha256:[0-9a-f]{64}\b/.test(a)))
  ? pass('L2', 'base images pinned by @sha256 digest') : fail('L2', 'base images must be digest-pinned');
// L3 runs as a non-root USER
(/^USER\s+(?!root\b|0\b)\S+/m.test(df)) ? pass('L3', 'runs as a non-root USER') : fail('L3', 'must set a non-root USER');
// L4 no ADD from a URL
!/^\s*ADD\s+https?:\/\//im.test(df) ? pass('L4', 'no ADD from a URL') : fail('L4', 'do not ADD from a URL');
// L5 apt-get install hygiene (--no-install-recommends + cache cleanup)
{
  const hasInstall = /apt-get\s+install/.test(df);
  const ok = !hasInstall || (/--no-install-recommends/.test(df) && /rm\s+-rf\s+\/var\/lib\/apt\/lists/.test(df));
  ok ? pass('L5', 'apt-get install uses --no-install-recommends and cleans lists') : fail('L5', 'apt-get install must use --no-install-recommends and clean lists');
}
// L6 no secret-like literal
!SECRET.test(df) ? pass('L6', 'no secret-like literal in the Dockerfile') : fail('L6', 'no secret may appear in the Dockerfile');
// L7 pinned build-tool version (exact x.y.z)
/ARG\s+SQLX_CLI_VERSION=[0-9]+\.[0-9]+\.[0-9]+\b/.test(df) ? pass('L7', 'SQLX_CLI_VERSION pinned to an exact version') : fail('L7', 'SQLX_CLI_VERSION must be pinned');
// L8 no curl|bash / wget|sh pipe and no sudo
!/(curl|wget)[^\n]*\|\s*(sh|bash)\b/.test(df) && !/\bsudo\b/.test(df) ? pass('L8', 'no pipe-to-shell installer and no sudo') : fail('L8', 'no pipe-to-shell / sudo');

if (failures) { console.log(`\n✗ Dockerfile lint: ${failures} rule(s) failed`); process.exit(1); }
console.log('\n✓ Dockerfile lint: all rules pass (L1–L8)');
