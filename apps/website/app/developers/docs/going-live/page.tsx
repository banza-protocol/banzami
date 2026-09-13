'use client';

import { DocsShell } from '../shell';
import { PtGoingLive } from '../content-pt';

export default function PtGoingLivePage() {
  return (
    <DocsShell lang="pt" active="going-live">
      {(copy) => <PtGoingLive copy={copy} />}
    </DocsShell>
  );
}
