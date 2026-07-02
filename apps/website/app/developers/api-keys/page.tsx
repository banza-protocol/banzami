'use client';

import { PortalPage } from '@/components/developers/portal/PortalShell';
import { ApiKeysManager } from '@/components/developers/portal/ApiKeysManager';

// Sandbox API keys journey (ADR-033). Real data via developer-api; reveal-once,
// rotate, revoke. No Live tab / production path (Slice 1 is Sandbox-only).
export default function ApiKeysPage() {
  return (
    <PortalPage active="apikeys">
      <div className="bz-view">
        <ApiKeysManager />
      </div>
    </PortalPage>
  );
}
