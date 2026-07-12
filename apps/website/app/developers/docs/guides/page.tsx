'use client';

import { DocsShell } from '../shell';
import { PtGuides } from '../content-pt';

export default function PtGuidesPage() {
  return (
    <DocsShell lang="pt" active="guides">
      {(copy) => <PtGuides copy={copy} />}
    </DocsShell>
  );
}
