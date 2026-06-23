'use client';

import { useEffect, useRef, useState } from 'react';

// Sticky horizontal "Nesta página" anchor bar for the Developers page.
//
// Why horizontal (not a vertical side-rail): the page content is a centered
// max-w-container (1140px). At 1280–1440 there is not enough side margin for a
// readable vertical side-rail without narrowing all content, which is forbidden.
// A sticky horizontal bar is the robust, non-invasive choice and works on every
// breakpoint (desktop + mobile, horizontally scrollable when narrow).

const SECTIONS: { id: string; label: string }[] = [
  { id: 'docs', label: 'Quickstart' },
  { id: 'foundation', label: 'Fundamentos' },
  { id: 'angola-context', label: 'Contexto' },
  { id: 'embedded-payments', label: 'Embutidos' },
  { id: 'architecture', label: 'Arquitetura' },
  { id: 'api', label: 'API' },
  { id: 'payment-states', label: 'Estados' },
  { id: 'sdks', label: 'SDKs' },
  { id: 'sandbox', label: 'Sandbox' },
  { id: 'webhooks', label: 'Webhooks' },
  { id: 'use-cases', label: 'Casos de uso' },
  { id: 'reconciliation', label: 'Reconciliação' },
  { id: 'security', label: 'Segurança' },
  { id: 'errors', label: 'Erros' },
  { id: 'going-live', label: 'Going Live' },
];

const SCROLL_OFFSET = 140;

export function DevToc() {
  const [active, setActive] = useState<string>(SECTIONS[0].id);
  const [shown, setShown] = useState(false);
  const navRef = useRef<HTMLElement>(null);

  // Fixed (not sticky): the page <main> uses overflow-x-hidden, which turns it
  // into a scroll container and breaks position:sticky. The floating navbar uses
  // position:fixed for the same reason. Reveal the bar once past the hero.
  useEffect(() => {
    const onScroll = () => setShown(window.scrollY > 480);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Scroll-spy via IntersectionObserver.
  useEffect(() => {
    if (typeof window === 'undefined' || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) setActive(e.target.id);
        });
      },
      { rootMargin: '-150px 0px -65% 0px', threshold: 0 },
    );
    SECTIONS.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) io.observe(el);
    });
    return () => io.disconnect();
  }, []);

  // Keep the active chip in view inside the horizontal scroller.
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const el = nav.querySelector<HTMLAnchorElement>(`a[data-id="${active}"]`);
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }, [active]);

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    e.preventDefault();
    const el = document.getElementById(id);
    if (!el) return;
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const top = el.getBoundingClientRect().top + window.scrollY - SCROLL_OFFSET;
    window.scrollTo({ top, behavior: reduced ? 'auto' : 'smooth' });
    setActive(id);
  };

  return (
    <div
      className={`fixed inset-x-0 top-[84px] z-40 border-b border-border-soft transition-[opacity,transform] duration-300 ${
        shown ? 'translate-y-0 opacity-100' : 'pointer-events-none -translate-y-2 opacity-0'
      }`}
      style={{ background: 'rgba(255,247,246,.92)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)' }}
      aria-hidden={!shown}
    >
      <nav
        ref={navRef}
        aria-label="Nesta página"
        className="mx-auto flex max-w-container items-center gap-1 overflow-x-auto px-4 py-[10px] [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <span className="bz-mono mr-1 flex-none select-none text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted">
          Nesta página
        </span>
        {SECTIONS.map((s) => {
          const isActive = active === s.id;
          return (
            <a
              key={s.id}
              href={`#${s.id}`}
              data-id={s.id}
              aria-current={isActive ? 'true' : undefined}
              onClick={(e) => handleClick(e, s.id)}
              className={`flex-none rounded-pill px-[13px] py-[6px] text-[13px] font-bold no-underline transition-colors ${
                isActive
                  ? 'bg-cream-100 text-cherry'
                  : 'text-ink-soft hover:bg-pink-100 hover:text-cherry-dark'
              }`}
            >
              {s.label}
            </a>
          );
        })}
      </nav>
    </div>
  );
}
