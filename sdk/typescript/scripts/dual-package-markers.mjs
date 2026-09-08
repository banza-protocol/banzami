/**
 * Tell Node which half of the dual build is which.
 *
 * The package emits ESM into dist/ and CommonJS into dist/cjs/, and points
 * `exports` at both. What it did not do is say so: the root package.json has no
 * "type", which makes every .js file in the package CommonJS by default —
 * including dist/index.js, which is pure ESM syntax.
 *
 * Node ≥22 usually rescues that by sniffing the syntax, so it worked on a
 * developer's laptop and in this repo's tests. It did not work in the first
 * place an external developer actually put it: a serverless webhook receiver,
 * where the import resolved as CommonJS and
 *
 *     import { constructEvent } from '@banzami/sdk'
 *
 * failed with "Named export 'constructEvent' not found" — the exact line the
 * public webhook documentation tells them to write.
 *
 * Two one-line files remove the ambiguity, so the module kind is declared
 * rather than guessed. This runs as the last step of `npm run build`; the
 * markers are inside dist/, which is what npm publishes.
 *
 * They must also carry "sideEffects": false, and that is not decoration.
 *
 * A bundler reads sideEffects from the package.json NEAREST the file it is
 * bundling, so for everything under dist/ these markers shadow the root
 * package.json entirely. Declaring it only at the root looked correct and did
 * nothing. The visible consequence was a build failure rather than a silent
 * one: `webhooks.js` opens with `import { createHmac } from 'node:crypto'`, and
 * because it is re-exported from the package root, a browser bundle that
 * imports BanzamiClient could not drop it —
 *
 *     UnhandledSchemeError: Reading from "node:crypto" is not handled by plugins
 *
 * — which is Next 15 refusing to bundle a Node built-in for the browser. With
 * the flag where the bundler actually looks, the unused module is tree-shaken
 * and a client that never verifies a webhook never pulls node:crypto in.
 *
 * The claim is true: no module in this package runs anything at import time.
 * If that ever stops being true, remove the flag rather than the symptom.
 */
import { writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');

// The same shadowing applies to "imports". webhooks.js resolves its crypto
// through the subpath import "#node-crypto", and a resolver looks that up in
// the package.json nearest the importing file — which is this marker, not the
// root. Declared only at the root it resolved in Node and failed in webpack
// with "Can't resolve '#node-crypto'". Both halves are relative to their own
// directory, so the same shape works for the ESM and the CommonJS build.
const imports = {
  '#node-crypto': {
    types:   './internal/node-crypto.d.ts',
    browser: './internal/node-crypto.browser.js',
    default: './internal/node-crypto.js',
  },
};

for (const [dir, type] of [[dist, 'module'], [join(dist, 'cjs'), 'commonjs']]) {
  if (!existsSync(dir)) throw new Error(`${dir} does not exist — did the build run?`);
  writeFileSync(
    join(dir, 'package.json'),
    `${JSON.stringify({ type, sideEffects: false, imports }, null, 2)}\n`,
  );
}

console.log('dual-package markers written: dist/=module, dist/cjs/=commonjs (sideEffects, imports)');
