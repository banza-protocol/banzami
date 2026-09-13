'use client';

import { DocsShell } from '../shell';
import { PtEvents } from '../content-pt';

export default function PtEventsPage() {
  return (
    <DocsShell lang="pt" active="events">
      {(copy) => <PtEvents copy={copy} />}
    </DocsShell>
  );
}
