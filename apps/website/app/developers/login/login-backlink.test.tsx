// @vitest-environment jsdom
//
// Focused test for the "← Voltar ao Banzami" control on the Developer Console
// login page: it must be a real anchor to https://banzami.com, present on the
// page, and no link on the page may point at the backend developer-api host.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import LoginPage from './page';

// Keep the test focused on rendered navigation, independent of the App Router
// runtime and the API client.
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: unknown }) => (
    <a href={href} {...(rest as Record<string, unknown>)}>
      {children as never}
    </a>
  ),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock('@/lib/developer-api', () => ({
  developerApi: { requestOtp: vi.fn() },
  ApiError: class ApiError extends Error {},
}));

afterEach(cleanup);

describe('Login page — "Voltar ao Banzami" back link', () => {
  it('is a real anchor to exactly https://banzami.com, present on the page', () => {
    render(<LoginPage />);
    const back = screen.getByRole('link', { name: 'Voltar ao Banzami' });
    expect(back.tagName).toBe('A');
    expect(back.getAttribute('href')).toBe('https://banzami.com');
  });

  it('is keyboard-focusable (native anchor with href, no tabindex removal)', () => {
    render(<LoginPage />);
    const back = screen.getByRole('link', { name: 'Voltar ao Banzami' });
    // A native <a href> is in the tab order; ensure it wasn't opted out.
    expect(back.getAttribute('tabindex')).not.toBe('-1');
  });

  it('no link on the login page points at the backend developer-api host', () => {
    const { container } = render(<LoginPage />);
    const anchors = Array.from(container.querySelectorAll('a[href]'));
    expect(anchors.length).toBeGreaterThan(0);
    for (const a of anchors) {
      expect(a.getAttribute('href') ?? '').not.toContain('developer-api.banzami.com');
    }
  });
});
