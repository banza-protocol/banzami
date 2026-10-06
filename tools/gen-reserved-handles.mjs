#!/usr/bin/env node
// Canonical, versioned, testable source for the protected @banza namespace.
//
// This file is the ONE place the protected-handle sets and the institution
// inventory live. The migration db/migrations/0171_handle_namespace_protection.sql
// is SEEDED from this generator, and tools/check-reserved-handles.mjs fails CI if
// the migration (or the committed inventory doc) drifts from it — so the namespace
// is reproducible on a fresh DB and can never silently diverge.
//
// Authority split (single authority — see the brief):
//   * GRAMMAR / normalization  -> code (ONE canonical grammar, below).
//   * RESERVED / PROTECTED / ALLOCATED / RETIRED  -> handle_registry (the DB).
// There is no hand-maintained reserved list in Rust any more; the registry is the
// sole namespace authority and this generator is its single source.
//
// Design rules (binding):
//   * Protection is by EXPLICIT handles and controlled impersonation combos, never
//     substring/`contains()` rules that would block legitimate handles.
//   * Every emitted handle must be creatable under the ONE canonical grammar.
//   * Angolan bank coverage is the current BNA official registry (primary source);
//     ABANC is secondary cross-check only.
//
// Usage:
//   node tools/gen-reserved-handles.mjs             # SQL seed block
//   node tools/gen-reserved-handles.mjs --json      # rows [{handle,ownerType,category,reason,source}]
//   node tools/gen-reserved-handles.mjs --handles   # one handle per line
//   node tools/gen-reserved-handles.mjs --inventory # auditable institution table (markdown)
// Prints data only; never writes files or touches a database.

// === THE ONE canonical @banza grammar (Consumer AND Business) ================
// 3-30 chars, ASCII lowercase, must start with a letter, end alphanumeric, only
// [a-z0-9_], no consecutive underscores. Mirror this EXACTLY in every creation
// path (Core, gateway, public-api, SDK, Flutter, website); tools/check-handle-grammar.mjs
// pins them together.
export const CANONICAL_GRAMMAR = /^[a-z][a-z0-9_]{1,28}[a-z0-9]$/;
export const HANDLE_MIN = 3;
export const HANDLE_MAX = 30;
export function creatable(h) {
  return CANONICAL_GRAMMAR.test(h) && !h.includes('__');
}

// --- Provenance strings (stored in handle_registry.protect_source). ---
const SRC_INTERNAL = 'Banzami platform namespace';
const SRC_BRAND = 'Banzami brand protection';
const SRC_REGULATOR = 'Banco Nacional de Angola (regulator)';
const SRC_ECOSYSTEM = 'Angolan payment infrastructure';
const SRC_BANK = 'BNA authorized banking institutions (primary); ABANC (secondary)';
const SRC_PAYMENT = 'Global payment networks';

// Primary source snapshot provenance for the Angolan bank inventory.
export const BNA_SOURCE = {
  primary: 'Banco Nacional de Angola — Supervisão → Instituições Financeiras Bancárias Autorizadas (bna.ao)',
  secondary: 'ABANC — Associação Angolana de Bancos (abanc.ao) — cross-check only',
  snapshotDate: '2026-10-06',
};

// === 1. INTERNAL reserved — platform, security, generic product words ========
// owner_type SYSTEM, reserved_reason 'reserved'. Superset of migration 0133's
// list (the guard asserts 0133 ⊆ this set) plus the brief's section-4 list.
const INTERNAL = [
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
  // Angola + Kwanza currency words; legacy reserved 'bde' (kept from 0133).
  'angola', 'angolar', 'test', 'bde',
];

// === 2. BRAND roots — Banzami operator + BANZA/BanzAI =======================
const BRAND = ['banzami', 'banza', 'banzai', 'banzamii'];

// === 3. Institutions (structured for the auditable inventory) ================
// Each: { name, acronym, canonical, aliases[], category, source }. The canonical
// handle + aliases are protected exactly; impersonation combos are generated.
const REGULATOR = [
  { name: 'Banco Nacional de Angola', acronym: 'BNA', canonical: 'bna', aliases: [], source: SRC_REGULATOR },
];

const ECOSYSTEM = [
  { name: 'EMIS — Empresa Interbancária de Serviços', acronym: 'EMIS', canonical: 'emis', aliases: [], source: SRC_ECOSYSTEM },
  { name: 'MULTICAIXA', acronym: 'MULTICAIXA', canonical: 'multicaixa', aliases: [], source: SRC_ECOSYSTEM },
  { name: 'MULTICAIXA Express', acronym: 'MULTICAIXA Express', canonical: 'multicaixaexpress', aliases: [], source: SRC_ECOSYSTEM },
  { name: 'KWiK (EMIS instant payment)', acronym: 'KWiK', canonical: 'kwik', aliases: [], source: SRC_ECOSYSTEM },
];

