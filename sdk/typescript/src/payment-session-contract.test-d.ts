/**
 * Type-level contract for createPaymentSession.
 *
 * The published 0.5.0 made `walletAccountId` required, which meant the
 * documented developer Quickstart did not compile: a Developer Platform key
 * must NOT send a payee (the server derives it from the project binding and
 * rejects a client-supplied one with 400), yet the type demanded it. A
 * TypeScript developer following the public docs literally was stuck between a
 * cast and a guaranteed 400.
 *
 * These are compile-time assertions. `tsc --noEmit` over this file fails if
 * either credential model stops type-checking, which is the only way this
 * particular defect shows up — it is invisible to runtime tests, because the
 * runtime was always correct (an undefined field is simply omitted from the
 * JSON body).
 */
import type { CreatePaymentSessionParams } from './types.js';

// ── Developer Platform credential: the payee is NOT sent ─────────────────────
// This is the shape the public Quickstart shows. It must compile as written,
// with no cast and no placeholder id.
const developerGoldenPath: CreatePaymentSessionParams = {
  amountMinor: 250_000,
  currency: 'AOA',
  description: 'Donation',
};

// Minimal form — an open-amount session with nothing else supplied.
const developerOpenAmount: CreatePaymentSessionParams = {
  currency: 'AOA',
};

// ── Merchant credential: the payee IS sent ───────────────────────────────────
// Supplying it must keep compiling, so this correction cannot silently break
// an existing merchant integration.
const merchantPath: CreatePaymentSessionParams = {
  walletAccountId: 'wa_example',
  amountMinor: 250_000,
  currency: 'AOA',
};

// ── The field keeps its type when present ────────────────────────────────────
// Optional must not mean untyped: a wrong type here is still an error.
// @ts-expect-error walletAccountId is a string when supplied
const wrongType: CreatePaymentSessionParams = { walletAccountId: 123 };

// Reference them so nothing is elided as unused.
export const _contract = [
  developerGoldenPath,
  developerOpenAmount,
  merchantPath,
  wrongType,
] as const;
