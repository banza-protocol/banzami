/**
 * Banzami webhook signature verification.
 *
 * Implements the canonical webhook signature format:
 *   Banza-Signature: t=<unix_seconds>,v1=<hex_hmac_sha256>
 *
 * The HMAC is computed over: `"${timestamp}.${raw_body}"`
 *
 * Spec: docs/standards/webhook-signature-spec.md
 * Source of truth: services/api-gateway/internal/webhook/signer.go
 *
 * This module requires Node.js ≥ 18 (uses node:crypto).
 * It is server-side only — never import from browser or client-component code.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import type { WebhookEvent, WebhookEventType } from './types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** The canonical name of the Banzami webhook signature header. */
export const SIGNATURE_HEADER = 'Banza-Signature';

/** Maximum age of a signed request before it is rejected (seconds). */
export const TOLERANCE_SECONDS = 300;

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class BanzamiWebhookSignatureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BanzamiWebhookSignatureError';
  }
}

// ---------------------------------------------------------------------------
// Internal parsing
// ---------------------------------------------------------------------------

interface ParsedHeader {
  timestamp: number;
  v1:        string;
}

function parseSignatureHeader(header: string): ParsedHeader {
  let timestamp: number | undefined;
  let v1: string | undefined;

  for (const part of header.split(',')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const key = part.slice(0, eq).trim();
    const val = part.slice(eq + 1).trim();
    if (key === 't') {
      const n = Number(val);
      if (!Number.isInteger(n) || n <= 0) {
        throw new BanzamiWebhookSignatureError(
          `Banza-Signature: invalid timestamp value "${val}"`,
        );
      }
      timestamp = n;
    } else if (key === 'v1') {
      v1 = val;
    }
  }

  if (timestamp === undefined || !v1) {
    throw new BanzamiWebhookSignatureError(
      'Banza-Signature header is malformed: expected "t=<unix>,v1=<hex>"',
    );
  }
  return { timestamp, v1 };
}

// ---------------------------------------------------------------------------
// Core verification
// ---------------------------------------------------------------------------

/**
 * Verify a `Banza-Signature` header against the raw request body.
 *
 * @throws {BanzamiWebhookSignatureError} If the signature is invalid, the
 *   timestamp is outside the replay-protection window, or the header is
 *   malformed.
 */
