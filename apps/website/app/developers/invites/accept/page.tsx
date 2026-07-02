'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PortalPage } from '@/components/developers/portal/PortalShell';
import { Card } from '@/components/developers/portal/ui';
import { useDeveloperAuth } from '@/components/developers/portal/DeveloperAuth';
import { developerApi, ApiError } from '@/lib/developer-api';

// Accept-invite screen. The invite token arrives in the link URL (the invite
// delivery mechanism); it is read once and never stored. The user must be
// signed in — the portal guard sends them to sign-in otherwise.
function AcceptInner() {
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const { csrf, status } = useDeveloperAuth();
  const router = useRouter();
  const [state, setState] = useState<'working' | 'ok' | 'error'>('working');
  const [message, setMessage] = useState('');
  const ran = useRef(false);

  useEffect(() => {
    if (status !== 'authed' || !token || ran.current) return;
    ran.current = true;
    (async () => {
      try {
        await developerApi.acceptInvite(token, csrf);
        setState('ok');
        setTimeout(() => router.push('/settings'), 1200);
      } catch (e) {
        const code = e instanceof ApiError ? e.code : 'UNAVAILABLE';
        setMessage(
          code === 'INVITE_INVALID'
            ? 'O convite expirou, foi revogado ou já foi usado.'
            : code === 'FORBIDDEN'
              ? 'Este convite foi enviado para outro email.'
              : 'Não foi possível aceitar o convite. Tente novamente.',
        );
        setState('error');
      }
    })();
  }, [status, token, csrf, router]);

  return (
    <Card style={{ maxWidth: 460, margin: '40px auto', padding: 28, textAlign: 'center' }}>
      <h1 style={{ margin: '0 0 10px', fontSize: 22, fontWeight: 900 }}>Convite</h1>
      {!token ? (
        <p style={{ margin: 0, fontSize: 14, color: '#C4303C', fontWeight: 700 }}>Link de convite inválido.</p>
      ) : state === 'working' ? (
        <p style={{ margin: 0, fontSize: 14, color: '#8a7a7e', fontWeight: 700 }}>A aceitar o convite…</p>
      ) : state === 'ok' ? (
        <p style={{ margin: 0, fontSize: 14, color: '#1F8A5B', fontWeight: 800 }}>Convite aceite. A redirecionar…</p>
      ) : (
        <p style={{ margin: 0, fontSize: 14, color: '#C4303C', fontWeight: 700 }}>{message}</p>
      )}
    </Card>
  );
}

export default function AcceptInvitePage() {
  return (
    <PortalPage active="settings" showBanner={false}>
      <Suspense fallback={null}>
        <AcceptInner />
      </Suspense>
    </PortalPage>
  );
}
