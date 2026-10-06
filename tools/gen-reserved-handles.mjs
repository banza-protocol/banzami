#!/usr/bin/env node
// Canonical, versioned, testable source for the protected @banza namespace.
//
// This file is the ONE place the protected-handle sets live. The migration
// `db/migrations/0171_handle_namespace_protection.sql` is SEEDED from the output
// of this generator, and `tools/check-reserved-handles.mjs` fails CI if the
// migration ever drifts from it — so the namespace is reproducible on a fresh DB
// and can never silently diverge (the A3-07 split-brain that let a Business apply
// for @bna/@emis). The authority is server-side (the DB `handle_registry`), never
// the apps.
//
// Design rules (binding — see the pre-launch brief):
//   * Protection is by EXPLICIT handles and controlled impersonation combos, never
//     by substring/`contains()` rules that would block legitimate handles.
//   * Every emitted handle must be creatable under the widest creation grammar
//     (the Business grammar) — a name no grammar can produce needs no blocking row.
//   * Categories: internal (platform/security/generic), brand (Banzami/BANZA/
//     BanzAI + impersonation), ecosystem (Angolan payment infrastructure),
//     bank (BNA-authorized institutions — siglas + distinctive tokens only),
//     payment-brand (global networks).
//
// Usage:
//   node tools/gen-reserved-handles.mjs            # print the SQL seed block
//   node tools/gen-reserved-handles.mjs --json     # print {handle,ownerType,category,reason,source}[]
//
// It prints data only; it never writes files or touches a database.

// --- Creation grammar (widest = Business). A protected row only matters if some
// --- real signup could produce the handle. Business: 3-30, alnum start/end,
// --- [a-z0-9_] body. We additionally forbid '__' (consumer rule) for clean seeds.
const BUSINESS_GRAMMAR = /^[a-z0-9][a-z0-9_]{1,28}[a-z0-9]$/;
function creatable(h) {
  return BUSINESS_GRAMMAR.test(h) && !h.includes('__');
}

// --- Provenance strings (stored in handle_registry.protect_source). ---
const SRC_INTERNAL = 'Banzami platform namespace';
const SRC_BRAND = 'Banzami brand protection';
const SRC_ECOSYSTEM = 'Angolan payment ecosystem';
const SRC_BANK = 'BNA authorized banking institutions (ABANC registry)';
const SRC_PAYMENT = 'Global payment networks';

// === 1. INTERNAL reserved — platform, security, generic product words ========
// owner_type SYSTEM, reserved_reason 'reserved'. These are the names a Business
// or Consumer must never take. Superset of migration 0133's list + the brief's
// section-4 list. The Rust core RESERVED_HANDLES array must stay a subset of
// this set (asserted by the guard test).
const INTERNAL = [
  // brand roots live in BRAND (below), not here.
  'admin', 'administrator', 'root', 'system', 'sys', 'operator', 'staff',
  'official', 'verified', 'moderator', 'superuser', 'service', 'ops',
  'support', 'suporte', 'help', 'ajuda',
  'security', 'seguranca', 'privacy', 'privacidade', 'legal', 'compliance',
  'fraud', 'fraude', 'abuse', 'audit',
  'api', 'developer', 'developers', 'dev', 'docs', 'status',
  'webhook', 'webhooks', 'sdk', 'sandbox', 'live',
  'account', 'conta', 'wallet', 'wallets', 'carteira',
  'payment', 'payments', 'pagamento', 'pagamentos', 'pay',
  'transfer', 'transfers', 'transferencia', 'transactions',
  'merchant', 'business', 'consumer', 'customer',
  'billing', 'invoice', 'invoices', 'fatura', 'faturas',
  'mail', 'email', 'www', 'app', 'mobile', 'web',
  'auth', 'login', 'signin', 'signup', 'register',
  'notification', 'notifications', 'notificacoes', 'alert', 'alerts', 'alertas',
  'finance', 'financial', 'bank', 'banco', 'banking',
  'terms', 'termos', 'policy', 'politica',
  // Angola + Kwanza currency words, and the test marker, kept reserved (also in
  // the Rust core RESERVED_HANDLES array — the guard keeps the two in step).
  'angola', 'angolar', 'test',
];

