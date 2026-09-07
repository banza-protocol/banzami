/**
 * The payer surface must say Banzami, never BANZA.
 *
 * BANZA is the protocol; Banzami is the operator whose product a payer is
 * looking at (BANZA ADR-002, CLAUDE.md §15.2). On the hosted checkout the
 * distinction is not academic: the page says "Pagamento seguro Banzami" and
 * "Abrir app Banzami", and the wordmark on the amount card said BANZA — naming
 * the protocol at the one person in the system who has no reason to know it
 * exists.
 *
 * This looks only at text a payer can read. The protocol name is legitimate in
 * wire contracts that BANZA defines and that must not be renamed:
 * `banza-signature`, `BANZA_WEBHOOK_SECRET`, `BANZA_API_KEY`, and the
 * `banzami://` scheme is a different word entirely.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('../apps/pay/', import.meta.url).pathname;

function files(dir) {
  return readdirSync(dir).flatMap((e) => {
    const p = join(dir, e);
    if (e === 'node_modules' || e === '.next') return [];
    if (statSync(p).isDirectory()) return files(p);
    return /\.(tsx?|mdx?)$/.test(e) ? [p] : [];
  });
}

// A standalone BANZA — not BANZAMI, not part of an identifier, env var or header.
const BARE = /(?<![A-Za-z0-9_-])BANZA(?![A-Za-z0-9_-])/g;
const ALLOWED_CONTEXT = /banza-signature|BANZA_[A-Z_]+|ADR-\d/i;

/**
 * Blank out comments, keeping line numbers.
 *
 * A comment explaining this very rule has to be able to write the word. Only
 * what ships to the browser is in scope, so block and line comments are erased
 * before the scan rather than pattern-matched around.
 */
function code(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + ' '.repeat(m.length - p.length));
}

let failures = 0;
for (const f of files(ROOT)) {
  code(readFileSync(f, 'utf8')).split('\n').forEach((line, i) => {
    if (!BARE.test(line)) return;
    BARE.lastIndex = 0;
    if (ALLOWED_CONTEXT.test(line)) return;
    failures += 1;
    console.log(`  FAIL  ${f.replace(ROOT, 'apps/pay/')}:${i + 1}  ${line.trim().slice(0, 100)}`);
  });
}

console.log(failures === 0
  ? '  PASS  the payer surface names Banzami, not the protocol'
  : `\n${failures} occurrence(s) of the protocol name on a page a payer reads.`);
process.exit(failures === 0 ? 0 : 1);
