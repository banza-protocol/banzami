'use client';

import { badgeText, attentionPhrase, type AttentionKey } from '@/lib/attention';
import { useAttentionCategory } from '@/components/layout/attention-provider';

/**
 * "Requer atenção" filter chip. Selects the page's view of exactly what its
 * sidebar badge counts; shows the same count. Pages give it their own chip
 * styling through `activeClass` / `idleClass`.
 */
export function AttentionChip({
  attentionKey,
  active,
  onToggle,
  activeClass = 'border-[#1a1416] bg-[#1a1416] text-white',
  idleClass = 'border-[#f1e3e3] bg-white text-[#5a4a4e]',
  className = 'rounded-[30px] border-[1.5px] px-4 py-2 text-[13px] font-extrabold transition',
}: {
  attentionKey: AttentionKey;
  active: boolean;
  onToggle: (next: boolean) => void;
  activeClass?: string;
  idleClass?: string;
  className?: string;
}) {
  const { count } = useAttentionCategory(attentionKey);
  const text = badgeText(count);
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={() => onToggle(!active)}
      title={text ? attentionPhrase(Math.floor(count as number)) : undefined}
      className={`inline-flex items-center gap-2 ${className} ${active ? activeClass : idleClass}`}
    >
      Requer atenção
      {text && (
        <span aria-hidden="true" className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-banzami px-[5px] text-[10.5px] font-extrabold text-white tabular-nums">
          {text}
        </span>
      )}
      {text && <span className="sr-only">, {attentionPhrase(Math.floor(count as number))}</span>}
    </button>
  );
}

/**
 * "Requer atenção" | "Todos" for a list the page loads whole: the view keeps
 * the rows in the states the server counted (lib/attention filterByStates),
 * so it and the sidebar badge show the same set.
 */
export function AttentionFilterBar({
  attentionKey,
  active,
  onChange,
}: {
  attentionKey: AttentionKey;
  active: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Filtro">
      <AttentionChip attentionKey={attentionKey} active={active} onToggle={() => onChange(true)} />
      <button
        type="button"
        aria-pressed={!active}
        onClick={() => onChange(false)}
        className={`rounded-[30px] border-[1.5px] px-4 py-2 text-[13px] font-extrabold transition ${
          !active ? 'border-[#1a1416] bg-[#1a1416] text-white' : 'border-[#f1e3e3] bg-white text-[#5a4a4e]'
        }`}
      >
        Todos
      </button>
    </div>
  );
}
