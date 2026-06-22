// Banzami logo mark — four rounded tiles. SVG copied verbatim from the dossier
// (README §Logótipo). Do NOT alter. There is NO "S" (no sandbox).
export function BrandMark({ size = 17 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" aria-hidden="true">
      <rect x="6" y="6" width="42" height="42" rx="13" fill="#fff" />
      <rect x="56" y="10" width="32" height="32" rx="10" fill="#FBD2D0" />
      <rect x="10" y="56" width="38" height="38" rx="11" fill="#FBD2D0" />
      <rect x="58" y="60" width="28" height="28" rx="9" fill="#fff" />
    </svg>
  );
}

// Logo lockup (mark tile + wordmark) used in the header and footers.
export function Logo({ size = 30, markSize = 17 }: { size?: number; markSize?: number }) {
  return (
    <span className="flex items-center gap-[10px] text-[20px] font-black tracking-[-0.02em] text-ink">
      <span
        className="inline-flex items-center justify-center rounded-tile bg-cherry shadow-[0_6px_14px_-4px_rgba(181,16,31,.5)]"
        style={{ width: size, height: size }}
      >
        <BrandMark size={markSize} />
      </span>
      Banzami
    </span>
  );
}
