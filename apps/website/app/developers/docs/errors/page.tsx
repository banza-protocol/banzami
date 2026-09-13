'use client';

import { DocsShell } from '../shell';
import { PtErrors } from '../content-pt';

export default function PtErrorsPage() {
  return (
    <DocsShell lang="pt" active="errors">
      {(copy) => <PtErrors copy={copy} />}
    </DocsShell>
  );
}
