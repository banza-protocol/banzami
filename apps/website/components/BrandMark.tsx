// Banzami mark — four rounded squares, vector recreation of the brand icon.
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