// Current BNA-authorized banking institutions (22), primary source = BNA.
const BANKS = [
  { name: 'Access Bank Angola', acronym: 'ACCESS', canonical: 'access', aliases: ['accessbank'] },
  { name: 'Banco Angolano de Investimentos', acronym: 'BAI', canonical: 'bai', aliases: [] },
  { name: 'Banco Comercial Angolano', acronym: 'BCA', canonical: 'bca', aliases: [] },
  { name: 'Banco Caixa Geral Angola', acronym: 'BCGA', canonical: 'bcga', aliases: [] },
  { name: 'Banco Comercial do Huambo', acronym: 'BCH', canonical: 'bch', aliases: [] },
  { name: 'Banco de Comércio e Indústria', acronym: 'BCI', canonical: 'bci', aliases: [] },
  { name: 'Banco de Crédito do Sul', acronym: 'BCS', canonical: 'bcs', aliases: [] },
  { name: 'Banco de Desenvolvimento de Angola', acronym: 'BDA', canonical: 'bda', aliases: [] },
  { name: 'Banco Económico', acronym: 'BE', canonical: 'economico', aliases: ['bancoeconomico'] },
  { name: 'Banco de Fomento Angola', acronym: 'BFA', canonical: 'bfa', aliases: [] },
  { name: 'Banco BIC', acronym: 'BIC', canonical: 'bic', aliases: [] },
  { name: 'Banco de Investimento Rural', acronym: 'BIR', canonical: 'bir', aliases: [] },
  { name: 'Banco Keve', acronym: 'BKEVE', canonical: 'bkeve', aliases: ['keve'] },
  { name: 'Banco Millennium Atlântico', acronym: 'BMA', canonical: 'bma', aliases: ['atlantico', 'millennium'] },
  { name: 'Banco de Negócios Internacional', acronym: 'BNI', canonical: 'bni', aliases: [] },
  { name: 'Bank of China (Luanda)', acronym: 'BOCLB', canonical: 'boclb', aliases: ['boc', 'bankofchina'] },
  { name: 'Banco de Poupança e Crédito', acronym: 'BPC', canonical: 'bpc', aliases: [] },
  { name: 'Banco Sol', acronym: 'BSOL', canonical: 'bsol', aliases: ['bancosol'] },
  { name: 'Banco Valor', acronym: 'BVB', canonical: 'bvb', aliases: [] },
  { name: 'Standard Bank Angola', acronym: 'SBA', canonical: 'sba', aliases: ['standard', 'standardbank'] },
  { name: 'Banco VTB África', acronym: 'VTB', canonical: 'vtb', aliases: [] },
  { name: 'Banco Yetu', acronym: 'YETU', canonical: 'yetu', aliases: [] },
].map((b) => ({ ...b, source: SRC_BANK }));

const PAYMENT = [
  { name: 'Visa', acronym: 'Visa', canonical: 'visa', aliases: [], source: SRC_PAYMENT },
  { name: 'Mastercard', acronym: 'Mastercard', canonical: 'mastercard', aliases: [], source: SRC_PAYMENT },
];

// === Impersonation combos ====================================================
const BRAND_SUFFIXES = [
  'support', 'suporte', 'security', 'seguranca', 'help', 'ajuda',
  'admin', 'official', 'oficial', 'verified', 'verificado',
  'payments', 'pagamentos', 'wallet', 'carteira', 'business',
  'developer', 'api', 'compliance', 'legal',
];
const ENTITY_SUFFIXES = ['official', 'oficial', 'support', 'suporte', 'pagamentos'];

function brandCombos(root) {
  const out = [];
  for (const s of BRAND_SUFFIXES) out.push(`${root}_${s}`, `${root}${s}`, `${s}_${root}`);
  return out;
}
function entityCombos(root) {
  return ENTITY_SUFFIXES.map((s) => `${root}_${s}`);
}

// All institution handles (canonical + aliases) across the structured groups.
function institutionHandles(groups) {
  return groups.flatMap((e) => [e.canonical, ...e.aliases]);
}

// Expand one institution into its impersonation combos for every handle it owns.
function institutionCombos(e) {
  return [e.canonical, ...e.aliases].flatMap(entityCombos);
}

// === Assemble the full set (handle -> entry), first classification wins =======
function build() {
  const map = new Map();
  const add = (handle, ownerType, category, reason, source) => {
    if (!creatable(handle)) return;
    if (map.has(handle)) return;
    map.set(handle, { handle, ownerType, category, reason, source });
  };

  for (const h of INTERNAL) add(h, 'SYSTEM', 'internal', 'reserved', SRC_INTERNAL);
  for (const h of BRAND) add(h, 'PROTECTED', 'brand', 'brand', SRC_BRAND);
  for (const e of REGULATOR) for (const h of [e.canonical, ...e.aliases]) add(h, 'PROTECTED', 'regulator', 'regulator', e.source);
  for (const e of ECOSYSTEM) for (const h of [e.canonical, ...e.aliases]) add(h, 'PROTECTED', 'ecosystem', 'ecosystem', e.source);
  for (const e of BANKS) for (const h of [e.canonical, ...e.aliases]) add(h, 'PROTECTED', 'bank', 'bank', e.source);
  for (const e of PAYMENT) for (const h of [e.canonical, ...e.aliases]) add(h, 'PROTECTED', 'payment-brand', 'payment-brand', e.source);

  for (const root of ['banzami', 'banza', 'banzai']) {
    for (const h of brandCombos(root)) add(h, 'PROTECTED', 'brand-impersonation', 'brand', SRC_BRAND);
  }
  for (const e of [...REGULATOR, ...ECOSYSTEM, ...BANKS, ...PAYMENT]) {
    for (const h of institutionCombos(e)) add(h, 'PROTECTED', 'impersonation', 'impersonation', e.source);
  }

  return [...map.values()].sort((a, b) => a.handle.localeCompare(b.handle, 'en'));
}

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

