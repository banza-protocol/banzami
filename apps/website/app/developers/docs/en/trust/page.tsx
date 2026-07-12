'use client';

import { DocsShell } from '../../shell';
import { EnTrust } from '../../content-en';

export default function EnTrustPage() {
  return (
    <DocsShell lang="en" active="trust">
      {(copy) => <EnTrust copy={copy} />}
    </DocsShell>
  );
}
