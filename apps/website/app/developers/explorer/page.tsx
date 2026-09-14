'use client';

import { PortalPage } from '@/components/developers/portal/PortalShell';
import { ApiExplorer } from '@/components/developers/portal/ApiExplorer';

// API Explorer — the v1 API against the Sandbox, run server-side with a
// 60-second key per request (ADR-060 §7). No key reaches the browser.

export default function ExplorerPage() {
  return (
    <PortalPage active="explorer">
      <ApiExplorer />
    </PortalPage>
  );
}
