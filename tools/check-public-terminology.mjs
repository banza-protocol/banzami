/**
 * PUBLIC TERMINOLOGY GUARD — the internal term "Financial Live" must never reach
 * a public-facing Banzami surface. Public copy names the concept descriptively:
 *   PT: "operações com dinheiro real"   EN: "real-money operations"
 *
 * Internal machine contracts are intentionally NOT forbidden and stay as they are
 * (feature flags, enums, env vars, DB values, metrics): FINANCIAL_LIVE,
 * FinancialLive, financial_live, financial-live. This guard therefore matches
 * only the SPACE-separated human phrase ("financial live"), never an identifier,
 * and it scans rendered copy — comments (never shown to a user) are stripped
 * before matching, so a comment that explains the normalization does not trip it.
 *
 * Scope: the current public-facing surfaces only. History, ADRs, migrations,
 * evidence, changelogs and internal docs are out of scope by design (they record
 * the term as it was) — this guard deliberately does not scan them.
 *
 *   node tools/check-public-terminology.mjs
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.BZ_PUBLIC_TERMINOLOGY_ROOT ?? resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const abs = (p) => join(ROOT, p);

// The forbidden public phrase: the two words with whitespace between them, in any
// case. "financial-live" / "financial_live" / "FinancialLive" (identifiers) do
// NOT match — only the human, space-separated brand phrase does.
const FORBIDDEN = /\bfinancial[ \t ]+live\b/i;

// Remove content a viewer never sees, so only rendered copy is judged.
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, ' ')   // /* block */ and {/* jsx block */}
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1'); // // line (leave http:// alone)

const walk = (dir, exts) => {
  const root = abs(dir);
  if (!existsSync(root)) return [];
  if (statSync(root).isFile()) return [dir];
  return readdirSync(root, { recursive: true }).map(String)
    .filter((f) => exts.test(f) && !/\.test\.|\.spec\.|node_modules/.test(f))
    .map((f) => `${dir}/${f}`);
};

const CODE = /\.(tsx?|jsx?|dart|html)$/;
const DATA = /\.(json|txt|md)$/;

// Every current public-facing surface across the ecosystem. Documentation and the
// developer Console live inside apps/website; the published SDK docs and the other
// product shells are listed explicitly.
const SURFACE = [
  // banzami.com + developers.banzami.com (marketing, docs, Console, legal, public JSON)
  ...walk('apps/website/app', CODE),
  ...walk('apps/website/components', CODE),
  ...walk('apps/website/lib', CODE),
  'apps/website/public/llms.txt',
  ...walk('apps/website/public/developers', DATA),
  // pay.banzami.com · admin.banzami.com · app.banzami.com (Flutter web shell)
  ...walk('apps/pay/components', CODE),
  ...walk('apps/pay/app', CODE),
  ...walk('apps/admin/app', CODE),
  'apps/mobile/web/index.html',
  // published SDK docs (npm)
  'sdk/typescript/README.md',
].filter((f) => existsSync(abs(f)));

const offenders = [];
for (const f of SURFACE) {
  const raw = readFileSync(abs(f), 'utf8');
  const text = CODE.test(f) ? stripComments(raw) : raw;
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    if (FORBIDDEN.test(line)) offenders.push(`${relative(ROOT, abs(f))}:${i + 1}: ${line.trim().slice(0, 120)}`);
  });
}

console.log(`PUBLIC_TERMINOLOGY_FILES_SCANNED=${SURFACE.length}`);
console.log(`PUBLIC_FINANCIAL_LIVE_OCCURRENCES=${offenders.length}`);
for (const o of offenders.slice(0, 50)) console.log(`  ✗ ${o}`);
if (offenders.length) {
  console.log('\nPUBLIC_TERMINOLOGY=FAIL');
  console.log('Public copy must say "operações com dinheiro real" / "real-money operations", not "Financial Live".');
  console.log('Internal identifiers (FINANCIAL_LIVE, financial_live, …) are allowed and are not matched.');
  process.exit(1);
}
console.log('PUBLIC_TERMINOLOGY=PASS');
console.log('\n✓ no public surface names the internal term "Financial Live"');
