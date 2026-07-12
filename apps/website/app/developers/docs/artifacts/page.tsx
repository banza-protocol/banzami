'use client';

import { DocsShell } from '../shell';
import { PtArtifacts } from '../content-pt';

export default function PtArtifactsPage() {
  return (
    <DocsShell lang="pt" active="artifacts">
      {(copy) => <PtArtifacts copy={copy} />}
    </DocsShell>
  );
}
