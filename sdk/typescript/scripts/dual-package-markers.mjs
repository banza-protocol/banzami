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
 */
import { writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');

for (const [dir, type] of [[dist, 'module'], [join(dist, 'cjs'), 'commonjs']]) {
  if (!existsSync(dir)) throw new Error(`${dir} does not exist — did the build run?`);
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify({ type }, null, 2)}\n`);
}

console.log('dual-package markers written: dist/=module, dist/cjs/=commonjs');
