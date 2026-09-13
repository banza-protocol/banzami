'use client';

import { DocsShell } from '../shell';
import { PtTransfers } from '../content-pt';

export default function PtTransfersPage() {
  return (
    <DocsShell lang="pt" active="transfers">
      {(copy) => <PtTransfers copy={copy} />}
    </DocsShell>
  );
}
