import Link from 'next/link';
import { BrandMark } from '@/components/Brand';
import { SandboxBadge } from '@/components/SandboxBadge';

export function AuthHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <Link href="/" className="no-underline"><BrandMark size={34} /></Link>
        <SandboxBadge />
      </div>
      <h1 className="mt-10 text-[26px] font-black tracking-[-0.02em] text-ink">{title}</h1>
      <p className="mt-1.5 text-[15px] font-medium text-ink-soft">{subtitle}</p>
    </div>
  );
}
