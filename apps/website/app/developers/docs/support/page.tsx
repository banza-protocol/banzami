'use client';

import { DocsShell } from '../shell';
import { PtSupport } from '../content-pt';

export default function PtSupportPage() {
  return (
    <DocsShell lang="pt" active="support">
      {(copy) => <PtSupport copy={copy} />}
    </DocsShell>
  );
}
