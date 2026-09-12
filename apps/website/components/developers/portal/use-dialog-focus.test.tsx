// @vitest-environment jsdom
/**
 * A modal that says `aria-modal="true"` must mean it.
 *
 * Both of this Console's dialogs made that promise and neither kept it: Tab
 * walked straight out into the page behind the overlay, where a sighted
 * keyboard user operates controls they cannot see and a screen-reader user is
 * told they are still inside a modal. Closing one also dropped focus at the top
 * of the document, so getting back to the row you were acting on meant tabbing
 * through the whole sidebar.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useRef } from 'react';
import { useDialogFocus } from './use-dialog-focus';

afterEach(cleanup);

function Harness({ withInitial = false }: { withInitial?: boolean }) {
  const surface = useRef<HTMLDivElement>(null);
  const second = useRef<HTMLButtonElement>(null);
  useDialogFocus(surface, withInitial ? second : undefined);
  return (
    <div>
      <button type="button">fora</button>
      <div ref={surface} role="dialog" aria-modal="true">
        <button type="button">primeiro</button>
        <button type="button" ref={second}>segundo</button>
        <button type="button" disabled>desactivado</button>
        <button type="button">último</button>
      </div>
    </div>
  );
}

describe('useDialogFocus', () => {
  it('moves focus into the dialog on open', () => {
    render(<Harness />);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'primeiro' }));
  });

  it('honours an explicit initial target — the safe action, not the destructive one', () => {
    render(<Harness withInitial />);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'segundo' }));
  });

  it('wraps Tab from the last control back to the first', () => {
    render(<Harness />);
    const last = screen.getByRole('button', { name: 'último' });
    last.focus();
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'primeiro' }));
  });

  it('wraps Shift+Tab from the first control back to the last', () => {
    render(<Harness />);
    screen.getByRole('button', { name: 'primeiro' }).focus();
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'último' }));
  });

  it('pulls focus back in when it is already outside the dialog', () => {
    render(<Harness />);
    screen.getByRole('button', { name: 'fora' }).focus();
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(document.activeElement).not.toBe(screen.getByRole('button', { name: 'fora' }));
  });

  it('never lands on a disabled control', () => {
    render(<Harness />);
    // Walking the ring must never stop on something that does nothing — that
    // reads as the dialog being broken.
    for (let i = 0; i < 6; i++) {
      fireEvent.keyDown(window, { key: 'Tab' });
      expect((document.activeElement as HTMLButtonElement).disabled).not.toBe(true);
    }
  });

  it('gives focus back to whatever opened it', () => {
    render(
      <div>
        <button type="button">abrir</button>
      </div>,
    );
    const opener = screen.getByRole('button', { name: 'abrir' });
    opener.focus();

    const view = render(<Harness />);
    // The hook took focus on mount, so the opener has lost it.
    expect(document.activeElement).not.toBe(opener);

    view.unmount();
    expect(document.activeElement).toBe(opener);
  });
});
