/**
 * Gate reporter + secret-safe evidence writer.
 *
 * Records named acceptance gates (the milestone's PASS/FAIL tokens), prints
 * them, and writes a JSON artifact. It NEVER accepts or stores secret values
 * (PIN, OTP, key, Bearer): callers pass booleans and non-secret detail only, and
 * `scrub()` is available to strip anything credential-shaped from free text
 * before it is recorded (E2E_SECRET_EVIDENCE_LEAKAGE=0).
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

// Patterns for values that must never reach an artifact.
const SECRET_PATTERNS = [
  /bz_(test|live)_sk_[A-Za-z0-9]+/g,     // secret API keys
  // A bare 6-digit PIN/OTP, but NOT a 6-digit ledger amount tagged with its unit
  // (e.g. "750000 minor", "7500 Kz"). PINs never enter detail strings by
  // construction; this is defence-in-depth without shredding financial evidence.
  /\b\d{6}\b(?!\s*(?:minor|Kz|kz|AOA))/g,
  /Bearer\s+[A-Za-z0-9._-]+/gi,           // bearer tokens
  /__Host-bz_[a-z_]+=[^;\s]+/g,           // session cookies
];

export function scrub(text) {
  let s = String(text ?? '');
  for (const re of SECRET_PATTERNS) s = s.replace(re, '‹redacted›');
  return s;
}

export class GateReport {
  constructor(name) {
    this.name = name;
    this.gates = [];
    this.started = new Date().toISOString();
  }

  /** Record a gate. `detail` is scrubbed defensively. */
  mark(gate, pass, detail = '') {
    const clean = scrub(detail).slice(0, 300);
    this.gates.push({ gate, verdict: pass ? 'PASS' : 'FAIL', detail: clean });
    const sym = pass ? '✓' : '✗';
    (pass ? console.log : console.error)(`  ${sym} ${gate}${clean ? ` — ${clean}` : ''}`);
    return pass;
  }

  /** A gate whose token is a literal value (e.g. COUNT=0). */
  note(token, detail = '') {
    console.log(`  · ${token}${detail ? ` — ${scrub(detail).slice(0, 200)}` : ''}`);
    this.gates.push({ gate: token, verdict: 'NOTE', detail: scrub(detail).slice(0, 200) });
  }

  get passed() { return this.gates.filter((g) => g.verdict === 'PASS').length; }
  get failed() { return this.gates.filter((g) => g.verdict === 'FAIL').length; }
  get ok() { return this.failed === 0; }

  write(dir) {
    const out = join(dir, `${this.name}-${Date.now()}.json`);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, `${JSON.stringify({
      name: this.name, started: this.started, finished: new Date().toISOString(),
      passed: this.passed, failed: this.failed, gates: this.gates,
    }, null, 2)}\n`);
    return out;
  }
}

/** A run-scoped 6-digit PIN kept only in memory; never returned to any logger. */
export function runScopedPin() {
  return String(Math.floor(100000 + Math.random() * 899999));
}

/** A fresh disposable @banza handle for this run. */
export function freshHandle(prefix = 'e2e') {
  return prefix + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);
}
