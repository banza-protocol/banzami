'use client';

import { DocsShell } from '../../shell';
import { EnPayments } from '../../content-en';

export default function EnPaymentsPage() {
  return (
    <DocsShell lang="en" active="payments">
      {(copy) => <EnPayments copy={copy} />}
    </DocsShell>
  );
}
