'use client';

import { PortalPage } from '@/components/developers/portal/PortalShell';
import { AppBanzamiWeb } from '@/components/developers/portal/AppBanzamiWeb';

// App Banzami — the Consumer testing surface as a first-class Console tool
// (DEV-CONSOLE-APP-WEB-001). Launches/explains app.banzami.com; no Consumer
// state ever renders inside the Developer account.

export default function AppBanzamiPage() {
  return (
    <PortalPage active="appbanzami">
      <AppBanzamiWeb />
    </PortalPage>
  );
}