function toSql(rows) {
  const sysValues = rows
    .filter((r) => r.ownerType === 'SYSTEM')
    .map((r) => `    (${q(r.handle)}, 'SYSTEM', ${q(r.reason)}, ${q(r.category)}, ${q(r.source)})`)
    .join(',\n');
  const protValues = rows
    .filter((r) => r.ownerType === 'PROTECTED')
    .map((r) => `    (${q(r.handle)}, 'PROTECTED', ${q(r.reason)}, ${q(r.category)}, ${q(r.source)})`)
    .join(',\n');

  return `-- @@GENERATED by tools/gen-reserved-handles.mjs — do not edit by hand.
-- Regenerate: node tools/gen-reserved-handles.mjs  (guard: tools/check-reserved-handles.mjs)

-- Internal reserved names stay SYSTEM (unowned). DO NOTHING never displaces an
-- owner and never downgrades a name already PROTECTED.
INSERT INTO handle_registry (handle, owner_type, reserved_reason, protect_category, protect_source) VALUES
${sysValues}
ON CONFLICT (handle) DO NOTHING;

-- Protected names (brand, regulator, ecosystem, banks, payment brands, and
-- impersonation combos). On conflict we UPGRADE an unowned SYSTEM row to PROTECTED
-- with provenance; the WHERE guard leaves any row owned by a real
-- CONSUMER/MERCHANT/APPLICATION completely untouched — reservation never seizes a
-- name someone holds.
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

// Auditable institution inventory (markdown). One row per institution with its
// canonical handle, protected aliases, and the impersonation aliases generated.
function toInventory() {
  const section = (title, groups) =>
    [
      `### ${title}`,
      '',
      '| Institution | Acronym | Canonical @banza | Protected aliases | Impersonation aliases generated |',
      '|---|---|---|---|---|',
      ...groups.map((e) => {
        const aliases = e.aliases.length ? e.aliases.map((a) => `\`${a}\``).join(', ') : '—';
        const combos = institutionCombos(e);
        return `| ${e.name} | ${e.acronym} | \`${e.canonical}\` | ${aliases} | ${combos.length} (\`${combos[0]}\` …) |`;
      }),
      '',
    ].join('\n');

  const bankCount = BANKS.length;
  return `<!-- @@GENERATED by tools/gen-reserved-handles.mjs --inventory — do not edit by hand. -->
# Angola financial-institution @banza namespace inventory

Auditable inventory of the institutions whose @banza handles are **PROTECTED** from
normal signup (Consumer and Business). Protection is server-side in \`handle_registry\`
(seeded by migration 0171); this table is generated from the single canonical source
\`tools/gen-reserved-handles.mjs\`. A PROTECTED name is **not** owned by Banzami — it is
only ever assignable through an explicit, RBAC-gated, audited operator flow.

- **Primary source:** ${BNA_SOURCE.primary}
- **Secondary source:** ${BNA_SOURCE.secondary}
- **Source snapshot date:** ${BNA_SOURCE.snapshotDate}
- **ALL CURRENT BNA-AUTHORIZED BANKS COVERED: YES** (${bankCount} institutions)

This list is **not** exposed by the public availability API — a protected name reads
as a single neutral "unavailable".

${section('Regulator', REGULATOR)}${section('Payment infrastructure', ECOSYSTEM)}${section(`Banks — BNA-authorized (${bankCount})`, BANKS)}${section('Global payment brands', PAYMENT)}`;
}

// Structured institution data (for coverage tests).
function institutions() {
  return { REGULATOR, ECOSYSTEM, BANKS, PAYMENT };
}

import { pathToFileURL } from 'node:url';
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const rows = build();
  if (process.argv.includes('--json')) {
    process.stdout.write(JSON.stringify(rows, null, 2) + '\n');
  } else if (process.argv.includes('--handles')) {
    process.stdout.write(rows.map((r) => r.handle).join('\n') + '\n');
  } else if (process.argv.includes('--inventory')) {
    process.stdout.write(toInventory());
  } else {
    process.stdout.write(toSql(rows));
  }
}

export { build, toSql, toInventory, institutions, institutionHandles, INTERNAL, BRAND };