// === 2. BRAND roots — Banzami operator + BANZA/BanzAI ========================
// owner_type PROTECTED, reason 'brand'. Exact names plus controlled
// impersonation combos (see IMPERSONATION below).
const BRAND = ['banzami', 'banza', 'banzai', 'banzamii'];

// === 3. ECOSYSTEM — Angolan payment infrastructure ===========================
const ECOSYSTEM = [
  'bna', 'emis', 'multicaixa', 'multicaixaexpress', 'kwik',
];

// === 4. BANKS — BNA-authorized institutions (via ABANC). Siglas + distinctive
// name tokens ONLY. Deliberately NOT bare common words (sol, mais, valor,
// express) to avoid blocking legitimate handles — impersonation is covered by
// explicit combos instead.
const BANKS = [
  'bai', 'baimicro',            // Banco Angolano de Investimentos / BAI Microfinanças
  'bfa',                        // Banco de Fomento Angola
  'bpc',                        // Banco de Poupança e Crédito
  'bic',                        // Banco BIC
  'bni',                        // Banco de Negócios Internacional
  'bcga',                       // Banco Caixa Geral Angola
  'bci',                        // Banco de Comércio e Indústria
  'bch',                        // Banco Comercial do Huambo
  'bda',                        // Banco de Desenvolvimento de Angola
  'bir',                        // Banco de Investimento Rural
  'bki', 'kwanzainvest',        // Banco Kwanza Invest
  'bma', 'atlantico', 'millennium', // Banco Millennium Atlântico
  'bkv', 'keve',                // Banco Keve
  'bvr',                        // Banco Valor
  'fba', 'finibanco',           // Finibanco Angola
  'bsl', 'bancosol',            // Banco Sol
  'sba', 'standard', 'standardbank', // Standard Bank Angola
  'vtb',                        // Banco VTB África
  'bcs',                        // Banco de Crédito do Sul
  'byt', 'yetu',                // Banco Yetu
  'bancopostal',                // Banco Postal
  'bancomais',                  // Banco Mais
  'economico', 'bancoeconomico',// Banco Económico
  'bankofchina',                // Banco da China (Luanda)
  'bde',                        // legacy sigla kept from 0133
];

// === 5. PAYMENT BRANDS — global networks =====================================
const PAYMENT = ['visa', 'mastercard'];

// === Impersonation combos ====================================================
// Rich suffix set for the brand roots; the narrower official set for ecosystem
// and banks. Forms are explicit and finite (brief section 5): `x_suffix`,
// `xsuffix`, and `suffix_x` for brands; `x_suffix` for entities.
const BRAND_SUFFIXES = [
  'support', 'suporte', 'security', 'seguranca', 'help', 'ajuda',
  'admin', 'official', 'oficial', 'verified', 'verificado',
  'payments', 'pagamentos', 'wallet', 'carteira', 'business',
  'developer', 'api', 'compliance', 'legal',
];
const ENTITY_SUFFIXES = ['official', 'oficial', 'support', 'suporte', 'pagamentos'];

function brandCombos(root) {
  const out = [];
  for (const s of BRAND_SUFFIXES) {
    out.push(`${root}_${s}`, `${root}${s}`, `${s}_${root}`);
  }
  return out;
}
function entityCombos(root) {
  return ENTITY_SUFFIXES.map((s) => `${root}_${s}`);
}

