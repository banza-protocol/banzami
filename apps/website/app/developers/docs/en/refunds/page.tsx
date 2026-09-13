'use client';

import { DocsShell } from '../../shell';
import { EnRefunds } from '../../content-en';

export default function EnRefundsPage() {
  return (
    <DocsShell lang="en" active="refunds">
      {(copy) => <EnRefunds copy={copy} />}
    </DocsShell>
  );
}
