'use client';

import { DocsShell } from '../shell';
import { PtDoa } from '../content-pt';

export default function PtDoaPage() {
  return (
    <DocsShell lang="pt" active="doa">
      {(copy) => <PtDoa copy={copy} />}
    </DocsShell>
  );
}
