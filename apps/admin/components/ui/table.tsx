import type { ReactNode } from 'react';

// Shared table/card primitives matching the Banzami Admin reference exactly:
// card border #f1e3e3 radius 18px; header row bg #FFF7F6; uppercase 11.5px/800
// labels; row top border #f6eded; row hover #FFF7F6 (.adm-row).

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`overflow-hidden rounded-[18px] border border-[#f1e3e3] bg-white ${className}`}>
      {children}
    </div>
  );
}

export function CardHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-[#f6eded] px-[22px] py-[18px]">
      <h3 className="m-0 text-[16px] font-black text-[#2a2024]">{title}</h3>
      {action}
    </div>
  );
}

export function TableWrap({ children }: { children: ReactNode }) {
  return (
    <Card>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">{children}</table>
      </div>
    </Card>
  );
}

export function Th({ children, right }: { children?: ReactNode; right?: boolean }) {
  return (
    <th
      className={`px-4 py-[13px] text-[11.5px] font-extrabold uppercase tracking-[0.04em] text-[#9a8a8e] first:pl-[22px] last:pr-[22px] ${
        right ? 'text-right' : 'text-left'
      }`}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  right,
  mono,
  className = '',
}: {
  children?: ReactNode;
  right?: boolean;
  mono?: boolean;
  className?: string;
}) {
  return (
    <td
      className={`border-t border-[#f6eded] px-4 py-[14px] text-[13.5px] first:pl-[22px] last:pr-[22px] ${
        right ? 'text-right' : 'text-left'
      } ${mono ? 'font-mono' : ''} ${className}`}
    >
      {children}
    </td>
  );
}

export function Avatar({ text, dark }: { text: string; dark?: boolean }) {
  return (
    <span
      className={`flex h-9 w-9 flex-none items-center justify-center rounded-[10px] text-[13px] font-extrabold ${
        dark ? 'rounded-full bg-[#1a1416] text-white' : 'bg-[#FFF1F0] text-[#B5101F]'
      }`}
    >
      {text}
    </span>
  );
}

// Inline error / empty / loading states styled to the brand.
export function ErrorState({ message }: { message: string }) {
  return (
    <div className="px-6 py-[60px] text-center">
      <div className="text-[15px] font-extrabold text-[#B5101F]">{message}</div>
    </div>
  );
}

export function EmptyMsg({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="px-6 py-[60px] text-center">
      <div className="text-[16px] font-extrabold text-[#5a4a4e]">{title}</div>
      {hint && <div className="mt-1.5 text-[13.5px] font-semibold text-[#9a8a8e]">{hint}</div>}
    </div>
  );
}
