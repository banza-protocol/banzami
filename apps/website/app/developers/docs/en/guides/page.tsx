'use client';

import { DocsShell } from '../../shell';
import { EnGuides } from '../../content-en';

export default function EnGuidesPage() {
  return (
    <DocsShell lang="en" active="guides">
      {(copy) => <EnGuides copy={copy} />}
    </DocsShell>
  );
}
