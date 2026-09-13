'use client';

import { DocsShell } from '../../shell';
import { EnSettlements } from '../../content-en';

export default function EnSettlementsPage() {
  return (
    <DocsShell lang="en" active="settlements">
      {(copy) => <EnSettlements copy={copy} />}
    </DocsShell>
  );
}
