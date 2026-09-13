'use client';

import { DocsShell } from '../../shell';
import { EnErrors } from '../../content-en';

export default function EnErrorsPage() {
  return (
    <DocsShell lang="en" active="errors">
      {(copy) => <EnErrors copy={copy} />}
    </DocsShell>
  );
}
