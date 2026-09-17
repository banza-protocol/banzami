#!/usr/bin/env node
/**
 * Content-address the Flutter Web font files (BUSINESS-WEB-ICON defect fix).
 *
 * Flutter serves fonts at STABLE paths (e.g. assets/fonts/MaterialIcons-Regular.otf)
 * whose BYTES change every build — the tree-shaken MaterialIcons subset carries a
 * different glyph set each deploy. A browser that cached the old file under a long
 * max-age (a policy a previous deploy used) keeps serving the OLD subset for up to a
 * week, so icons that only the new subset renders (bar_chart, notifications) come up
 * blank — exactly the reported /business defect. `no-cache` on /assets/ fixes only
 * FUTURE fetches; a URL already cached under max-age does not revalidate until it
 * expires, so current users stay stuck.
 *
 * The durable fix (ICON §32): make the font URL content-addressed by RENAMING the
 * file to embed a deterministic sha256[:12] of its bytes — e.g.
 * MaterialIcons-Regular.<hash>.otf — and rewriting FontManifest.json to the new
 * real path. A query string (?v=) does NOT work: the Flutter web engine strips the
 * query when it fetches a manifest asset, so only a real filename change is honoured.
 * When the bytes change the filename changes → a brand-new URL → guaranteed cache
 * miss for every browser and intermediary; unchanged bytes keep the same name.
 *
 * Safe because these fonts are declared in FontManifest.json and are NOT referenced
 * by AssetManifest (verified), so no other manifest needs patching. The renamed
 * files are served `immutable` by the BFF. Idempotent: a name that already carries a
 * 12-hex content segment is normalised back to its base before re-hashing.
 *
 *   node scripts/content-address-fonts.mjs [webDir]   (default: ../web)
 */
import { readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const WEB = process.argv[2] || join(here, '..', 'web');
const manifestPath = join(WEB, 'assets', 'FontManifest.json');
if (!existsSync(manifestPath)) {
  console.error(`content-address-fonts: FontManifest.json not found at ${manifestPath}`);
  process.exit(1);
}

// Strip a prior "?v=…" and a prior ".<12hex>" content segment, so re-runs are stable.
const HASH_SEG = /\.[0-9a-f]{12}(\.[^.]+)$/;
function baseAsset(asset) {
  const clean = asset.replace(/\?v=[0-9a-f]+$/i, '');
  return clean.replace(HASH_SEG, '$1');
}
const hashOf = (file) => createHash('sha256').update(readFileSync(file)).digest('hex').slice(0, 12);

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
let versioned = 0, missing = 0;
for (const family of manifest) {
  for (const font of family.fonts || []) {
    const base = baseAsset(font.asset);                 // e.g. fonts/MaterialIcons-Regular.otf
    // The source is whichever exists: the current (possibly already-hashed) asset from
    // a prior run, else the base name from a fresh Flutter build. This makes the step
    // idempotent even though a rename removes the base file.
    const srcRel = [font.asset, base].find((c) => existsSync(join(WEB, 'assets', c)));
    if (!srcRel) { console.warn(`  ! font file missing, left as-is: ${base}`); missing++; font.asset = base; continue; }
    const srcFile = join(WEB, 'assets', srcRel);
    const hash = hashOf(srcFile);
    const dot = base.lastIndexOf('.');
    const hashedRel = `${base.slice(0, dot)}.${hash}${base.slice(dot)}`;  // fonts/MaterialIcons-Regular.<hash>.otf
    if (srcRel !== hashedRel) renameSync(srcFile, join(WEB, 'assets', hashedRel));
    font.asset = hashedRel;
    versioned++;
    console.log(`  ✓ ${family.family}: ${hashedRel}`);
  }
}
writeFileSync(manifestPath, JSON.stringify(manifest) + '\n');
console.log(`content-address-fonts: content-addressed ${versioned} font file(s)${missing ? `, ${missing} missing` : ''}`);
if (versioned === 0) { console.error('content-address-fonts: no fonts addressed — refusing (build likely incomplete)'); process.exit(1); }
