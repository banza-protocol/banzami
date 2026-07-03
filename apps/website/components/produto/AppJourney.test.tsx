// @vitest-environment jsdom
//
// AppJourney is the shared auto-scroll rail behind the produto "A APP" screens
// and the homepage merchant marquee. It pauses while the user interacts (hover,
// touch, or keyboard focus of a child) and resumes after. The pause flag is
// mirrored to data-paused so it is observable here. jsdom does not run real
// rAF/scroll, so we assert the interaction wiring, plus that the homepage
// marquee actually uses this component.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { AppJourney } from './AppJourney';

function mockMatchMedia(reduced: boolean) {
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: reduced,
    media: q,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent() {
      return false;
    },
  }));
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderRail() {
  const utils = render(
    <AppJourney className="flex gap-[10px] overflow-x-auto">
      <a href="https://example.com" data-testid="chip">
        @doa
      </a>
    </AppJourney>,
  );
  const rail = utils.container.firstElementChild as HTMLElement;
  return { ...utils, rail };
}

describe('AppJourney — pause on interaction', () => {
  beforeEach(() => mockMatchMedia(false));

  it('starts running and pauses on hover, resumes on mouse leave', () => {
    const { rail } = renderRail();
    expect(rail.dataset.paused).toBe('false');
    fireEvent.mouseEnter(rail);
    expect(rail.dataset.paused).toBe('true');
    fireEvent.mouseLeave(rail);
    expect(rail.dataset.paused).toBe('false');
  });

  it('pauses when a chip inside receives keyboard focus, resumes when focus leaves the rail', () => {
    const { rail, getByTestId } = renderRail();
    fireEvent.focus(getByTestId('chip')); // → onFocusCapture on the rail
    expect(rail.dataset.paused).toBe('true');
    fireEvent.blur(getByTestId('chip'), { relatedTarget: document.body }); // focus leaves the rail
    expect(rail.dataset.paused).toBe('false');
  });

  it('pauses on touch start (mobile) without breaking native scroll', () => {
    const { rail } = renderRail();
    fireEvent.touchStart(rail);
    expect(rail.dataset.paused).toBe('true');
    // still a native scroll container
    expect(rail.className).toContain('overflow-x-auto');
  });

  it('honors reduced motion (no auto-scroll; still natively scrollable)', () => {
    mockMatchMedia(true);
    const { rail } = renderRail();
    expect(rail.className).toContain('overflow-x-auto');
    expect(rail.dataset.paused).toBe('false');
  });
});

describe('homepage merchant marquee uses AppJourney (same pattern as "A APP")', () => {
  it('wraps the merchant chips in <AppJourney>, not a CSS-only marquee', () => {
    const page = readFileSync(resolve(process.cwd(), 'app/page.tsx'), 'utf8');
    expect(page).toMatch(/<AppJourney[^>]*>[\s\S]*ENTITY_CHIPS[\s\S]*EntityChip[\s\S]*<\/AppJourney>/);
    // the CSS-only marquee track is no longer used here
    expect(page).not.toContain('anim-marquee');
  });
});
