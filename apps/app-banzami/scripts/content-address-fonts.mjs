#!/usr/bin/env node
/**
 * Content-address the Flutter Web font URLs (BUSINESS-WEB-ICON defect fix).
 *
 * Flutter serves fonts at STABLE paths (e.g. assets/fonts/MaterialIcons-Regular.otf)
 * whose BYTES change every build — the tree-shaken MaterialIcons subset carries a
 * different glyph set each deploy. A browser that cached the old file under a long
 * max-age (a policy a previous deploy used) keeps serving the OLD subset for up to a
 * week, so icons that only the new subset renders (bar_chart, notifications) come up
 * blank — exactly the reported /business defect. `no-cache` on /assets/ fixes it for
 * FUTURE fetches, but a URL already cached under max-age does not revalidate until it
 * expires, so current users stay stuck.
 *
 * The durable fix (COLLECTIONS/ICON §32): make the font URL content-addressed. We
 * append a deterministic ?v=<sha256[:12]> of each font's bytes to its entry in
 * FontManifest.json — a BUILD-TIME content hash, never a runtime timestamp. When the
 * font content changes the query changes, so the URL changes, so every browser and
 * intermediary treats it as a brand-new resource (guaranteed cache miss) — no stale
 * subset can survive a deploy. Unchanged content keeps the same URL (stays cached).
 *
 * File paths are NOT renamed (so AssetManifest and the engine's asset resolver are
 * untouched); only the URL CanvasKit fetches gains the version query, and the server
 * strips the query when resolving the file. Idempotent: an existing ?v= is replaced.
 *
 *   node scripts/content-address-fonts.mjs [webDir]   (default: ../web)
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const WEB = process.argv[2] || join(here, '..', 'web');
const manifestPath = join(WEB, 'assets', 'FontManifest.json');
if (!existsSync(manifestPath)) {
  console.error(`content-address-fonts: FontManifest.json not found at ${manifestPath}`);
  process.exit(1);
}

const stripV = (p) => p.replace(/\?v=[0-9a-f]+$/i, '');
const hashOf = (file) => createHash('sha256').update(readFileSync(file)).digest('hex').slice(0, 12);

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
let versioned = 0, missing = 0;
for (const family of manifest) {
  for (const font of family.fonts || []) {
    const clean = stripV(font.asset);
    // FontManifest asset paths are relative to the assets/ directory.
    const file = join(WEB, 'assets', clean);
    if (!existsSync(file)) { console.warn(`  ! font file missing, left unversioned: ${clean}`); missing++; font.asset = clean; continue; }
    font.asset = `${clean}?v=${hashOf(file)}`;
    versioned++;
    console.log(`  ✓ ${family.family}: ${font.asset}`);
  }
}
writeFileSync(manifestPath, JSON.stringify(manifest) + '\n');
console.log(`content-address-fonts: versioned ${versioned} font URL(s)${missing ? `, ${missing} missing` : ''} in FontManifest.json`);
if (versioned === 0) { console.error('content-address-fonts: no fonts versioned — refusing (build likely incomplete)'); process.exit(1); }
