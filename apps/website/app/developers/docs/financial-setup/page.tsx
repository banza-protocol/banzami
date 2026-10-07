'use client';

import { DocsShell } from '../shell';
import { PtFinancialSetup } from '../content-pt';

export default function PtFinancialSetupPage() {
  return (
    <DocsShell lang="pt" active="financial-setup">
      {(copy) => <PtFinancialSetup copy={copy} />}
    </DocsShell>
  );
}
