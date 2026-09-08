/**
 * Bundle the browser checkout into a single script-tag build.
 *
 * `npm run build` has always ended with `node scripts/build-iife.js`, and this
 * file has never existed in the repository — the build failed at that step with
 * MODULE_NOT_FOUND, so the package could not be built at all. The README
 * meanwhile documents the result of that step as the supported way to use it:
 *
 *     <script src="https://cdn.banzami.com/checkout/0.1.0/checkout.iife.js">
 *
 * esbuild was already a devDependency here for exactly this, which is what the
 * missing step was meant to run.
 *
 * The output is an IIFE, not ESM: a plain <script src> on a merchant's page has
 * no module loader and no import map, so the bundle has to define a single
 * global and carry its own dependencies. `BanzamiCheckout` is that global, and
 * it is the name the README already tells integrators to call.
 */
const { build } = require('esbuild');
const { readFileSync } = require('fs');
const { join } = require('path');

const root = join(__dirname, '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

// package.json already declared these two, and neither had ever been produced:
//
//   "import":  "./dist/checkout.mjs"
//   "require": "./dist/checkout.cjs"
//
// They are emitted as .mjs and .cjs rather than .js. This package declares no
// "type", so a .js file holding ESM syntax makes Node guess — the same
// ambiguity that broke @banzami/sdk for an external developer. An explicit
// extension cannot be guessed wrong.
//
// Every declared entry point of this package resolved to a file that did not
// exist, which is why nothing in the repository imports it. They are built here
// alongside the script-tag bundle so the exports map describes something real.
const shared = {
  entryPoints: [join(root, 'src/index.ts')],
  bundle: true,
  platform: 'browser',
  // Matches the browsers the payer surface itself supports. Anything older
  // cannot run the checkout it would be loading.
  target: ['es2020', 'chrome80', 'safari14', 'firefox78', 'edge88'],
  sourcemap: true,
  // A merchant loads this from a script tag, so the bundle must be
  // self-contained: nothing may be left external.
  external: [],
  banner: { js: `/* @banzami/checkout ${pkg.version} — https://banzami.com */` },
};

const outputs = [
  // The script-tag build defines a single global, because a plain <script src>
  // on a merchant's page has no module loader and no import map.
  { ...shared, outfile: join(root, 'dist/checkout.iife.js'), format: 'iife', globalName: 'BanzamiCheckout', minify: true },
  { ...shared, outfile: join(root, 'dist/checkout.mjs'), format: 'esm' },
  { ...shared, outfile: join(root, 'dist/checkout.cjs'), format: 'cjs' },
];

Promise.all(outputs.map((o) => build(o)))
  .then(() =>
    console.log(
      `checkout bundles built: iife (global BanzamiCheckout), esm, cjs — v${pkg.version}`,
    ),
  )
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
