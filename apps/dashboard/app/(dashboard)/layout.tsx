'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSession, type Session } from '@/lib/session';
import { BanzamiApi } from '@/lib/api';
import { Sidebar } from '@/components/layout/sidebar';
import { Topbar } from '@/components/layout/topbar';
import { Spinner } from '@/components/ui/spinner';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router                      = useRouter();
  const [session, setSession]       = useState<Session | null>(null);
  const [merchantName, setMerchantName] = useState<string>('');
  const [ready, setReady]           = useState(false);

  useEffect(() => {
    const s = getSession();
    if (!s) {
      router.replace('/login');
      return;
    }
    setSession(s);
    setReady(true);

    const api = new BanzamiApi(s.gatewayUrl, s.apiKey);
    api.getMerchant(s.merchantId)
      .then(m => setMerchantName(m.name))
      .catch(() => { /* fall back to empty — topbar shows ID */ });
  }, [router]);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-off-white">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar merchantName={merchantName || session!.merchantId} />
        <main className="flex-1 overflow-auto p-xl">{children}</main>
      </div>
    </div>
  );
}