export function verifySignature(
  rawBody:   string | Buffer,
  header:    string,
  secret:    string,
  options?: {
    /** Override the current time (Unix seconds) for testing. */
    currentTimestamp?: number;
    /** Max age in seconds. Set to 0 to disable replay protection. Default: 300. */
    tolerance?: number;
  },
): void {
  if (!header) {
    throw new BanzamiWebhookSignatureError(
      'Banza-Signature header is missing.',
    );
  }

  const parsed    = parseSignatureHeader(header);
  const now       = options?.currentTimestamp ?? Math.floor(Date.now() / 1000);
  const tolerance = options?.tolerance ?? TOLERANCE_SECONDS;

  if (tolerance > 0) {
    const age = Math.abs(now - parsed.timestamp);
    if (age > tolerance) {
      throw new BanzamiWebhookSignatureError(
        `Webhook timestamp is ${age}s old (tolerance: ${tolerance}s) — possible replay attack.`,
      );
    }
  }

  const body = typeof rawBody === 'string' ? Buffer.from(rawBody, 'utf-8') : rawBody;

  const mac = createHmac('sha256', secret);
  mac.update(`${parsed.timestamp}.`);
  mac.update(body);
  const expectedHex = mac.digest('hex');

  const expectedBuf = Buffer.from(expectedHex, 'utf-8');
  const receivedBuf = Buffer.from(parsed.v1, 'utf-8');

  if (
    expectedBuf.length !== receivedBuf.length ||
    !timingSafeEqual(expectedBuf, receivedBuf)
  ) {
    throw new BanzamiWebhookSignatureError(
      'Webhook signature mismatch. Ensure you are passing the raw request body ' +
      'before any JSON parsing, and that the correct webhook secret is configured.',
    );
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Verify the `Banza-Signature` header and parse the webhook event body.
 *
 * Always pass the **raw** request body — never a parsed JSON object.
 * Parsing the body before verification changes the byte sequence and
 * invalidates the HMAC.
 *
 * @param rawBody  Raw HTTP request body (Buffer or string).
 * @param header   Value of the `Banza-Signature` request header.
 * @param secret   Webhook secret from the Banzami dashboard.
 * @returns        Parsed and verified {@link WebhookEvent}.
 *
 * @throws {BanzamiWebhookSignatureError} If signature verification fails.
 *
 * @example
 * ```typescript
 * // Express / Node.js
 * import express from 'express';
 * import { constructEvent, SIGNATURE_HEADER } from '@banza/sdk/webhooks';
 *
 * app.post('/webhooks/banzami', express.raw({ type: '*\/*' }), (req, res) => {
 *   const event = constructEvent(
 *     req.body,
 *     req.headers[SIGNATURE_HEADER.toLowerCase()],
 *     process.env.BANZA_WEBHOOK_SECRET,
 *   );
 *   // handle event.type ...
 *   res.sendStatus(200);
 * });
 * ```
 */
export function constructEvent(
  rawBody: string | Buffer,
  header:  string,
  secret:  string,
  options?: Parameters<typeof verifySignature>[3],
): WebhookEvent {
  verifySignature(rawBody, header, secret, options);
  const body = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf-8');
  return JSON.parse(body) as WebhookEvent;
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/**
 * Generate a valid `Banza-Signature` header value for local testing.
 *
 * Use this in test suites and development environments to simulate incoming
 * Banzami webhook deliveries without a real Banzami account.
 *
 * @param rawBody   The webhook body to sign.
 * @param secret    Any test webhook secret string.
 * @param timestamp Unix seconds for the `t=` field. Defaults to `Date.now()`.
 * @returns         A `Banza-Signature` header value, e.g. `"t=1716000000,v1=abc123..."`.
 *
 * @example
 * ```typescript
 * const body = JSON.stringify({ type: 'payment_link.paid', ... });
 * const sig  = generateTestSignature(Buffer.from(body), 'whsec_test_secret');
 * // use sig as the Banza-Signature header in your test HTTP request
 * ```
 */
export function generateTestSignature(
  rawBody:    string | Buffer,
  secret:     string,
  timestamp?: number,
): string {
  const ts   = timestamp ?? Math.floor(Date.now() / 1000);
  const body = typeof rawBody === 'string' ? Buffer.from(rawBody, 'utf-8') : rawBody;
  const mac  = createHmac('sha256', secret);
  mac.update(`${ts}.`);
  mac.update(body);
  return `t=${ts},v1=${mac.digest('hex')}`;
}

/**
 * Build a minimal webhook event envelope for use in tests.
 *
 * @param type     Event type, e.g. `"payment_link.paid"`.
 * @param data     Event-specific payload.
 * @param id       Optional event ID. Defaults to a timestamp-based test ID.
 * @returns        A {@link WebhookEvent} object.
 */
export function generateTestEvent(
  type: WebhookEventType | string,
  data: Record<string, unknown>,
  id?: string,
): WebhookEvent {
  return {
    id:         id ?? `evt_test_${Date.now()}`,
    type,
    data,
    created_at: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// WebhooksClient — attached to BanzaClient as `.webhooks`
// ---------------------------------------------------------------------------

/**
 * Webhook verification and test-helper methods.
 *
 * Access via `banzami.webhooks.constructEvent(...)`.
 */
export class WebhooksClient {
  private readonly webhookSecret?: string;

  static readonly SIGNATURE_HEADER  = SIGNATURE_HEADER;
  static readonly TOLERANCE_SECONDS = TOLERANCE_SECONDS;

  constructor(webhookSecret?: string) {
    this.webhookSecret = webhookSecret;
  }

  /**
   * Verify the `Banza-Signature` header and parse the webhook event.
   *
   * @param rawBody  Raw HTTP request body (Buffer or string).
   * @param header   Value of the `Banza-Signature` header.
   * @param secret   Override the webhook secret configured on the client.
   */
  constructEvent(
    rawBody: string | Buffer,
    header:  string,
    secret?: string,
  ): WebhookEvent {
    const s = secret ?? this.webhookSecret;
    if (!s) {
      throw new Error(
        'A webhook secret is required. Pass webhookSecret to new BanzaClient({ webhookSecret }) ' +
        'or provide it directly to constructEvent().',
      );
    }
    return constructEvent(rawBody, header, s);
  }

  /**
   * Generate a valid `Banza-Signature` header value for local testing.
   */
  generateTestSignature(
    rawBody:    string | Buffer,
    secret?:    string,
    timestamp?: number,
  ): string {
    return generateTestSignature(rawBody, secret ?? this.webhookSecret ?? '', timestamp);
  }

  /**
   * Build a minimal webhook event envelope for use in tests.
   */
  generateTestEvent(
    type: WebhookEventType | string,
    data: Record<string, unknown>,
    id?:  string,
  ): WebhookEvent {
    return generateTestEvent(type, data, id);
  }
}
