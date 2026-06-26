'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSession } from '@/lib/session';
import { Sidebar } from '@/components/layout/sidebar';
import { Topbar } from '@/components/layout/topbar';
import { ToastProvider } from '@/components/ui/toast';
import { BanzamiLogo } from '@/components/ui/brand';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!getSession()) {
      router.replace('/login');
      return;
    }
    setReady(true);
  }, [router]);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#FFF7F6]">
        <span className="adm-spin flex h-12 w-12 items-center justify-center rounded-[16px] bg-[#B5101F]">
          <BanzamiLogo size={24} />
        </span>
      </div>
    );
  }

  return (
    <ToastProvider>
      <div className="flex min-h-screen bg-[#FFF7F6]">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar />
          <main className="flex-1 px-8 pb-16 pt-7 max-[680px]:px-4">{children}</main>
        </div>
      </div>
    </ToastProvider>
  );
}
