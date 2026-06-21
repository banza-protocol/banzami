import type { ReactNode } from 'react';
import { Reveal } from './Reveal';

export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="bz-eyebrow">{children}</p>;
}

export function SectionHeading({
  eyebrow,
  title,
  lead,
  center = false,
  className = '',
}: {
  eyebrow: string;
  title: ReactNode;
  lead?: ReactNode;
  center?: boolean;
  className?: string;
}) {
  return (
    <Reveal className={`${center ? 'mx-auto text-center' : ''} ${className}`}>
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="m-0 text-[clamp(28px,4vw,46px)] font-black leading-[1.06] tracking-[-0.02em]">
        {title}
      </h2>
      {lead && (
        <p className="m-0 mt-4 text-[17px] font-semibold leading-[1.55] text-ink-secondary">
          {lead}
        </p>
      )}
    </Reveal>
  );
}

// Simple soft card (pink background) for feature grids.
export function SoftCard({
  title,
  children,
  delay = 0,
  bordered = false,
}: {
  title: ReactNode;
  children: ReactNode;
  delay?: number;
  bordered?: boolean;
}) {
  return (
    <Reveal
      delay={delay}
      className={`rounded-card p-[26px] ${bordered ? 'border-2 border-pink-200 bg-white' : 'bg-pink-50'}`}
    >
      <h3 className="m-0 mb-2 text-[18px] font-black">{title}</h3>
      <div className="m-0 text-[14.5px] font-semibold leading-[1.5] text-ink-muted">{children}</div>
    </Reveal>
  );
}

export function Mono({ children }: { children: ReactNode }) {
  return <span className="bz-mono text-banzami">{children}</span>;
}
