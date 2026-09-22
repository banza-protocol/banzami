#!/usr/bin/env node
/**
 * A migration may not grant runtime authority. The authority file does that.
 *
 * Banzami — WALLET-NATIVE-001 / BANZAMI-SANDBOX-FULL-VALIDATION-001.
 *
 * Migration 0166 granted bl_admin_api_runtime USAGE on schema developer and
 * SELECT on one table. It applied, recorded success, and had no effect:
 * runtime-authority.sh runs AFTER every migration inside sandbox-migration.sh
 * apply, and db/authority/runtime-authority.sql begins by REVOKEing ALL on
 * every managed schema from every runtime role before re-granting what the
 * manifest declares.
 *
 * That is the design working. A migration must not be able to widen a
 * service's authority behind the manifest's back, and the manifest is reviewed
 * as one artefact precisely so that "who may read what" is answerable in one
 * place.
 *
 * But the failure was silent: a green migration whose grant evaporated, found
 * only because a downstream gate happened to assert the privilege afterwards.
 * This makes it loud, statically, before the migration is ever applied.
 *
 *   node tools/check-migration-runtime-grants.mjs
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATIONS = join(repo, 'db/migrations');
const MANIFEST = JSON.parse(readFileSync(join(repo, 'db/authority/runtime-authority.json'), 'utf8'));

let failures = 0;
const check = (t, ok, d = '') => { if (ok) return console.log(`  ✓ ${t}`); console.log(`  ✗ ${t}${d ? `\n      ${d}` : ''}`); failures++; };

console.log('\nruntime authority belongs to the manifest, not to a migration\n');

/** The roles the authority file resets on every apply. */
const RUNTIME_ROLES = Object.keys(MANIFEST.roles);
/** The schemas it resets them in. */
const MANAGED = MANIFEST.schemas;

/**
 * Find GRANTs to a runtime role inside a managed schema.
 *
 * Deliberately shallow: it looks for the two things that actually get erased —
 * a GRANT naming a runtime role, in a file under db/migrations. It does not try
 * to parse SQL, because the question is not "is this valid" but "is this in the
 * wrong file".
 */
export function offendingGrants(sql, { roles = RUNTIME_ROLES } = {}) {
  const out = [];
  const lines = sql.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*--/.test(line)) continue;
    if (!/\bGRANT\b/i.test(line)) continue;
    for (const role of roles) {
      if (!new RegExp(`\\b${role}\\b`).test(line)) continue;
      out.push({ line: i + 1, role, text: line.trim().slice(0, 120) });
    }
  }
  return out;
}

const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort();
const offenders = [];
for (const f of files) {
  const found = offendingGrants(readFileSync(join(MIGRATIONS, f), 'utf8'));
  for (const o of found) offenders.push({ file: f, ...o });
}

// HISTORY IS HISTORY. Many migrations up to 0166 grant to runtime roles in
// schema public. Those grants are redundant rather than lost — the manifest
// re-grants the same thing immediately afterwards — and rewriting an applied
// migration is the defect that produced the 0090-0095 drift. They are not
// touched and never will be.
//
// What this gate stops is the NEXT one. 0166 is the last migration written
// before the rule existed, and it is also the one that proved why the rule is
// needed: it granted in schema developer, where the manifest grants nothing
// back, and its effect was erased by the very next step of the same apply.
const HIGH_WATER = 166;
const versionOf = (f) => Number(f.slice(0, 4));

const ahead = offenders.filter((o) => versionOf(o.file) > HIGH_WATER);
check(`no migration after ${HIGH_WATER} grants authority to a runtime role`,
  ahead.length === 0,
  ahead.map((o) => `${o.file}:${o.line} ${o.role} — ${o.text}\n      ` +
    'declare it in db/authority/runtime-authority.json instead; a migration cannot ' +
    'widen a service\'s authority, because runtime-authority.sh resets it afterwards')
    .join('\n      '));

// Pinned, so that editing an APPLIED migration to add or remove a grant is
// caught here rather than discovered on a Sandbox months later.
const historical = offenders.filter((o) => versionOf(o.file) <= HIGH_WATER);
// MEASURED, not estimated: 0103, 0104, 0119, 0120, 0121, 0125 (×2) grant to
// bl_app_runtime in public; 0160 (×2) and 0166 (×3) name bl_admin_api_runtime.
const HISTORICAL_GRANTS = 12;
check('the historical grants are unchanged in number',
  historical.length === HISTORICAL_GRANTS,
  `${historical.length} found, ${HISTORICAL_GRANTS} pinned — if a migration was edited, say which and why`);

/* ── the gate must be seen to fire ───────────────────────────────────────── */

const planted = `
-- a comment mentioning bl_core_runtime must not count
GRANT SELECT ON TABLE developer.dev_projects TO bl_admin_api_runtime;
`;
check('the detector FINDS a grant to a runtime role',
  offendingGrants(planted).length === 1
  && offendingGrants(planted)[0].role === 'bl_admin_api_runtime');
check('…and ignores a commented one',
  offendingGrants('-- GRANT SELECT ON x TO bl_core_runtime;').length === 0,
  'a gate that fires on prose trains people to ignore it');
check('…and ignores a grant to a role the authority file does not manage',
  offendingGrants('GRANT SELECT ON TABLE public.x TO some_other_role;').length === 0);

check('every managed schema is known to this gate',
  MANAGED.length > 0 && RUNTIME_ROLES.length > 0,
  `${MANAGED.length} schema(s), ${RUNTIME_ROLES.length} role(s)`);

/* ── and the manifest is where the grant actually lives ──────────────────── */

const admin = MANIFEST.roles.bl_admin_api_runtime;
check('the control plane reads developer.dev_workspaces by MANIFEST declaration',
  (admin.read_tables ?? []).includes('developer.dev_workspaces'));
check('…by named table, never by taking the whole Developer domain',
  !(admin.read_schemas ?? []).includes('developer'),
  'read_schemas would grant SELECT on every table in the domain, now and in future');

console.log(failures === 0
  ? `\n✓ MIGRATION_RUNTIME_GRANTS=PASS\n`
  : `\n✗ MIGRATION_RUNTIME_GRANTS=FAIL (${failures})\n`);
process.exit(failures === 0 ? 0 : 1);
