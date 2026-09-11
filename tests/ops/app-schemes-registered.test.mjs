// A scheme the app reads must be one the OS will hand it (A8-11).
//
// The consumer app accepts four custom schemes (banzami, banzami-sandbox and
// the two legacy banza ones) in lib/app.dart, but iOS and Android registered
// only `banzami`. A banzami-sandbox:// link — the one the Sandbox payer pages
// must emit, since the app refuses a link of the other environment — reached
// nothing at all: the button did nothing.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ROOT = new URL('../../', import.meta.url).pathname;
const read = (p) => readFileSync(ROOT + p, 'utf8');

const CANONICAL = ['banzami', 'banzami-sandbox'];

test('iOS registers every canonical scheme the app answers', () => {
  const plist = read('apps/mobile/ios/Runner/Info.plist');
  const block = plist.slice(plist.indexOf('CFBundleURLSchemes'));
  for (const scheme of CANONICAL) {
    assert.ok(block.includes(`<string>${scheme}</string>`), `Info.plist does not register ${scheme}://`);
  }
});

test('the consumer Android manifest registers every canonical scheme', () => {
  const manifest = read('apps/mobile/android/app/src/consumer/AndroidManifest.xml');
  for (const scheme of CANONICAL) {
    assert.ok(
      manifest.includes(`android:scheme="${scheme}"`),
      `the consumer manifest does not register ${scheme}://`,
    );
  }
});

test('the payer surface emits a scheme, never a hard-coded one', () => {
  // Every app link on apps/pay goes through lib/deep-link.ts, which picks the
  // scheme from the deployment's environment.
  const helper = read('apps/pay/lib/deep-link.ts');
  for (const scheme of CANONICAL) assert.ok(helper.includes(`'${scheme}'`), `deep-link.ts lost ${scheme}`);

  for (const page of [
    'apps/pay/app/u/[handle]/page.tsx',
    'apps/pay/app/pay/[slug]/page.tsx',
    'apps/pay/app/r/[code]/PayRequestClient.tsx',
    'apps/pay/app/profiles/[handle]/profile-pay-card.tsx',
  ]) {
    assert.ok(!read(page).includes('banzami://'), `${page} still hard-codes the live scheme`);
  }
});
