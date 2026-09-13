'use client';

import { DocsShell } from '../../shell';
import { EnGoingLive } from '../../content-en';

export default function EnGoingLivePage() {
  return (
    <DocsShell lang="en" active="going-live">
      {(copy) => <EnGoingLive copy={copy} />}
    </DocsShell>
  );
}
