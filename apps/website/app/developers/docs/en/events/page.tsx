'use client';

import { DocsShell } from '../../shell';
import { EnEvents } from '../../content-en';

export default function EnEventsPage() {
  return (
    <DocsShell lang="en" active="events">
      {(copy) => <EnEvents copy={copy} />}
    </DocsShell>
  );
}
