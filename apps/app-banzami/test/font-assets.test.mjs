// BUSINESS-WEB-ICON permanent regression guards (§35).
//
// The /business Welcome icons (bar_chart, notifications) came up blank because a
// browser was serving a STALE tree-shaken MaterialIcons subset cached under a prior
// deploy's long max-age. The durable fix content-addresses the font URLs so a byte
// change always changes the URL. These guards assert:
//   1. content-address-fonts.mjs appends a deterministic ?v=<hash> and is idempotent;
//   2. (when a web bundle is built) every FontManifest font URL is content-versioned;
//   3. (when built) the deployed MaterialIcons font actually carries the required
//      icon codepoints (build-artifact proof, not just a source-const check).
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoWeb = join(here, '..', 'web');
const script = join(here, '..', 'scripts', 'content-address-fonts.mjs');

// Minimal OTF/cmap reader: returns the set of Unicode codepoints the font maps,
// reading the format-12 (full Unicode) and format-4 (BMP) subtables. Pure Node.
function fontCodepoints(file) {
  const b = readFileSync(file);
  const u16 = (o) => b.readUInt16BE(o), u32 = (o) => b.readUInt32BE(o);
  const numTables = u16(4);
  let cmapOff = null;
  for (let i = 0, o = 12; i < numTables; i++, o += 16) {
    if (b.toString('latin1', o, o + 4) === 'cmap') cmapOff = u32(o + 8);
  }
  assert.ok(cmapOff, 'font has a cmap table');
  const nSub = u16(cmapOff + 2);
  const cps = new Set();
  for (let i = 0, p = cmapOff + 4; i < nSub; i++, p += 8) {
    const so = cmapOff + u32(p + 4);
    const fmt = u16(so);
    if (fmt === 12) {
      const nGroups = u32(so + 12);
      for (let g = 0, q = so + 16; g < nGroups; g++, q += 12) {
        const s = u32(q), e = u32(q + 4);
        for (let c = s; c <= e; c++) cps.add(c);
      }
    } else if (fmt === 4) {
      const segX2 = u16(so + 6), segCount = segX2 / 2;
      const endO = so + 14, startO = endO + segX2 + 2, deltaO = startO + segX2, rangeO = deltaO + segX2;
      for (let s = 0; s < segCount; s++) {
        const end = u16(endO + s * 2), start = u16(startO + s * 2);
        const ro = u16(rangeO + s * 2);
        if (start === 0xffff) continue;
        for (let c = start; c <= end; c++) { if (ro !== 0 || u16(deltaO + s * 2) !== undefined) cps.add(c); }
      }
    }
  }
  return cps;
}

const REQUIRED = { qr_code_rounded: 0xf00cb, bar_chart_rounded: 0xf5a9, notifications_rounded: 0xf002a };

test('content-address-fonts renames the font to a content-hashed file and is idempotent', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fa-'));
  mkdirSync(join(dir, 'assets', 'fonts'), { recursive: true });
  writeFileSync(join(dir, 'assets', 'fonts', 'MaterialIcons-Regular.otf'), Buffer.from('FONTBYTES-v1'));
  writeFileSync(join(dir, 'assets', 'FontManifest.json'),
    JSON.stringify([{ family: 'MaterialIcons', fonts: [{ asset: 'fonts/MaterialIcons-Regular.otf' }] }]));
  const asset = () => JSON.parse(readFileSync(join(dir, 'assets', 'FontManifest.json'), 'utf8'))[0].fonts[0].asset;
  execFileSync('node', [script, dir], { encoding: 'utf8' });
  const a1 = asset();
  assert.match(a1, /^fonts\/MaterialIcons-Regular\.[0-9a-f]{12}\.otf$/, 'font is a content-hashed real filename (no query)');
  assert.ok(existsSync(join(dir, 'assets', a1)), 'the hashed font file exists on disk (renamed, engine can fetch it)');
  execFileSync('node', [script, dir], { encoding: 'utf8' });
  assert.equal(asset(), a1, 'idempotent: same bytes → same hashed name (no double-hash stacking)');
  // A byte change must change the filename (guaranteed cache miss).
  writeFileSync(join(dir, 'assets', a1), Buffer.from('FONTBYTES-v2-different'));
  execFileSync('node', [script, dir], { encoding: 'utf8' });
  assert.notEqual(asset(), a1, 'changed font bytes → changed hashed filename (URL changes, defeating stale cache)');
});

// The following two guards only run against a built bundle (post build-web.sh).
const builtManifest = join(repoWeb, 'assets', 'FontManifest.json');
const hasBuild = existsSync(builtManifest);

test('built bundle: every FontManifest URL is a content-hashed real file', { skip: hasBuild ? false : 'no web build present' }, () => {
  const manifest = JSON.parse(readFileSync(builtManifest, 'utf8'));
  for (const fam of manifest) for (const f of fam.fonts || []) {
    assert.match(f.asset, /\.[0-9a-f]{12}\.[a-z0-9]+$/, `${fam.family} font ${f.asset} must be content-hashed`);
    assert.ok(existsSync(join(repoWeb, 'assets', f.asset)), `the hashed file exists: ${f.asset}`);
  }
});

test('built bundle: MaterialIcons carries the required Welcome icon glyphs', { skip: hasBuild ? false : 'no web build present' }, () => {
  const manifest = JSON.parse(readFileSync(builtManifest, 'utf8'));
  const mi = manifest.find((f) => f.family === 'MaterialIcons');
  assert.ok(mi, 'MaterialIcons family present');
  const rel = mi.fonts[0].asset;
  const file = join(repoWeb, 'assets', rel);
  assert.ok(existsSync(file), `font file exists: ${rel}`);
  const cps = fontCodepoints(file);
  for (const [name, cp] of Object.entries(REQUIRED)) {
    assert.ok(cps.has(cp), `deployed MaterialIcons must map ${name} (U+${cp.toString(16).toUpperCase()})`);
  }
});
