import { PortalPage } from '@/components/developers/portal/PortalShell';
import { StubContent } from '@/components/developers/portal/Stub';

export default function ClientesPage() {
  return (
    <PortalPage active="clientes">
      <StubContent label="Clientes" />
    </PortalPage>
  );
}
