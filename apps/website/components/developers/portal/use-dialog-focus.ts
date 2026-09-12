'use client';

import { useEffect, useRef, type RefObject } from 'react';

/**
 * Keep focus inside a modal dialog, and give it back when the dialog closes.
 *
 * `aria-modal="true"` is a promise to assistive technology that nothing outside
 * the dialog is reachable. Both of this Console's dialogs made that promise and
 * neither kept it: Tab walked straight out into the page behind the overlay,
 * where a sighted keyboard user operates controls they cannot see and a screen
 * reader user is told they are still in a modal.
 *
 * Returning focus matters as much as trapping it. Without it, closing a dialog
 * drops a keyboard user at the top of the document — which on this Console means
 * tabbing through the whole sidebar to get back to the row they were acting on.
 *
 * `initial` is focused on open. Choose it deliberately: the safe action, never
 * the destructive one.
 *
 * Escape is NOT handled here. Whether Escape may close a dialog is a decision
 * about that dialog: the confirm dialog closes (cancelling is safe), and the
 * reveal-once dialog does not (a secret dismissed by a stray keypress is gone
 * for good). Putting it in the shared hook would make that an accident.
 */
export function useDialogFocus(
  surface: RefObject<HTMLElement | null>,
  initial?: RefObject<HTMLElement | null>,
) {
  const opener = useRef<Element | null>(null);

  useEffect(() => {
    opener.current = document.activeElement;
    const target = initial?.current ?? focusableIn(surface.current)?.[0];
    target?.focus();
    return () => { (opener.current as HTMLElement | null)?.focus?.(); };
    // Deliberately once, on mount: re-running would steal focus from whatever
    // the person has since tabbed to inside the dialog.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const focusable = focusableIn(surface.current);
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      const outside = !surface.current?.contains(active);
      if (e.shiftKey && (active === first || outside)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || outside)) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [surface]);
}

/**
 * The controls a person can actually reach, in document order.
 *
 * Disabled controls are excluded because they are not reachable — a trap that
 * counted them would land focus on a button that does nothing, which reads as
 * the dialog being broken.
 */
function focusableIn(root: HTMLElement | null): HTMLElement[] | null {
  if (!root) return null;
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), ' +
        'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  );
}
