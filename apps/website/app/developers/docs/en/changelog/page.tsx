'use client';

import { DocsShell } from '../../shell';
import { EnChangelog } from '../../content-en';

export default function EnChangelogPage() {
  return (
    <DocsShell lang="en" active="changelog">
      {(copy) => <EnChangelog copy={copy} />}
    </DocsShell>
  );
}
