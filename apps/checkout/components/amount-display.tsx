interface AmountDisplayProps {
  amountDisplay: string | null;
  description:   string | null;
}

/**
 * Large amount + description shown in the banzami header card.
 */
export default function AmountDisplay({ amountDisplay, description }: AmountDisplayProps) {
  return (
    <div className="text-center">
      {description && (
        <p className="text-xs font-medium uppercase tracking-widest text-white/70">
          {description}
        </p>
      )}
      {amountDisplay ? (
        <p className="mt-1 font-mono text-[2.5rem] font-bold leading-none tabular-nums text-white">
          {amountDisplay}
        </p>
      ) : (
        <p className="mt-1 text-lg font-semibold text-white/80">Valor livre</p>
      )}
    </div>
  );
}
