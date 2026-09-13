'use client';

import { DocsShell } from '../shell';
import { PtRefunds } from '../content-pt';

export default function PtRefundsPage() {
  return (
    <DocsShell lang="pt" active="refunds">
      {(copy) => <PtRefunds copy={copy} />}
    </DocsShell>
  );
}
