'use client';

import { DocsShell } from '../../shell';
import { EnConcepts } from '../../content-en';

export default function EnConceptsPage() {
  return (
    <DocsShell lang="en" active="concepts">
      {(copy) => <EnConcepts copy={copy} />}
    </DocsShell>
  );
}
