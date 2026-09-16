#!/usr/bin/env node
/**
 * DOCS-TRUTH-PREMIUM-001 — documentation truth guard.
 *
 * A fast, high-signal grep gate that fails the build if public copy or docs
 * reintroduce a claim the product has moved past. It is deliberately narrow:
 * only unambiguous, product-copy-level violations, so it never fights a doc that
 * legitimately explains the correct model. Complements PUBLIC_TRUTH /
 * check-public-site-truth.mjs (status facts) with terminology/claim truth.
 *
 *   node tools/check-doc-truth.mjs
 *   make check-doc-truth
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;

// Directories scanned for public-facing / current documentation copy.
const SCAN_DIRS = ['apps/website/app', 'apps/website/components', 'apps/website/public', 'docs', 'README.md'];
// Never scan generated, vendored, or genuinely-historical evidence.
const SKIP = [
  'node_modules', '.next', 'dist', 'build', '.git',
  'docs/readiness', 'docs/audit', 'docs/quality/REPAIR_LOG.md', 'docs/validation',
  // Accepted decision records are preserved history (§18/§79) — the guard enforces
  // current-facing surfaces, it does not rewrite past decisions and their examples.
  'docs/adr', 'docs/rfc',
  'apps/website/app/verificar', // verifier renders live ledger data, not product claims
];
const EXTS = new Set(['.md', '.mdx', '.tsx', '.ts', '.txt', '.json']);

// [pattern, human message, exemptIfLineMatches?]. Case-insensitive. Kept
// unambiguous on purpose; the optional third element skips lines where the
// phrase is used CORRECTLY (e.g. "rail-decoupled, not rail-free").
const FORBIDDEN = [
  [/\brail[-\s]?free\b/i, 'say "rail-decoupled", never "rail-free"', /rail[-\s]?decoupled|not\s+rail[-\s]?free|n[aã]o\s+rail[-\s]?free/i],
  [/bypass(am|amos|ar)?\s+(the\s+)?(banks?|bancos?|emis)\b/i, 'do not claim Banzami bypasses banks/EMIS — they are interoperability rails', /not\s+bypass|does\s+not\s+bypass|n[aã]o\s+.{0,12}bypass|sem\s+contornar/i],
  // The stale CANONICAL PERSONA is identified by its handle, not by the common
  // name "João Silva" (fine as a demo counterparty). Forbid the old handle forms.
  [/@joaosilva\b|@joao\b|\bjoaosilva\b|\bjoao_silva\b|"handle":\s*"joao/i, 'the canonical example persona is @ana / Ana Maria — retire the @joao/joao_silva handle'],
  [/nome\s+opcional/i, 'the declared full name is REQUIRED, not optional'],
  [/nome\s+conforme\s+(o\s+)?documento/i, 'the declared name is user-declared, not verified-from-a-document'],
  [/canvaskit[^.]{0,40}(no dom|cannot|can'?t)\s+(be\s+)?automat/i, 'App Web IS automatable via Flutter Semantics — remove the obsolete claim'],
  [/migra(tion|ç[aã]o)\s+015[12][^.\n]{0,60}(pending|pendente|por aplicar|not (yet )?(applied|validated))/i, '0151/0152 are APPLIED to banzami_staging — remove pending language'],
];

function walk(p, out) {
  const rel = p.slice(ROOT.length);
  if (SKIP.some((s) => rel === s || rel.startsWith(s + '/') || rel.endsWith('/' + s))) return;
  let st;
  try { st = statSync(p); } catch { return; }
  if (st.isDirectory()) {
    for (const e of readdirSync(p)) walk(join(p, e), out);
  } else if (EXTS.has(extname(p))) {
    out.push(p);
  }
}

const files = [];
for (const d of SCAN_DIRS) walk(join(ROOT, d), files);
// The guard itself and this milestone's own spec legitimately quote the phrases.
const SELF = ['tools/check-doc-truth.mjs'];

const violations = [];
for (const f of files) {
  const rel = f.slice(ROOT.length);
  if (SELF.includes(rel)) continue;
  let text;
  try { text = readFileSync(f, 'utf8'); } catch { continue; }
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    for (const [re, msg, exempt] of FORBIDDEN) {
      if (re.test(line) && !(exempt && exempt.test(line))) {
        violations.push({ rel, line: i + 1, msg, text: line.trim().slice(0, 120) });
      }
    }
  });
}

if (violations.length) {
  console.error(`✗ doc-truth guard: ${violations.length} violation(s)\n`);
  for (const v of violations) console.error(`  ${v.rel}:${v.line} — ${v.msg}\n    > ${v.text}`);
  process.exit(1);
}
console.log(`✓ doc-truth guard: ${files.length} files scanned, no stale product claims.`);
