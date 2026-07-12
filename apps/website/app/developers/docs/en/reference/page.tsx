'use client';

import { DocsShell } from '../../shell';
import { EnReference } from '../../content-en';

export default function EnReferencePage() {
  return (
    <DocsShell lang="en" active="reference">
      {(copy) => <EnReference copy={copy} />}
    </DocsShell>
  );
}
