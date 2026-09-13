'use client';

import { DocsShell } from '../shell';
import { PtReceipts } from '../content-pt';

export default function PtReceiptsPage() {
  return (
    <DocsShell lang="pt" active="receipts">
      {(copy) => <PtReceipts copy={copy} />}
    </DocsShell>
  );
}
