'use client';

import { DocsShell } from '../../shell';
import { EnSdk } from '../../content-en';

export default function EnSdkPage() {
  return (
    <DocsShell lang="en" active="sdk">
      {(copy) => <EnSdk copy={copy} />}
    </DocsShell>
  );
}
