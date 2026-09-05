'use client';

import { useState } from 'react';
import { PortalPage } from '@/components/developers/portal/PortalShell';
import { ActivityLog } from '@/components/developers/portal/ActivityLog';
import { RequestLog } from '@/components/developers/portal/RequestLog';

// Registos — two real records, neither invented.
//
// "Pedidos à API" is the project's own Developer API traffic: what the key
// called, what came back, how long it took, and the request_id to quote. Until
// the operator recorded that (migration 0104) this page could only say the log
// did not exist; showing webhook activity under the name "Logs" would have been
// calling one true thing by another thing's name.
//
// "Eventos e entregas" is the webhook side, unchanged: what the operator emitted
// and what the receiver answered.

type Tab = 'requests' | 'events';

export default function LogsPage() {
  const [tab, setTab] = useState<Tab>('requests');

  const tabStyle = (active: boolean) => ({
    padding: '9px 16px',
    border: 'none',
    borderRadius: 10,
    cursor: 'pointer',
    fontSize: 13.5,
    fontWeight: 800,
    background: active ? '#FBD2D0' : 'transparent',
    color: active ? '#B5101F' : '#8a7a7e',
  });

  return (
    <PortalPage active="logs">
      <div className="bz-view">
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 900, letterSpacing: '-.02em' }}>Registos</h1>
        <p style={{ margin: '6px 0 18px', fontSize: 14.5, color: '#8a7a7e', fontWeight: 600 }}>
          {tab === 'requests'
            ? 'Cada pedido feito à API com uma chave deste projeto — método, caminho, estado, latência e request_id.'
            : 'Os eventos emitidos por este projeto e cada tentativa de entrega, com o código que o seu servidor respondeu.'}
        </p>

        <div
          style={{
            display: 'inline-flex', gap: 4, marginBottom: 20,
            background: '#fff', border: '1.5px solid #EBDBD9', borderRadius: 12, padding: 3,
          }}
        >
          <button onClick={() => setTab('requests')} style={tabStyle(tab === 'requests')}>Pedidos à API</button>
          <button onClick={() => setTab('events')} style={tabStyle(tab === 'events')}>Eventos e entregas</button>
        </div>

        {tab === 'requests' ? <RequestLog /> : <ActivityLog />}
      </div>
    </PortalPage>
  );
}
