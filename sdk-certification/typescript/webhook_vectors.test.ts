/**
 * Cross-SDK certification: TypeScript webhook signature verification.
 *
 * Runs the shared golden test vectors from sdk-certification/vectors/webhook_signatures.json
 * against the TypeScript SDK implementation.
 *
 * Run from the sdk/typescript directory:
 *   npx vitest run ../../sdk-certification/typescript/webhook_vectors.test.ts
 *
 * Or from sdk-certification/typescript:
 *   npx vitest run webhook_vectors.test.ts
 */

import { readFileSync } from 'node:fs';
import { join }         from 'node:path';
import { describe, it, expect } from 'vitest';

import {
  verifySignature,
  generateTestSignature,
  BanzamiWebhookSignatureError,
} from '../../sdk/typescript/src/webhooks.js';

// ---------------------------------------------------------------------------
// Load shared vectors
// ---------------------------------------------------------------------------

const vectorsPath = join(__dirname, '../vectors/webhook_signatures.json');
const suite       = JSON.parse(readFileSync(vectorsPath, 'utf-8'));
const SECRET      = suite.shared_secret as string;
const vectors     = suite.vectors as Array<{
  id:                          string;
  description:                 string;
  timestamp:                   number | null;
  raw_body:                    string;
  expected_header:             string;
  current_timestamp_for_test:  number;
  expected_result:             string;
}>;

function getVector(id: string) {
  const v = vectors.find(v => v.id === id);
  if (!v) throw new Error(`Vector ${id} not found`);
  return v;
}

// ---------------------------------------------------------------------------
// Valid vectors
// ---------------------------------------------------------------------------

describe('valid signatures', () => {
  it('V-001: valid payment_link.paid event', () => {
    const v = getVector('V-001');
    expect(() =>
      verifySignature(v.raw_body, v.expected_header, SECRET, {
        currentTimestamp: v.current_timestamp_for_test,
      }),
    ).not.toThrow();
  });

  it('V-002: valid transaction.completed event', () => {
    const v = getVector('V-002');
    expect(() =>
      verifySignature(v.raw_body, v.expected_header, SECRET, {
        currentTimestamp: v.current_timestamp_for_test,
      }),
    ).not.toThrow();
  });

  it('V-005: exactly at tolerance boundary (300s) must pass', () => {
    const v = getVector('V-005');
    expect(() =>
      verifySignature(v.raw_body, v.expected_header, SECRET, {
        currentTimestamp: v.current_timestamp_for_test,
      }),
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Replay rejection
// ---------------------------------------------------------------------------

describe('replay attack protection', () => {
  it('V-003: expired timestamp (400s old) must be rejected', () => {
    const v = getVector('V-003');
    expect(() =>
      verifySignature(v.raw_body, v.expected_header, SECRET, {
        currentTimestamp: v.current_timestamp_for_test,
      }),
    ).toThrow(BanzamiWebhookSignatureError);
  });
});

// ---------------------------------------------------------------------------
// Signature mismatches
// ---------------------------------------------------------------------------

describe('signature mismatch', () => {
  it('V-006: tampered body must be rejected', () => {
    const v = getVector('V-006');
    expect(() =>
      verifySignature(v.raw_body, v.expected_header, SECRET, {
        currentTimestamp: v.current_timestamp_for_test,
      }),
    ).toThrow(BanzamiWebhookSignatureError);
  });

  it('V-007: wrong secret must be rejected', () => {
    const v = getVector('V-007');
    expect(() =>
      verifySignature(v.raw_body, v.expected_header, SECRET, {
        currentTimestamp: v.current_timestamp_for_test,
      }),
    ).toThrow(BanzamiWebhookSignatureError);
  });
});

// ---------------------------------------------------------------------------
// Malformed headers
// ---------------------------------------------------------------------------

describe('malformed headers', () => {
  it('V-008: legacy sha256= format must be rejected', () => {
    const v = getVector('V-008');
    expect(() =>
      verifySignature(v.raw_body, v.expected_header, SECRET, {
        currentTimestamp: v.current_timestamp_for_test,
      }),
    ).toThrow(BanzamiWebhookSignatureError);
  });

  it('V-009: missing t= field must be rejected', () => {
    const v = getVector('V-009');
    expect(() =>
      verifySignature(v.raw_body, v.expected_header, SECRET, {
        currentTimestamp: v.current_timestamp_for_test,
      }),
    ).toThrow(BanzamiWebhookSignatureError);
  });

  it('V-010: missing v1= field must be rejected', () => {
    const v = getVector('V-010');
    expect(() =>
      verifySignature(v.raw_body, v.expected_header, SECRET, {
        currentTimestamp: v.current_timestamp_for_test,
      }),
    ).toThrow(BanzamiWebhookSignatureError);
  });

  it('V-011: empty header must be rejected', () => {
    const v = getVector('V-011');
    expect(() =>
      verifySignature(v.raw_body, v.expected_header, SECRET, {
        currentTimestamp: v.current_timestamp_for_test,
      }),
    ).toThrow(BanzamiWebhookSignatureError);
  });

  it('V-012: wrong header format (old Banza-Signature style) must be rejected', () => {
    const v = getVector('V-012');
    expect(() =>
      verifySignature(v.raw_body, v.expected_header, SECRET, {
        currentTimestamp: v.current_timestamp_for_test,
      }),
    ).toThrow(BanzamiWebhookSignatureError);
  });
});

// ---------------------------------------------------------------------------
// generateTestSignature cross-verification
// ---------------------------------------------------------------------------

describe('generateTestSignature cross-verification', () => {
  it('V-001: generateTestSignature output matches golden vector', () => {
    const v   = getVector('V-001');
    const sig = generateTestSignature(v.raw_body, SECRET, v.timestamp!);
    expect(sig).toBe(v.expected_header);
  });

  it('V-002: generateTestSignature output matches golden vector', () => {
    const v   = getVector('V-002');
    const sig = generateTestSignature(v.raw_body, SECRET, v.timestamp!);
    expect(sig).toBe(v.expected_header);
  });

  it('generated signature is verifiable', () => {
    const body = '{"type":"payment_link.paid","id":"evt_gen_001"}';
    const ts   = 1716001000;
    const sig  = generateTestSignature(body, SECRET, ts);
    expect(() =>
      verifySignature(body, sig, SECRET, { currentTimestamp: ts }),
    ).not.toThrow();
  });
});
