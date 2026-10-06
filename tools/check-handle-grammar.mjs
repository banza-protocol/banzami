#!/usr/bin/env node
// Guard: ONE canonical @banza grammar across every creation path (Consumer AND
// Business). A handle must never be valid for one party type and invalid for the
// other.
//
// Canonical grammar: 3-30 chars, ASCII lowercase, starts with a letter, ends
// alphanumeric, only [a-z0-9_], no consecutive underscores. Literal:
//     ^[a-z][a-z0-9_]{1,28}[a-z0-9]$   (+ an explicit `__` rejection)
//
// Fails CI when a creation path is missing the canonical literal, or still
// carries a divergent one (digit-start `[a-z0-9]...`, or the old 3-20 `{2,19}`).
//
// The Rust Core authority (core/identity/src/identity.rs validate_handle) is
// checked structurally (3..=30, starts a..z). Read-only.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const CANONICAL = String.raw`^[a-z][a-z0-9_]{1,28}[a-z0-9]$`;

// Every creation/validation path that must carry the canonical regex literal.
const REGEX_FILES = [
  'services/public-api/internal/handler/onboarding.go',
  'services/api-gateway/internal/service/merchant_credentials.go',
  'apps/website/lib/api.ts',
  'apps/mobile/lib/screens/onboarding/create_account_screen.dart',
  'apps/mobile/lib/merchant/screens/onboarding/login_screen.dart',
];

// Divergent patterns that must not reappear anywhere in those files.
const FORBIDDEN = [
  String.raw`[a-z0-9][a-z0-9_]{1,28}[a-z0-9]`, // digit-start business grammar
  String.raw`[a-z][a-z0-9_]{2,19}`, // old 3-20 consumer grammar
];

const fail = (m) => {
  console.error(`check-handle-grammar: ${m}`);
  process.exit(1);
};
const read = (p) => {
  try {
    return readFileSync(join(repo, p), 'utf8');
  } catch {
    fail(`cannot read ${p}`);
    return '';
  }
};

for (const f of REGEX_FILES) {
  const src = read(f);
  if (!src.includes(CANONICAL)) {
    fail(`${f} is missing the canonical @banza grammar literal ${CANONICAL}`);
  }
  for (const bad of FORBIDDEN) {
    if (src.includes(bad)) fail(`${f} still carries a divergent handle grammar: ${bad}`);
  }
}

// Rust Core authority: validate_handle must bound 3..=30 and start-letter.
const rust = read('core/identity/src/identity.rs');
if (!/len\s*>\s*30/.test(rust) || !/len\s*<\s*3/.test(rust)) {
  fail('core/identity/src/identity.rs validate_handle does not bound length to 3..=30');
}
if (!/is_ascii_lowercase/.test(rust)) {
  fail('core/identity/src/identity.rs validate_handle does not require a letter start');
}

console.log(`check-handle-grammar: OK — one canonical grammar in ${REGEX_FILES.length} paths + Rust Core.`);
