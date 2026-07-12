'use client';

import { DocsShell } from '../../shell';
import { EnArtifacts } from '../../content-en';

export default function EnArtifactsPage() {
  return (
    <DocsShell lang="en" active="artifacts">
      {(copy) => <EnArtifacts copy={copy} />}
    </DocsShell>
  );
}
