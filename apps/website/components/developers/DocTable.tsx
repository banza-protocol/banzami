import type { ReactNode } from 'react';
import { Reveal } from '@/components/Reveal';

// Responsive documentation table for the Developers page.
//
// Desktop: a real <table> inside a horizontal-scroll wrapper (so wide tables
// never break the layout). Mobile: the same rows render as stacked label/value
// cards, so nothing is squeezed or clipped on a phone.
//
// `mono` marks columns whose cell text should render in JetBrains Mono (e.g.
// endpoint paths). `cells` are ReactNode so callers can pass styled fragments.

export type DocTableColumn = { key: string; header: string; mono?: boolean };
export type DocTableRow = Record<string, ReactNode>;

export function DocTable({
  columns,
  rows,
  className = '',
}: {
  columns: DocTableColumn[];
  rows: DocTableRow[];
  className?: string;
}) {
  return (
    <Reveal
      className={`rounded-card border border-border-soft bg-white shadow-[0_16px_40px_-32px_rgba(181,16,31,.3)] ${className}`}
    >
      {/* Desktop / tablet — horizontally scrollable real table */}
      <div className="hidden overflow-x-auto sm:block [-ms-overflow-style:none] [scrollbar-width:thin]">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-border-soft bg-cream-50">
              {columns.map((c) => (
                <th
                  key={c.key}
                  className="bz-mono px-[18px] py-[13px] text-[10.5px] font-bold uppercase tracking-[0.05em] text-ink-muted"
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri} className={ri > 0 ? 'border-t border-border-soft' : ''}>
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={`px-[18px] py-[14px] align-top text-[13px] font-semibold leading-[1.5] ${
                      c.mono ? 'bz-mono text-[12.5px] text-cherry' : 'text-ink-soft'
                    }`}
                  >
                    {row[c.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile — stacked label/value cards */}
      <div className="flex flex-col sm:hidden">
        {rows.map((row, ri) => (
          <div
            key={ri}
            className={`flex flex-col gap-[9px] px-[18px] py-[16px] ${
              ri > 0 ? 'border-t border-border-soft' : ''
            }`}
          >
            {columns.map((c) => (
              <div key={c.key} className="flex flex-col gap-[2px]">
                <span className="bz-mono text-[9.5px] font-bold uppercase tracking-[0.05em] text-ink-muted">
                  {c.header}
                </span>
                <span
                  className={`text-[13px] font-semibold leading-[1.5] ${
                    c.mono ? 'bz-mono text-[12.5px] text-cherry' : 'text-ink-soft'
                  }`}
                >
                  {row[c.key]}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </Reveal>
  );
}
