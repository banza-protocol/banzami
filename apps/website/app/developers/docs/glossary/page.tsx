'use client';

import { DocsShell } from '../shell';
import { PtGlossary } from '../content-pt';

export default function PtGlossaryPage() {
  return (
    <DocsShell lang="pt" active="glossary">
      {(copy) => <PtGlossary copy={copy} />}
    </DocsShell>
  );
}
