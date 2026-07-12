'use client';

import { DocsShell } from '../shell';
import { PtTesting } from '../content-pt';

export default function PtTestingPage() {
  return (
    <DocsShell lang="pt" active="testing">
      {(copy) => <PtTesting copy={copy} />}
    </DocsShell>
  );
}
