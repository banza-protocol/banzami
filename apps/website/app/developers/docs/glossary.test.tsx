// @vitest-environment jsdom
//
// Tests for the contextual glossary system: the canonical data map and the
// accessible GlossaryTerm popover (aria-expanded/aria-controls disclosure,
// persistent aria-describedby, keyboard-reachable link, Escape returns focus,
// no focusable descendant inside an aria-hidden container, body-portal popover
// that cannot be clipped, deep link, children override, unknown-id fallback).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { GlossaryTerm } from './GlossaryTerm';
import { GLOSSARY, GLOSSARY_BY_ID } from './glossary';

const FOCUSABLE = 'a[href],button,input,select,textarea,[tabindex]';

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(cleanup);

describe('glossary data (single source of truth)', () => {
  it('has 28 canonical terms with unique ids and real definitions', () => {
    expect(GLOSSARY).toHaveLength(28);
    const ids = GLOSSARY.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const e of GLOSSARY) {
      expect(e.term.trim().length).toBeGreaterThan(0);
      expect(e.def.trim().length).toBeGreaterThan(20);
    }
  });

  it('contains every id annotated in the docs prose', () => {
    const annotated = [
      'sandbox', 'producao', 'otp', 'webhook', 'liquidacao', 'ledger', 'qr',
      'comprovativo', 'sessao-pagamento', 'chave-publicavel', 'chave-secreta',
      'api-key', 'banza-handle', 'idempotencia', 'banza-signature', 'hmac-sha256',
      'at-least-once', 'replay',
    ];
    for (const id of annotated) expect(GLOSSARY_BY_ID[id]).toBeTruthy();
  });
});

describe('GlossaryTerm — accessible popover', () => {
  it('exposes the definition via a persistent aria-describedby (immediate context)', () => {
    render(<GlossaryTerm id="sandbox" />);
    const btn = screen.getByRole('button', { name: /sandbox/i });
    const descId = btn.getAttribute('aria-describedby')!;
    expect(document.getElementById(descId)?.textContent).toContain(GLOSSARY_BY_ID['sandbox'].def);
  });

  it('reflects open/closed via aria-expanded and points aria-controls at the popover', () => {
    render(<GlossaryTerm id="sandbox" />);
    const btn = screen.getByRole('button');
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    expect(btn.getAttribute('aria-controls')).toBeNull();

    fireEvent.click(btn);
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    const controls = btn.getAttribute('aria-controls')!;
    expect(controls).toBeTruthy();
    expect(document.getElementById(controls)).toBe(document.querySelector('.bz-pop'));

    fireEvent.click(btn);
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    expect(btn.getAttribute('aria-controls')).toBeNull();
  });

  it('is present in the accessibility tree when open (role=group, labelled, not aria-hidden) with a real link', () => {
    render(<GlossaryTerm id="qr" />);
    fireEvent.click(screen.getByRole('button'));
    const pop = document.querySelector('.bz-pop') as HTMLElement;
    expect(pop.parentElement).toBe(document.body); // portaled — never clipped
    expect(pop.style.position).toBe('fixed');
    expect(pop.getAttribute('aria-hidden')).toBeNull(); // in the a11y tree
    expect(pop.getAttribute('role')).toBe('group');
    expect(pop.getAttribute('aria-label')).toBe('QR');
    const link = within(pop).getByRole('link', { name: /Ver nos conceitos/i });
    expect(link.getAttribute('href')).toBe('#glossario-qr'); // internal per-term anchor unchanged
  });

  it('has no focusable descendant inside any aria-hidden container', () => {
    render(<GlossaryTerm id="banza-signature" />);
    fireEvent.click(screen.getByRole('button'));
    for (const hidden of Array.from(document.querySelectorAll('[aria-hidden="true"]'))) {
      expect(hidden.querySelector(FOCUSABLE)).toBeNull();
    }
    // and the interactive link is NOT inside an aria-hidden ancestor
    const link = document.querySelector('.bz-pop-link') as HTMLElement;
    expect(link.closest('[aria-hidden="true"]')).toBeNull();
  });

  it('reveals on keyboard focus and moves focus to the link on Tab (keyboard reachable)', () => {
    render(<GlossaryTerm id="webhook" />);
    const btn = screen.getByRole('button');
    act(() => btn.focus());
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    fireEvent.keyDown(btn, { key: 'Tab' });
    const link = document.querySelector('.bz-pop-link');
    expect(document.activeElement).toBe(link);
  });

  it('Escape closes the popover and returns focus to the originating term', () => {
    render(<GlossaryTerm id="ledger" />);
    const btn = screen.getByRole('button');
    act(() => btn.focus());
    expect(document.querySelector('.bz-pop')).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(document.querySelector('.bz-pop')).toBeNull();
    expect(document.activeElement).toBe(btn);
  });

  it('reveals a popover on tap/click and hides on blur out of the widget', () => {
    const def = GLOSSARY_BY_ID['idempotencia'].def;
    render(<GlossaryTerm id="idempotencia">idempotency key</GlossaryTerm>);
    const btn = screen.getByRole('button', { name: /idempotency key/i });
    expect(screen.queryAllByText(def)).toHaveLength(0); // hidden; SR node holds "term: def"
    fireEvent.click(btn);
    expect(screen.getAllByText(def).length).toBeGreaterThanOrEqual(1);
    fireEvent.blur(btn, { relatedTarget: document.body });
    expect(screen.queryAllByText(def)).toHaveLength(0);
  });

  it('keeps the canonical definition when children override the visible text', () => {
    render(<GlossaryTerm id="idempotencia">idempotency key</GlossaryTerm>);
    const btn = screen.getByRole('button', { name: /idempotency key/i });
    const descId = btn.getAttribute('aria-describedby')!;
    expect(document.getElementById(descId)?.textContent).toContain('não cria uma segunda');
  });

  it('the visible definition is aria-hidden so it is not announced twice', () => {
    render(<GlossaryTerm id="qr" />);
    fireEvent.click(screen.getByRole('button'));
    const popDef = document.querySelector('.bz-pop-def');
    expect(popDef?.getAttribute('aria-hidden')).toBe('true');
  });

  it('falls back to plain text for an unknown id (never crashes, no button)', () => {
    render(<GlossaryTerm id="nope">termo simples</GlossaryTerm>);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('termo simples')).toBeTruthy();
  });
});
