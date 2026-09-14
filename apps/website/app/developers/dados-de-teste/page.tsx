'use client';

import { PortalPage } from '@/components/developers/portal/PortalShell';
import { TestData } from '@/components/developers/portal/TestData';

// Dados de teste — the Project's Sandbox test payers, scenarios and reset
// (ADR-060). Content in TestData, inside PortalPage's data provider.

export default function TestDataPage() {
  return (
    <PortalPage active="dados">
      <TestData />
    </PortalPage>
  );
}
