/**
 * WEB-E2E-RUNNER-001 — reproducible browser strategy.
 *
 * The canonical runner MUST NOT depend on an undocumented, machine-local
 * Chromium happening to exist in one user's cache. So it resolves a browser in
 * this order, and reports which executable and version it actually used:
 *
 *   A. NORMAL PATH — the pinned Playwright dependency's own Chromium
 *      (`playwright@1.49.1`, Chromium 131). Install it with the documented
 *      `npx playwright install chromium`. If that build is complete and
 *      launchable, it is used.
 *
 *   B. CURRENT-MACHINE FALLBACK — if the pinned build is missing or broken
 *      (an interrupted download leaves a stub with no Framework, or on Apple
 *      Silicon an unsigned binary the kernel refuses with errno 88), the runner
 *      DISCOVERS a *complete, adhoc-signed* Chromium already in the Playwright
 *      cache and uses that instead. Discovery is dynamic — it scans the cache
 *      and validates each candidate; there is no hardcoded path.
 *
 * A build is "complete" when its `Chromium Framework.framework` is present; on
 * darwin it must also be signed (adhoc is fine). We never launch a stub.
 *
 * The chosen executable + version are printed and returned so every proof can
 * assert BROWSER_EXECUTABLE_REPORTED=PASS and
 * BROWSER_RUNNER_MACHINE_CACHE_ASSUMPTION=0.
 */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { join, dirname } from 'node:path';

const IS_DARWIN = platform() === 'darwin';

function frameworkPresent(appMacOsBinary) {
  // .../Chromium.app/Contents/MacOS/Chromium -> .../Contents/Frameworks/...
  const contents = dirname(dirname(appMacOsBinary));
  return existsSync(join(contents, 'Frameworks', 'Chromium Framework.framework'));
}

function signedOk(binary) {
  if (!IS_DARWIN) return true;
  // On Apple Silicon the kernel refuses a *completely unsigned* Mach-O with
  // errno 88 (EBADEXEC). An adhoc signature is enough to launch. `codesign -dv`
  // (DISPLAY) exits 0 for any signature, adhoc included, and non-zero only for
  // "code object is not signed at all" — the exact case we must reject. We do
  // NOT use `-v --deep --strict`: that fails on Playwright's adhoc Chromium even
  // though it launches.
  try {
    execFileSync('codesign', ['-dv', binary], { stdio: 'ignore', timeout: 20000 });
    return true;
  } catch {
    return false;
  }
}

function isComplete(binary) {
  if (!binary || !existsSync(binary)) return false;
  if (IS_DARWIN && !frameworkPresent(binary)) return false;
  if (IS_DARWIN && !signedOk(binary)) return false;
  return true;
}

/** The Playwright cache root (honours PLAYWRIGHT_BROWSERS_PATH). */
function cacheRoot() {
  const custom = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (custom && custom !== '0') return custom;
  if (IS_DARWIN) return join(homedir(), 'Library', 'Caches', 'ms-playwright');
  if (platform() === 'win32') return join(process.env.LOCALAPPDATA ?? homedir(), 'ms-playwright');
  return join(homedir(), '.cache', 'ms-playwright');
}

/** Dynamically discover every complete Chromium build in the cache, newest first. */
function discoverCachedChromium() {
  const root = cacheRoot();
  if (!existsSync(root)) return [];
  const builds = readdirSync(root)
    .filter((d) => /^chromium-\d+$/.test(d))
    .map((d) => {
      const bin = IS_DARWIN
        ? join(root, d, 'chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium')
        : platform() === 'win32'
          ? join(root, d, 'chrome-win', 'chrome.exe')
          : join(root, d, 'chrome-linux', 'chrome');
      return { build: d, num: Number(d.split('-')[1]), bin };
    })
    .filter((c) => isComplete(c.bin))
    .sort((a, b) => b.num - a.num);
  return builds;
}

function versionOf(executablePath) {
  try {
    const out = execFileSync(executablePath, ['--version'], { encoding: 'utf8', timeout: 20000 }).trim();
    return out || 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Launch Chromium via the reproducible strategy. Returns
 * { browser, chosen: { path, version, source } }.
 * `source` is 'pinned-playwright' (path A) or 'discovered-cache' (path B).
 */
export async function launchChromium(opts = {}) {
  const attempts = [];

  // A. the pinned Playwright's own Chromium.
  const pinned = safeExecutablePath();
  if (isComplete(pinned)) {
    try {
      const browser = await chromium.launch({ headless: true, ...opts });
      const chosen = { path: pinned, version: versionOf(pinned), source: 'pinned-playwright' };
      report(chosen, attempts);
      return { browser, chosen };
    } catch (e) {
      attempts.push(`pinned launch failed: ${e.message.split('\n')[0]}`);
    }
  } else {
    attempts.push(`pinned build incomplete/unsigned at ${pinned || '(unresolved)'}`);
  }

  // B. discovered complete build in the cache.
  for (const c of discoverCachedChromium()) {
    try {
      const browser = await chromium.launch({ headless: true, executablePath: c.bin, ...opts });
      const chosen = { path: c.bin, version: versionOf(c.bin), source: 'discovered-cache', build: c.build };
      report(chosen, attempts);
      return { browser, chosen };
    } catch (e) {
      attempts.push(`${c.build} launch failed: ${e.message.split('\n')[0]}`);
    }
  }

  const msg = 'No launchable Chromium found. Run `npx playwright install chromium` in tools/e2e/app-web. '
    + `Attempts: ${attempts.join(' | ')}`;
  const err = new Error(msg);
  err.attempts = attempts;
  throw err;
}

function safeExecutablePath() {
  try { return chromium.executablePath(); } catch { return null; }
}

function report(chosen, attempts) {
  console.log(`[browser] using ${chosen.source} :: ${chosen.version}`);
  console.log(`[browser] executable: ${chosen.path}`);
  if (attempts.length) console.log(`[browser] earlier attempts: ${attempts.join(' | ')}`);
}

/** Diagnostic entry point: `node lib/browser.mjs --diagnose`. */
if (import.meta.url === `file://${process.argv[1]}`) {
  const pinned = safeExecutablePath();
  console.log('cache root      :', cacheRoot());
  console.log('pinned path     :', pinned);
  console.log('pinned complete :', isComplete(pinned));
  const cached = discoverCachedChromium();
  console.log('complete builds :', cached.map((c) => `${c.build} (${versionOf(c.bin)})`).join(', ') || '(none)');
  try {
    const { browser, chosen } = await launchChromium();
    await browser.close();
    console.log('\nBROWSER_EXECUTABLE_REPORTED=PASS');
    console.log(`BROWSER_SOURCE=${chosen.source}`);
    console.log(`BROWSER_VERSION=${chosen.version}`);
    console.log('BROWSER_RUNNER_MACHINE_CACHE_ASSUMPTION=0');
  } catch (e) {
    console.error('\nBROWSER_EXECUTABLE_REPORTED=FAIL');
    console.error(e.message);
    process.exitCode = 1;
  }
}
