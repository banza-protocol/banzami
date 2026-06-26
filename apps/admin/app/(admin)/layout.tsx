'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSession, saveSession, destroySession, type AdminUser } from '@/lib/session';
import { AdminApi } from '@/lib/admin-api';
import { Sidebar } from '@/components/layout/sidebar';
import { Topbar } from '@/components/layout/topbar';
import { ToastProvider } from '@/components/ui/toast';
import { DialogProvider } from '@/components/ui/dialog';
import { BanzamiLogo } from '@/components/ui/brand';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<AdminUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const session = getSession();
    if (!session) {
      router.replace('/login');
      return;
    }
    // Validate the token against /auth/me; refresh the operator profile.
    new AdminApi(session.token)
      .me()
      .then((r) => {
        saveSession({ token: session.token, user: r.user });
        setUser(r.user);
        setReady(true);
      })
      .catch(() => {
        destroySession();
        router.replace('/login');
      });
  }, [router]);

  if (!ready || !user) {
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
      <DialogProvider>
        <div className="flex min-h-screen bg-[#FFF7F6]">
          <Sidebar />
          <div className="flex min-w-0 flex-1 flex-col">
            <Topbar user={user} />
            <main className="flex-1 px-8 pb-16 pt-7 max-[680px]:px-4">{children}</main>
          </div>
        </div>
      </DialogProvider>
    </ToastProvider>
  );
}
