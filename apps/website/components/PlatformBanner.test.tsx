// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';

/**
 * The public site's SANDBOX disclosure.
 *
 * No money on this platform is real. The disclosure is therefore the first thing
 * a reader is owed, and the failure that matters is the silent one: a page that
 * looks like a live payment network because the banner never rendered.
 *
 * It used to start hidden and appear after an effect resolved, so the first
 * paint of every public page carried no disclosure, and a reader whose
 * JavaScript never ran got none at all.
 */

const { getPlatformMode } = vi.hoisted(() => ({ getPlatformMode: vi.fn() }));
vi.mock('@/lib/api', () => ({ getPlatformMode }));

import { PlatformBanner } from './PlatformBanner';

// The banner is the element with role=status; matching on the word SANDBOX
// alone finds both spans inside it.
const banner = () => screen.queryByRole('status');

// The banner starts shown, so `waitFor(() => expect(banner()).toBeTruthy())`
// passes on its first tick — before the mode has been applied — and would report
// green for a component that hides the banner the moment it reads. Every test
// about the SETTLED state renders and then lets the effect's promise resolve, so
// what it asserts is the state after the read, not the state before it.
async function renderSettled() {
  await act(async () => { render(<PlatformBanner />); });
}

beforeEach(() => { cleanup(); getPlatformMode.mockReset(); });

describe('the SANDBOX disclosure', () => {
  it('is present on the first paint, before anything has been read', () => {
    getPlatformMode.mockReturnValue(new Promise(() => {})); // never settles
    render(<PlatformBanner />);
    expect(banner()).toBeTruthy();
  });

  it('stays when the mode reads SANDBOX', async () => {
    getPlatformMode.mockResolvedValue({ mode: 'SANDBOX', public_banner: true, message: '' });
    await renderSettled();
    expect(banner()).toBeTruthy();
  });

  it('stays when the read fails and the mode is unknown', async () => {
    // getPlatformMode already falls back to SANDBOX on any failure; this asserts
    // the banner does not withdraw on anything short of a confirmed LIVE.
    getPlatformMode.mockResolvedValue({ mode: 'SANDBOX', public_banner: false, message: '' });
    await renderSettled();
    expect(banner()).toBeTruthy();
  });

  it('stays for a mode it does not recognise', async () => {
    // Only LIVE silences it. A third mode added later — or a malformed read that
    // slips past the api-layer fallback — must not be treated as production.
    getPlatformMode.mockResolvedValue({ mode: 'PILOT', public_banner: false, message: '' } as never);
    await renderSettled();
    expect(banner()).toBeTruthy();
  });

  it('is withdrawn only when the mode comes back confirmed LIVE', async () => {
    getPlatformMode.mockResolvedValue({ mode: 'LIVE', public_banner: false, message: '' });
    await renderSettled();
    expect(banner()).toBeNull();
  });
});
