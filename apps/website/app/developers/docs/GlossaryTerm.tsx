'use client';

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { GLOSSARY_BY_ID } from './glossary';

// Reusable contextual-definition affordance for the Developer docs.
//
// Interaction: a subtle dotted-underline term reveals a concise definition on
// hover (pointer), focus (keyboard) and tap (touch); dismiss with Escape, an
// outside tap, or by moving focus/pointer away. The popover is rendered in a
// body portal with position:fixed, so it is NEVER clipped by cards, code blocks
// or overflow containers, and it is clamped to the viewport.
//
// Accessibility (accessible-popover model):
//   • the trigger is a <button> with aria-expanded + aria-controls referencing
//     the popover, and a persistent aria-describedby giving immediate context;
//   • when open the popover IS in the accessibility tree (role=group, labelled);
//   • the "Ver no glossário" link is a real, keyboard-reachable link — Tab from
//     the open term moves focus to it; Shift+Tab / Tab / Escape return focus to
//     the term and there is no focus trap;
//   • the visual term/definition text is aria-hidden (decorative, no focusable
//     descendants), so the definition is announced once via aria-describedby and
//     never duplicated.
// Motion respects prefers-reduced-motion (globals.css). No layout shift: the
// trigger is inline text; the popover is fixed/portaled.

const POP_MAX_W = 280;
const GAP = 8;
const MARGIN = 12;

function prefersReduced(): boolean {
  return (
    typeof window !== 'undefined' &&
    !!window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export function GlossaryTerm({
  id,
  children,
  code,
}: {
  id: string;
  children?: ReactNode;
  code?: boolean;
}) {
  const entry = GLOSSARY_BY_ID[id];
  const rid = useId().replace(/:/g, '');
  const descId = `gdef-${rid}`;
  const popId = `gpop-${rid}`;
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const linkRef = useRef<HTMLAnchorElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // True right after Escape / Tab-out, so returning focus to the trigger does
  // not immediately reopen the popover.
  const dismissedRef = useRef(false);
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => setMounted(true), []);

  const clearTimer = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };
  const openNow = useCallback(() => {
    clearTimer();
    dismissedRef.current = false;
    setOpen(true);
  }, []);
  const closeNow = useCallback(() => {
    clearTimer();
    setOpen(false);
    setPos(null);
  }, []);
  const scheduleClose = useCallback(() => {
    clearTimer();
    closeTimer.current = setTimeout(() => {
      setOpen(false);
      setPos(null);
    }, 140);
  }, []);
  const onFocus = useCallback(() => {
    if (dismissedRef.current) {
      dismissedRef.current = false;
      return;
    }
    openNow();
  }, [openNow]);

  const compute = useCallback(() => {
    const b = btnRef.current?.getBoundingClientRect();
    if (!b) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = Math.min(POP_MAX_W, vw - MARGIN * 2);
    const left = Math.max(MARGIN, Math.min(b.left, vw - w - MARGIN));
    const popH = popRef.current?.offsetHeight ?? 96;
    const below = b.bottom + GAP;
    const placeAbove = below + popH > vh - MARGIN && b.top - GAP - popH > MARGIN;
    const top = placeAbove ? Math.max(MARGIN, b.top - GAP - popH) : below;
    setPos({ top, left });
  }, []);

  // While open: position, reposition on scroll/resize, dismiss on outside tap.
  useEffect(() => {
    if (!open) return;
    compute();
    let raf = 0;
    const onMove = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(compute);
    };
    const onPointer = (e: PointerEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || popRef.current?.contains(t)) return;
      dismissedRef.current = false;
      closeNow();
    };
    // Escape closes and returns focus to the term (covers hover-opened popovers
    // where focus is not yet inside the widget).
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        dismissedRef.current = true;
        closeNow();
        btnRef.current?.focus();
      }
    };
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, compute, closeNow]);

  useEffect(() => () => clearTimer(), []);

  // Unknown id: never crash — render the text plainly.
  if (!entry) return <>{children ?? id}</>;

  const isCode = code ?? entry.code ?? false;

  const dismissToTerm = () => {
    dismissedRef.current = true;
    closeNow();
    btnRef.current?.focus();
  };
  // Keep the popover open while focus moves between the trigger and the link.
  const onWidgetBlur = (e: React.FocusEvent) => {
    const next = e.relatedTarget as Node | null;
    if (next && (btnRef.current === next || popRef.current?.contains(next))) return;
    dismissedRef.current = false;
    closeNow();
  };
  // Tab from the open term moves focus to the (portaled) link, so it is
  // keyboard-reachable despite the portal. Escape is handled at document level.
  const onTermKeyDown = (e: React.KeyboardEvent) => {
    if (open && e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault();
      linkRef.current?.focus();
    }
  };
  const onLinkKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Tab' && e.shiftKey) {
      e.preventDefault();
      btnRef.current?.focus(); // back to the term, stay open
    } else if (e.key === 'Tab') {
      e.preventDefault();
      dismissToTerm(); // leave the widget cleanly (no trap)
    }
  };
  const goGlossary = (e: React.MouseEvent) => {
    e.preventDefault();
    dismissedRef.current = false;
    closeNow();
    const el = document.getElementById(`glossario-${entry.id}`);
    if (el) {
      el.scrollIntoView({ behavior: prefersReduced() ? 'auto' : 'smooth', block: 'start' });
      history.pushState(null, '', `#glossario-${entry.id}`);
    }
  };

  return (
    <span className="bz-termwrap">
      <button
        ref={btnRef}
        type="button"
        className={isCode ? 'bz-term bz-term-code' : 'bz-term'}
        aria-describedby={descId}
        aria-expanded={open}
        aria-controls={open ? popId : undefined}
        onMouseEnter={openNow}
        onMouseLeave={scheduleClose}
        onFocus={onFocus}
        onBlur={onWidgetBlur}
        onKeyDown={onTermKeyDown}
        onClick={(e) => {
          e.preventDefault();
          open ? closeNow() : openNow();
        }}
      >
        {children ?? entry.term}
      </button>
      <span id={descId} className="bz-sr">
        {entry.term}: {entry.def}
      </span>
      {mounted && open
        ? createPortal(
            <div
              ref={popRef}
              id={popId}
              className="bz-pop"
              role="group"
              aria-label={entry.term}
              style={{
                position: 'fixed',
                top: pos ? pos.top : -9999,
                left: pos ? pos.left : 0,
                width: Math.min(POP_MAX_W, (typeof window !== 'undefined' ? window.innerWidth : 320) - MARGIN * 2),
              }}
              onMouseEnter={openNow}
              onMouseLeave={scheduleClose}
            >
              <span className="bz-pop-term" aria-hidden="true">{entry.term}</span>
              <span className="bz-pop-def" aria-hidden="true">{entry.def}</span>
              <a
                ref={linkRef}
                className="bz-pop-link"
                href={`#glossario-${entry.id}`}
                onClick={goGlossary}
                onKeyDown={onLinkKeyDown}
                onBlur={onWidgetBlur}
              >
                Ver nos conceitos →
              </a>
            </div>,
            document.body,
          )
        : null}
    </span>
  );
}
