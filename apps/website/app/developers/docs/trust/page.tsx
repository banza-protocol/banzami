'use client';

import { DocsShell } from '../shell';
import { PtTrust } from '../content-pt';

export default function PtTrustPage() {
  return (
    <DocsShell lang="pt" active="trust">
      {(copy) => <PtTrust copy={copy} />}
    </DocsShell>
  );
}
