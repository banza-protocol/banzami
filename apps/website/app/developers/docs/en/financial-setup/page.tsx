'use client';

import { DocsShell } from '../../shell';
import { EnFinancialSetup } from '../../content-en';

export default function EnFinancialSetupPage() {
  return (
    <DocsShell lang="en" active="financial-setup">
      {(copy) => <EnFinancialSetup copy={copy} />}
    </DocsShell>
  );
}
