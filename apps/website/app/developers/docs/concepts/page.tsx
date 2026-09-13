'use client';

import { DocsShell } from '../shell';
import { PtConcepts } from '../content-pt';

export default function PtConceptsPage() {
  return (
    <DocsShell lang="pt" active="concepts">
      {(copy) => <PtConcepts copy={copy} />}
    </DocsShell>
  );
}
