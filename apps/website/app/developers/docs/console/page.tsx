'use client';

import { DocsShell } from '../shell';
import { PtConsole } from '../content-pt';

export default function PtConsolePage() {
  return (
    <DocsShell lang="pt" active="console">
      {(copy) => <PtConsole copy={copy} />}
    </DocsShell>
  );
}
