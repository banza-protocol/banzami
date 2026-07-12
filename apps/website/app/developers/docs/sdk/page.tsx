'use client';

import { DocsShell } from '../shell';
import { PtSdk } from '../content-pt';

export default function PtSdkPage() {
  return (
    <DocsShell lang="pt" active="sdk">
      {(copy) => <PtSdk copy={copy} />}
    </DocsShell>
  );
}
