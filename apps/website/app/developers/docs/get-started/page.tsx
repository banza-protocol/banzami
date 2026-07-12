'use client';

import { DocsShell } from '../shell';
import { PtGetStarted } from '../content-pt';

export default function PtGetStartedPage() {
  return (
    <DocsShell lang="pt" active="get-started">
      {(copy) => <PtGetStarted copy={copy} />}
    </DocsShell>
  );
}
