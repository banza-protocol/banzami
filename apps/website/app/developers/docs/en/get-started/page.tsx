'use client';

import { DocsShell } from '../../shell';
import { EnGetStarted } from '../../content-en';

export default function EnGetStartedPage() {
  return (
    <DocsShell lang="en" active="get-started">
      {(copy) => <EnGetStarted copy={copy} />}
    </DocsShell>
  );
}
