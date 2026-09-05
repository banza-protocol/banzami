'use client';

import { PortalPage } from '@/components/developers/portal/PortalShell';
import { Overview } from '@/components/developers/portal/Overview';

// Visão geral. The content lives in Overview because it reads the active project
// through useDeveloperData, and that provider is supplied by PortalPage — a hook
// called here, outside the wrapper, has no provider above it and fails the
// static export rather than the page load, which is a confusing way to find out.

export default function DashboardPage() {
  return (
    <PortalPage active="dashboard">
      <Overview />
    </PortalPage>
  );
}
