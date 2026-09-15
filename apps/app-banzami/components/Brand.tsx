// The Banzami wordmark — a small cherry "B" tile + name, matching the native
// splash/brand. Decorative; callers give context.
export function BrandMark({ size = 40 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <span
        aria-hidden="true"
        className="inline-flex items-center justify-center rounded-[12px] font-black text-white"
        style={{
          width: size,
          height: size,
          fontSize: size * 0.55,
          background: 'linear-gradient(145deg,#E8434B,#B5101F 55%,#9A1B22)',
          boxShadow: '0 8px 20px -8px rgba(181,16,31,.55)',
        }}
      >
        B
      </span>
      <span className="text-[19px] font-black tracking-[-0.02em] text-ink">Banzami</span>
    </span>
  );
}