// === Assemble the full set (handle -> entry), first category wins ============
function build() {
  const map = new Map(); // handle -> {ownerType, category, reason, source}
  const add = (handle, ownerType, category, reason, source) => {
    if (!creatable(handle)) return; // skip names no grammar can produce
    if (map.has(handle)) return; // first classification wins (stable precedence)
    map.set(handle, { handle, ownerType, category, reason, source });
  };

  // Precedence: internal, then brand, ecosystem, bank, payment; combos last.
  for (const h of INTERNAL) add(h, 'SYSTEM', 'internal', 'reserved', SRC_INTERNAL);
  for (const h of BRAND) add(h, 'PROTECTED', 'brand', 'brand', SRC_BRAND);
  for (const h of ECOSYSTEM) add(h, 'PROTECTED', 'ecosystem', 'ecosystem', SRC_ECOSYSTEM);
  for (const h of BANKS) add(h, 'PROTECTED', 'bank', 'bank', SRC_BANK);
  for (const h of PAYMENT) add(h, 'PROTECTED', 'payment-brand', 'payment-brand', SRC_PAYMENT);

  // Impersonation combos (PROTECTED, category 'brand-impersonation').
  for (const root of ['banzami', 'banza', 'banzai']) {
    for (const h of brandCombos(root)) add(h, 'PROTECTED', 'brand-impersonation', 'brand', SRC_BRAND);
  }
  for (const root of [...ECOSYSTEM, ...BANKS, ...PAYMENT]) {
    const src = ECOSYSTEM.includes(root) ? SRC_ECOSYSTEM
      : PAYMENT.includes(root) ? SRC_PAYMENT : SRC_BANK;
    for (const h of entityCombos(root)) add(h, 'PROTECTED', 'impersonation', 'impersonation', src);
  }

  return [...map.values()].sort((a, b) => a.handle.localeCompare(b.handle, 'en'));
}

// SQL string literal escape (handles are [a-z0-9_] so this is belt-and-braces).
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

function toSql(rows) {
  const system = rows.filter((r) => r.ownerType === 'SYSTEM');
  const protectedRows = rows.filter((r) => r.ownerType === 'PROTECTED');

  const sysValues = system
    .map((r) => `    (${q(r.handle)}, 'SYSTEM', ${q(r.reason)}, ${q(r.category)}, ${q(r.source)})`)
    .join(',\n');
  const protValues = protectedRows
    .map((r) => `    (${q(r.handle)}, 'PROTECTED', ${q(r.reason)}, ${q(r.category)}, ${q(r.source)})`)
    .join(',\n');

  return `-- @@GENERATED by tools/gen-reserved-handles.mjs — do not edit by hand.
-- Regenerate: node tools/gen-reserved-handles.mjs  (guard: tools/check-reserved-handles.mjs)

-- Internal reserved names stay SYSTEM (unowned). DO NOTHING never displaces an
-- owner and never downgrades a name already PROTECTED.
INSERT INTO handle_registry (handle, owner_type, reserved_reason, protect_category, protect_source) VALUES
${sysValues}
ON CONFLICT (handle) DO NOTHING;

-- Protected names (brand, ecosystem, banks, payment brands, impersonation combos).
-- On conflict we UPGRADE an unowned SYSTEM row to PROTECTED with provenance, but
-- the WHERE guard means a row owned by a real CONSUMER/MERCHANT/APPLICATION is
-- left completely untouched — reservation never seizes a name someone holds.
INSERT INTO handle_registry (handle, owner_type, reserved_reason, protect_category, protect_source) VALUES
${protValues}
ON CONFLICT (handle) DO UPDATE SET
    owner_type       = 'PROTECTED',
    reserved_reason  = COALESCE(handle_registry.reserved_reason, EXCLUDED.reserved_reason),
    protect_category = EXCLUDED.protect_category,
    protect_source   = EXCLUDED.protect_source
WHERE handle_registry.owner_type = 'SYSTEM';
`;
}

// Run the CLI only when invoked directly (`node tools/gen-reserved-handles.mjs`),
// never as a side-effect of `import` (the guard test imports build()).
import { pathToFileURL } from 'node:url';
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const rows = build();
  if (process.argv.includes('--json')) {
    process.stdout.write(JSON.stringify(rows, null, 2) + '\n');
  } else if (process.argv.includes('--handles')) {
    process.stdout.write(rows.map((r) => r.handle).join('\n') + '\n');
  } else {
    process.stdout.write(toSql(rows));
  }
}

export { build, creatable, toSql, INTERNAL, BRAND, ECOSYSTEM, BANKS, PAYMENT };
