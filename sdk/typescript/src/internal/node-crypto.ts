/**
 * The one place this package touches a Node built-in.
 *
 * `webhooks.ts` needs HMAC-SHA256 and a constant-time comparison, and both live
 * in `node:crypto`. Importing them there directly made the whole SDK impossible
 * to bundle for a browser — not just the webhook module, because
 * `BanzamiClient` constructs a `WebhooksClient`, so every consumer that touches
 * the client pulled `node:crypto` in behind it. Next 15 refuses to bundle a
 * Node built-in for the browser and says so:
 *
 *     UnhandledSchemeError: Reading from "node:crypto" is not handled by plugins
 *
 * Isolating it here means the substitution has exactly one seam. The package's
 * `exports` map points a browser build at `node-crypto.browser.ts` instead, so
 * a bundler resolves a stub and never sees the built-in, while Node resolves
 * this file and behaves exactly as before.
 */
export { createHmac, timingSafeEqual } from 'node:crypto';
