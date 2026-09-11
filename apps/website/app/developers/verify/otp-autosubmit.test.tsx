// @vitest-environment jsdom
/**
 * The sixth digit verifies on its own — exactly once.
 *
 * Before this, a complete code sat in the form doing nothing until the user found
 * "Verificar código". That reads as a hang: the code is visibly finished and the
 * screen does not move. The owner of this account could type all six digits and
 * still not be logged in, which is how it was found.
 *
 * Auto-submit is only safe if it fires once. Completion can arrive from a
 * keystroke, a paste, a browser one-time-code autofill, Enter, or the button, and
 * React may re-run the effect without the code changing — so the guard is a ref,
 * and these tests exist to prove it holds under each of those at once.
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const verifyMock = vi.fn();
const pushMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => new URLSearchParams('email=dev@example.test'),
}));

vi.mock('@/lib/developer-api', async () => {
  const real = await vi.importActual<typeof import('@/lib/developer-api')>('@/lib/developer-api');
  return {
    ...real,
    developerApi: {
      verify: (...a: unknown[]) => verifyMock(...a),
      requestOtp: vi.fn().mockResolvedValue({}),
    },
  };
});

import Page from './page';

const boxes = () => screen.getAllByRole('textbox') as HTMLInputElement[];
const type = (i: number, ch: string) => fireEvent.change(boxes()[i], { target: { value: ch } });
const typeAll = (code: string) => code.split('').forEach((c, i) => type(i, c));

// Vitest globals are off in this project, so Testing Library never registers its
// own afterEach cleanup: without this each test renders another form into the
// same document and getAllByRole returns the PREVIOUS test's boxes.
afterEach(() => cleanup());

beforeEach(() => {
  verifyMock.mockReset();
  verifyMock.mockResolvedValue({ ok: true });
  pushMock.mockReset();
});

describe('Developer Console OTP', () => {
  it('submits automatically once the sixth digit is entered', async () => {
    render(<Page />);
    typeAll('123456');
    await waitFor(() => expect(verifyMock).toHaveBeenCalledTimes(1));
    expect(verifyMock).toHaveBeenCalledWith('dev@example.test', '123456');
  });

  it('does not submit on five digits', async () => {
    render(<Page />);
    typeAll('12345');
    await new Promise((r) => setTimeout(r, 20));
    expect(verifyMock).not.toHaveBeenCalled();
  });

  it('a pasted six-digit code distributes and submits once', async () => {
    render(<Page />);
    fireEvent.paste(boxes()[0], { clipboardData: { getData: () => '123456' } });
    await waitFor(() => expect(verifyMock).toHaveBeenCalledTimes(1));
    expect(boxes().map((b) => b.value).join('')).toBe('123456');
  });

  it('a short paste fills what it can and does not submit', async () => {
    render(<Page />);
    fireEvent.paste(boxes()[0], { clipboardData: { getData: () => '123' } });
    await new Promise((r) => setTimeout(r, 20));
    expect(verifyMock).not.toHaveBeenCalled();
  });

  it('sixth digit racing Enter produces exactly one request', async () => {
    render(<Page />);
    typeAll('123456');
    fireEvent.keyDown(boxes()[5], { key: 'Enter' });
    await waitFor(() => expect(verifyMock).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 30));
    expect(verifyMock).toHaveBeenCalledTimes(1);
  });

  it('sixth digit followed by the fallback button produces exactly one request', async () => {
    render(<Page />);
    typeAll('123456');
    await waitFor(() => expect(verifyMock).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: /verificar/i }));
    await new Promise((r) => setTimeout(r, 30));
    expect(verifyMock).toHaveBeenCalledTimes(1);
  });

  it('a re-render after completion does not verify a second time', async () => {
    const { rerender } = render(<Page />);
    typeAll('123456');
    await waitFor(() => expect(verifyMock).toHaveBeenCalledTimes(1));
    rerender(<Page />);
    await new Promise((r) => setTimeout(r, 30));
    expect(verifyMock).toHaveBeenCalledTimes(1);
  });

  it('an invalid code shows an error, keeps the digits, and allows a retry', async () => {
    const { ApiError } = await import('@/lib/developer-api');
    verifyMock.mockRejectedValueOnce(new ApiError('VALIDATION', 400, 'bad'));
    render(<Page />);
    typeAll('123456');
    await screen.findByText(/inválido|expirado/i);
    // The code stays put: retyping a whole code after a blip is not the user's job.
    expect(boxes().map((b) => b.value).join('')).toBe('123456');
    // Correcting a digit re-arms submission.
    verifyMock.mockResolvedValueOnce({ ok: true });
    type(5, '');
    type(5, '7');
    await waitFor(() => expect(verifyMock).toHaveBeenCalledTimes(2));
    expect(verifyMock).toHaveBeenLastCalledWith('dev@example.test', '123457');
  });

  it('a network failure is not reported as an invalid code', async () => {
    verifyMock.mockRejectedValueOnce(new Error('network down'));
    render(<Page />);
    typeAll('123456');
    const msg = await screen.findByText(/não foi possível verificar/i);
    expect(msg).toBeTruthy();
  });

  it('backspace on an empty field steps back to the previous one', () => {
    render(<Page />);
    typeAll('12');
    fireEvent.keyDown(boxes()[2], { key: 'Backspace' });
    expect(document.activeElement).toBe(boxes()[1]);
  });

  it('carries one-time-code autofill semantics on every position', () => {
    render(<Page />);
    for (const b of boxes()) {
      expect(b.getAttribute('autocomplete')).toBe('one-time-code');
      expect(b.getAttribute('inputmode')).toBe('numeric');
    }
  });

  it('never puts the code in the URL or browser storage', async () => {
    // localStorage is not provided by this runner, so reading it proves nothing.
    // What matters is that the component never WRITES a code anywhere persistent:
    // spy on the storage prototype and on history, and assert neither ever sees it.
    const writes: string[] = [];
    const origSet = typeof Storage === 'undefined' ? undefined : Storage.prototype.setItem;
    if (origSet) {
      Storage.prototype.setItem = function (k: string, v: string) {
        writes.push(`${k}=${v}`);
      };
    }
    const pushSpy = vi.spyOn(window.history, 'pushState').mockImplementation(() => {});
    const replaceSpy = vi.spyOn(window.history, 'replaceState').mockImplementation(() => {});
    try {
      render(<Page />);
      typeAll('123456');
      await waitFor(() => expect(verifyMock).toHaveBeenCalledTimes(1));
      expect(window.location.href).not.toContain('123456');
      expect(writes.join('|')).not.toContain('123456');
      for (const call of [...pushSpy.mock.calls, ...replaceSpy.mock.calls]) {
        expect(JSON.stringify(call)).not.toContain('123456');
      }
    } finally {
      if (origSet) Storage.prototype.setItem = origSet;
      pushSpy.mockRestore();
      replaceSpy.mockRestore();
    }
  });
});
