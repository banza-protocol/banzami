import type { ReactNode } from 'react';
import { Reveal } from '@/components/Reveal';

// Compact theory/definition card for the Developers page.
// A small glyph tile + title, then a "Definição" block and a "Porque importa"
// block — keeps dense conceptual content scannable instead of a wall of text.
export function TheoryCard({
  title,
  definition,
  matters,
  glyph,
  delay = 0,
}: {
  title: ReactNode;
  definition: ReactNode;
  matters: ReactNode;
  glyph?: ReactNode;
  delay?: number;
}) {
  return (
    <Reveal
      delay={delay}
      className="flex flex-col rounded-card border border-border-soft bg-white p-[24px] shadow-[0_16px_40px_-30px_rgba(181,16,31,.3)]"
    >
      <div className="mb-3 flex items-center gap-[11px]">
        {glyph && (
          <span className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[11px] bg-cream-50">
            {glyph}
          </span>
        )}
        <h3 className="m-0 text-[17px] font-black text-ink">{title}</h3>
      </div>
      <div className="mb-[14px]">
        <span className="bz-mono text-[10.5px] font-bold uppercase tracking-[0.06em] text-cherry">
          Definição
        </span>
        <p className="m-0 mt-[5px] text-[13.5px] font-semibold leading-[1.55] text-ink-soft">
          {definition}
        </p>
      </div>
      <div className="mt-auto rounded-[14px] bg-cream-50 px-[15px] py-[12px]">
        <span className="bz-mono text-[10.5px] font-bold uppercase tracking-[0.06em] text-cherry-dark">
          Porque importa
        </span>
        <p className="m-0 mt-[5px] text-[13px] font-semibold leading-[1.55] text-ink-secondary">
          {matters}
        </p>
      </div>
    </Reveal>
  );
}
