import { PortalPage } from '@/components/developers/portal/PortalShell';
import { StubContent } from '@/components/developers/portal/Stub';

export default function TransacoesPage() {
  return (
    <PortalPage active="transacoes">
      <StubContent label="Transações" />
    </PortalPage>
  );
}
