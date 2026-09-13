'use client';

import { DocsShell } from '../shell';
import { PtPayments } from '../content-pt';

export default function PtPaymentsPage() {
  return (
    <DocsShell lang="pt" active="payments">
      {(copy) => <PtPayments copy={copy} />}
    </DocsShell>
  );
}
