/**
 * The browser half of the seam described in node-crypto.ts.
 *
 * Webhook verification computes an HMAC over the raw request body using the
 * endpoint's signing secret. That secret belongs on a server and nowhere else:
 * putting it in a page would publish it to every visitor, and a signature
 * verified in the browser proves nothing about the request the server received.
 *
 * So this is not a missing feature to be polyfilled later. Verification is
 * server-side by design, and calling it here is a mistake worth naming rather
 * than a TypeError about `createHmac` being undefined.
 */
const REASON =
  'Webhook signature verification is server-side only. It needs your endpoint ' +
  'signing secret, which must never reach a browser. Verify the signature in ' +
  'your server route or serverless function, then send the result to the page.';

export function createHmac(): never {
  throw new Error(`@banzami/sdk: ${REASON}`);
}

export function timingSafeEqual(): never {
  throw new Error(`@banzami/sdk: ${REASON}`);
}
