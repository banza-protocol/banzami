'use client';

import { DocsShell } from '../shell';
import { PtTroubleshooting } from '../content-pt';

export default function PtTroubleshootingPage() {
  return (
    <DocsShell lang="pt" active="troubleshooting">
      {(copy) => <PtTroubleshooting copy={copy} />}
    </DocsShell>
  );
}
