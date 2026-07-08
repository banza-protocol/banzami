// Phase 0 evidence sanitisation checker.
// Scans a directory for forbidden sensitive patterns. Exit non-zero if any found.
// Forbidden: IPs, credentialed URLs, private keys, JWTs, obvious API keys, SSH
// details, private paths, and real-identifier markers. Synthetic placeholders
// (explicitly prefixed SYNTHETIC-) are allowed.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const PATTERNS = [
  [/\b(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\b/, 'IPv4 address'],
  [/(postgres(ql)?|mysql|redis|https?):\/\/[^/\s"']*:[^@/\s"']+@/i, 'credentialed URL'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'private key'],
  [/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, 'JWT'],
  [/\b(sk|bz|pk)_(live|test)_[A-Za-z0-9]{12,}/, 'API key'],
  [/ssh\s+-\S+\s|ssh\s+[A-Za-z0-9._-]+@/, 'SSH detail'],
  [/\/(opt|root|home|Users)\/[A-Za-z0-9._-]+/, 'private path'],
  [/root@[A-Za-z0-9._-]+/, 'host login'],
];

function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.(md|json)$/.test(e)) out.push(p);
  }
  return out;
}

export function sanitiseDir(dir) {
  const findings = [];
  for (const f of walk(dir)) {
    const text = readFileSync(f, 'utf8');
    for (const [re, label] of PATTERNS) {
      const m = text.match(re);
      if (m) findings.push({ file: f.replace(dir, 'evidence/phase0'), issue: label });
    }
  }
  return findings;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = process.argv[2];
  if (!dir) {
    console.error('usage: node sanitise.mjs <dir>');
    process.exit(2);
  }
  const findings = sanitiseDir(dir);
  if (findings.length) {
    console.error('SANITISATION FAILED:');
    for (const x of findings) console.error(`  ${x.file}: ${x.issue}`);
    process.exit(1);
  }
  console.log('SANITISATION: clean');
}
