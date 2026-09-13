'use client';

import { DocsShell } from '../../shell';
import { EnReceipts } from '../../content-en';

export default function EnReceiptsPage() {
  return (
    <DocsShell lang="en" active="receipts">
      {(copy) => <EnReceipts copy={copy} />}
    </DocsShell>
  );
}
