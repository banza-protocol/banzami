// Unit tests for the Sandbox transfer E2E guards.
// Run: node --test tools/e2e/transfer-guards.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  E2E_HANDLE_PREFIX,
  MAX_NOMINAL_MINOR,
  assertExplicitRun,
  assertSandboxConsumerBase,
  assertTestHandle,
  assertNominalAmount,
} from './transfer-guards.mjs';

test('is inert unless BANZAMI_E2E=RUN', () => {
  assert.throws(() => assertExplicitRun(undefined), /inert/i);
  assert.throws(() => assertExplicitRun('1'), /inert/i);
  assert.doesNotThrow(() => assertExplicitRun('RUN'));
});

test('refuses any non-Sandbox base URL', () => {
  assert.throws(() => assertSandboxConsumerBase('https://api.banzami.com/consumer'), /non-Sandbox/);
  assert.throws(() => assertSandboxConsumerBase(''), /non-Sandbox/);
  // sandbox but not the consumer surface
  assert.throws(() => assertSandboxConsumerBase('https://sandbox-api.banzami.com/v1'), /consumer surface/);
  assert.doesNotThrow(() => assertSandboxConsumerBase('https://sandbox-api.banzami.com/consumer'));
});

test('only registers e2e-tagged handles', () => {
  assert.throws(() => assertTestHandle('realuser'), /tagged/);
  assert.doesNotThrow(() => assertTestHandle(`${E2E_HANDLE_PREFIX}send123`));
});

test('only sends positive nominal amounts', () => {
  assert.throws(() => assertNominalAmount(0), /positive/);
  assert.throws(() => assertNominalAmount(-100), /positive/);
  assert.throws(() => assertNominalAmount(MAX_NOMINAL_MINOR + 1), /non-nominal/);
  assert.doesNotThrow(() => assertNominalAmount(250_000));
});
