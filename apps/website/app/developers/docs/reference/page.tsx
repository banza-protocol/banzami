'use client';

import { DocsShell } from '../shell';
import { PtReference } from '../content-pt';

export default function PtReferencePage() {
  return (
    <DocsShell lang="pt" active="reference">
      {(copy) => <PtReference copy={copy} />}
    </DocsShell>
  );
}
