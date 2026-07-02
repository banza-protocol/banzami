// @vitest-environment jsdom
//
// Focused test for the homepage primary CTA ("Começar") navigation connection.
// Per the Claude Design handoff (§"Ponto de entrada"), the header CTA leads into
// the Developer Console login flow. This test pins the destination and guards
// two rules: desktop/mobile lead to the *same* frontend route, and no rendered
// nav link points at the authenticated backend API host.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { BanzamiNav } from './BanzamiNav';
import { DEVELOPERS_LOGIN_URL } from '@/lib/site';

// Render next/link as a plain anchor so the test targets navigation
// destinations without depending on the Next App Router runtime.
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string | { pathname?: string }; children: unknown }) => {
    const h = typeof href === 'string' ? href : (href?.pathname ?? '#');
    return (
      <a href={h} {...(rest as Record<string, unknown>)}>
        {children as never}
      </a>
    );
  },
}));

afterEach(cleanup);

const CONSOLE_LOGIN = 'https://developers.banzami.com/login';

describe('Homepage "Começar" CTA → Developer Console login', () => {
  it('exposes the exact Console frontend login route as the single source of truth', () => {
    expect(DEVELOPERS_LOGIN_URL).toBe(CONSOLE_LOGIN);
    // It is the Console *frontend* host — never the authenticated backend API.
    expect(DEVELOPERS_LOGIN_URL).not.toContain('developer-api.banzami.com');
    // Always a full frontend route, not an API path.
    expect(DEVELOPERS_LOGIN_URL.startsWith('https://developers.banzami.com/')).toBe(true);
  });

  it('desktop CTA is a real keyboard-navigable link to the Console login route', () => {
    render(<BanzamiNav />);
    const cta = screen.getByRole('link', { name: /Começar/i });
    // A real <a href> (focusable / normal browser navigation), not a button/alert.
    expect(cta.tagName).toBe('A');
    expect(cta.getAttribute('href')).toBe(CONSOLE_LOGIN);
  });

  it('mobile CTA leads to the same route (desktop/mobile consistent)', () => {
    const { container } = render(<BanzamiNav />);
    // Open the mobile overlay via the burger (hidden from the a11y tree by the
    // mobile-only CSS, so target it directly).
    fireEvent.click(container.querySelector('.bz-burger') as Element);
    const ctas = screen.getAllByRole('link', { name: /Começar/i });
    // Desktop + mobile CTA both present.
    expect(ctas.length).toBeGreaterThanOrEqual(2);
    for (const cta of ctas) {
      expect(cta.tagName).toBe('A');
      expect(cta.getAttribute('href')).toBe(CONSOLE_LOGIN);
    }
  });

  it('no rendered nav link points directly at the backend developer-api host', () => {
    const { container } = render(<BanzamiNav />);
    fireEvent.click(container.querySelector('.bz-burger') as Element);
    const anchors = Array.from(container.querySelectorAll('a[href]'));
    expect(anchors.length).toBeGreaterThan(0);
    for (const a of anchors) {
      expect(a.getAttribute('href') ?? '').not.toContain('developer-api.banzami.com');
    }
  });
});
