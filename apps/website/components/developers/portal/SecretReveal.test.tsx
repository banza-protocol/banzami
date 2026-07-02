// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { useState } from 'react';
import { SecretRevealDialog } from './ApiKeysManager';
import { ToastProvider } from './Toast';

afterEach(cleanup);

describe('SecretRevealDialog — reveal-once', () => {
  it('shows the secret once and gates dismissal on explicit acknowledgement', () => {
    const onDismiss = vi.fn();
    const setItem = vi.spyOn(Storage.prototype, 'setItem');

    render(
      <ToastProvider>
        <SecretRevealDialog secret="bz_test_sk_ABC123" onDismiss={onDismiss} />
      </ToastProvider>,
    );

    expect(screen.getByText(/bz_test_sk_ABC123/)).not.toBeNull();

    const close = screen.getByRole('button', { name: 'Fechar' }) as HTMLButtonElement;
    expect(close.disabled).toBe(true); // cannot dismiss before acknowledging
    fireEvent.click(close);
    expect(onDismiss).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('checkbox')); // acknowledge
    expect(close.disabled).toBe(false);
    fireEvent.click(close);
    expect(onDismiss).toHaveBeenCalledTimes(1);

    // The raw secret is never written to web storage.
    for (const call of setItem.mock.calls) {
      expect(String(call[1])).not.toContain('bz_test_sk_ABC123');
    }
  });

  it('drops the secret from the DOM on parent-clear and on unmount (route change / logout)', () => {
    function Harness() {
      const [secret, setSecret] = useState<string | null>('bz_test_sk_XYZ');
      return (
        <ToastProvider>
          <button onClick={() => setSecret(null)}>drop</button>
          {secret ? <SecretRevealDialog secret={secret} onDismiss={() => setSecret(null)} /> : null}
        </ToastProvider>
      );
    }
    const { unmount } = render(<Harness />);
    expect(screen.queryByText(/bz_test_sk_XYZ/)).not.toBeNull();

    fireEvent.click(screen.getByText('drop')); // navigation/logout clears parent state
    expect(screen.queryByText(/bz_test_sk_XYZ/)).toBeNull();

    unmount(); // full route change / logout unmounts the subtree
    expect(screen.queryByText(/bz_test_sk_XYZ/)).toBeNull();
  });
});
