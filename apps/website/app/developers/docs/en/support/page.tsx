'use client';

import { DocsShell } from '../../shell';
import { EnSupport } from '../../content-en';

export default function EnSupportPage() {
  return (
    <DocsShell lang="en" active="support">
      {(copy) => <EnSupport copy={copy} />}
    </DocsShell>
  );
}
