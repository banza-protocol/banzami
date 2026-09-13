'use client';

import { DocsShell } from '../shell';
import { PtSettlements } from '../content-pt';

export default function PtSettlementsPage() {
  return (
    <DocsShell lang="pt" active="settlements">
      {(copy) => <PtSettlements copy={copy} />}
    </DocsShell>
  );
}
