import { describe, expect, it, vi } from 'vitest';
import { createSubmitCoordinator } from './otp-submit-coordinator';

const CODE = '123456';
const other = '654321';

/** A run that never settles, so "in flight" is a real state during the test. */
const pending = () => new Promise<void>(() => {});

describe('OTP submit coordinator', () => {
  it('submits a complete code once', () => {
    const run = vi.fn(pending);
    const c = createSubmitCoordinator(6);
    c.submit(CODE, run);
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith(CODE);
  });

  it('ignores an incomplete code', () => {
    const run = vi.fn(pending);
    const c = createSubmitCoordinator(6);
    c.submit('12345', run);
    expect(run).not.toHaveBeenCalled();
  });

  // THE RACE. Two triggers in the same tick, before anything resolves and before
  // any render could commit — the sixth digit and Enter, or a paste that also
  // completes the code. A state-based guard reads stale here; a synchronous one
  // does not.
  it('two same-tick submissions produce exactly one request', () => {
    const run = vi.fn(pending);
    const c = createSubmitCoordinator(6);
    c.submit(CODE, run);
    c.submit(CODE, run);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('many same-tick submissions still produce exactly one request', () => {
    const run = vi.fn(pending);
    const c = createSubmitCoordinator(6);
    for (let i = 0; i < 10; i++) c.submit(CODE, run);
    expect(run).toHaveBeenCalledTimes(1);
  });

  // A DIFFERENT code arriving while one is in flight must not start a second
  // request either — the first attempt owns the session until it settles.
  it('a different code while in flight is refused', () => {
    const run = vi.fn(pending);
    const c = createSubmitCoordinator(6);
    c.submit(CODE, run);
    c.submit(other, run);
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith(CODE);
  });

  it('a re-render replaying the same completed code does not resubmit', async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    const c = createSubmitCoordinator(6);
    c.submit(CODE, run);
    await Promise.resolve();
    await Promise.resolve();
    c.submit(CODE, run); // effect re-runs, code unchanged
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('correcting a digit re-arms submission, including for the same code', async () => {
    const run = vi.fn().mockRejectedValue(new Error('invalid'));
    const c = createSubmitCoordinator(6);
    c.submit(CODE, run);
    await Promise.resolve();
    await Promise.resolve();
    expect(c.busy()).toBe(false);

    // The user edits a digit — the code is briefly incomplete — then retypes the
    // very same code. It must be allowed to go again.
    c.invalidate();
    c.submit(CODE, run);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('releases after the attempt settles', async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    const c = createSubmitCoordinator(6);
    c.submit(CODE, run);
    expect(c.busy()).toBe(true);
    await Promise.resolve();
    await Promise.resolve();
    expect(c.busy()).toBe(false);
  });

  it('releases even when the attempt rejects', async () => {
    const run = vi.fn().mockRejectedValue(new Error('network'));
    const c = createSubmitCoordinator(6);
    c.submit(CODE, run);
    await Promise.resolve();
    await Promise.resolve();
    expect(c.busy()).toBe(false);
  });
});
