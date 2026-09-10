/**
 * The part of OTP submission that must be exactly-once, extracted so it can be
 * proven exactly-once.
 *
 * A completed code can arrive from a keystroke, a paste, a browser one-time-code
 * autofill, Enter, or the fallback button, and React may re-run the effect
 * without the code changing. The component tests cover those orderings, but they
 * cannot discriminate the guard that actually matters: under `fireEvent` React
 * flushes state between events, so a `useState` guard and a `useRef` guard behave
 * identically there, and swapping one for the other fails nothing. That is a
 * test suite proving the feature works, not proving the race is closed.
 *
 * Here the guard is a plain closure variable, so two callers in the SAME TICK —
 * before any promise resolves and before any render could commit — see the real
 * thing. Removing the guard makes the second call go through, which is the
 * mutation the component suite could never catch.
 */
export type SubmitCoordinator = {
  /** Submit a code, at most once until the previous attempt settles. */
  submit(code: string, run: (code: string) => Promise<unknown>): void;
  /** Called when the code becomes incomplete again, re-arming submission. */
  invalidate(): void;
  /** True when a verification is in flight. */
  busy(): boolean;
};

export function createSubmitCoordinator(length: number): SubmitCoordinator {
  // Deliberately closure state, not React state: state updates are batched, and
  // a second trigger in the same tick would read a stale `false`.
  let inFlight = false;
  let lastSubmitted = '';

  return {
    submit(code, run) {
      if (code.length !== length) return;
      // Two guards, two different jobs. `inFlight` stops a concurrent second
      // request; `lastSubmitted` stops a re-render from resubmitting a code that
      // already had its answer.
      if (inFlight || lastSubmitted === code) return;
      inFlight = true;
      lastSubmitted = code;
      // The caller owns error handling; this only needs the settle signal. Without
      // the catch, .finally() re-throws a rejection nobody is listening for and
      // the page raises an unhandled promise rejection on every failed code.
      void Promise.resolve(run(code))
        .catch(() => undefined)
        .finally(() => {
          inFlight = false;
        });
    },
    invalidate() {
      // Clearing on incompleteness is what lets a corrected digit — or the same
      // code retyped after a failure — submit again.
      lastSubmitted = '';
    },
    busy() {
      return inFlight;
    },
  };
}
