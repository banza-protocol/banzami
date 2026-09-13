'use client';

import { DocsShell } from '../../shell';
import { EnTransfers } from '../../content-en';

export default function EnTransfersPage() {
  return (
    <DocsShell lang="en" active="transfers">
      {(copy) => <EnTransfers copy={copy} />}
    </DocsShell>
  );
}
