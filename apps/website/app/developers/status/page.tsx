import { PortalPage } from '@/components/developers/portal/PortalShell';
import { StubContent } from '@/components/developers/portal/Stub';

export default function StatusPage() {
  return (
    <PortalPage active="status">
      <StubContent label="Status" />
    </PortalPage>
  );
}
