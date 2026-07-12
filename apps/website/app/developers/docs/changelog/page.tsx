'use client';

import { DocsShell } from '../shell';
import { PtChangelog } from '../content-pt';

export default function PtChangelogPage() {
  return (
    <DocsShell lang="pt" active="changelog">
      {(copy) => <PtChangelog copy={copy} />}
    </DocsShell>
  );
}
