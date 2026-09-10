'use client';

import { PortalPage } from '@/components/developers/portal/PortalShell';
import { Card } from '@/components/developers/portal/ui';
import { useDeveloperData } from '@/components/developers/portal/DeveloperData';
import { useFinancialSetup } from '@/components/developers/portal/FinancialSetup';
import { FinancialOnboardingPanel } from '@/components/developers/portal/FinancialOnboarding';

// Configuração financeira — how this Project gets a Business to receive into.
//
// One Business identity, several onboarding surfaces, one KYB authority. The
// Project either applies for a new Business (the same application the public
// form sends, reviewed by an operator in BANZADMIN) or connects a Business that
// already exists, with the consent code that Business issues from its own app.
// Both happen here; nothing sends the developer to another site.
//
// A Project is usable without this — keys, webhooks and integration work — and
// only receiving money depends on it.

function FinancialSetupBody() {
  const { activeProject, csrf } = useDeveloperData();
  const fin = useFinancialSetup(activeProject?.id);

  if (!activeProject) {
    return <p style={{ margin: 0, fontSize: 14, color: '#a89a9e', fontWeight: 700 }}>Nenhum projeto selecionado.</p>;
  }
  if (fin.state.k === 'loading') {
    return <p style={{ margin: 0, fontSize: 14, color: '#a89a9e', fontWeight: 700 }}>A carregar a configuração financeira…</p>;
  }
  if (fin.state.k === 'error') {
    return (
      <Card style={{ padding: 22 }}>
        <p role="alert" style={{ margin: 0, fontSize: 14, color: '#B5101F', fontWeight: 700 }}>{fin.state.message}</p>
        <button
          type="button"
          onClick={() => void fin.reload()}
          style={{ marginTop: 14, padding: '9px 15px', border: '1.5px solid #EBDBD9', borderRadius: 10, background: '#fff', fontSize: 13, fontWeight: 800, color: '#B5101F', cursor: 'pointer' }}
        >
          Tentar novamente
        </button>
      </Card>
    );
  }
  return (
    <FinancialOnboardingPanel
      setup={fin.state.setup}
      projectId={activeProject.id}
      csrf={csrf}
      onChanged={() => void fin.reload()}
    />
  );
}

export default function FinanceiroPage() {
  return (
    <PortalPage active="financeiro">
      <div className="bz-view" style={{ maxWidth: 980 }}>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 900, letterSpacing: '-.02em' }}>Configuração financeira</h1>
        <p style={{ margin: '6px 0 22px', fontSize: 14.5, color: '#8a7a7e', fontWeight: 600 }}>
          O negócio em que este projeto recebe pagamentos, e a verificação que o Banzami faz dele.
        </p>
        <FinancialSetupBody />
      </div>
    </PortalPage>
  );
}
