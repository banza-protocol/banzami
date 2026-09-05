'use client';

import { PortalPage } from '@/components/developers/portal/PortalShell';
import { ActivityLog } from '@/components/developers/portal/ActivityLog';

// Actividade do projeto — the events the operator actually recorded for this
// project, and what happened when it tried to deliver them.
//
// The invented rows this page used to show are gone rather than relabelled: see
// components/developers/portal/ActivityLog.tsx.

export default function LogsPage() {
  return (
    <PortalPage active="logs">
      <div className="bz-view">
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 900, letterSpacing: '-.02em' }}>Actividade</h1>
        <p style={{ margin: '6px 0 4px', fontSize: 14.5, color: '#8a7a7e', fontWeight: 600 }}>
          Os eventos emitidos por este projeto e cada tentativa de entrega, com o código que o seu servidor respondeu.
        </p>
        <p style={{ margin: '0 0 20px', fontSize: 13, color: '#a89a9e', fontWeight: 600 }}>
          Um registo por pedido HTTP à API ainda não é guardado pelo operador, por isso não é mostrado aqui. Cada resposta
          de erro traz um <code style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>request_id</code> —
          é esse identificador que deve citar no suporte.
        </p>
        <ActivityLog />
      </div>
    </PortalPage>
  );
}
