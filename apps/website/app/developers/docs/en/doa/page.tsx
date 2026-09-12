'use client';

import { DocsShell } from '../../shell';
import { EnDoa } from '../../content-en';

export default function EnDoaPage() {
  return (
    <DocsShell lang="en" active="doa">
      {(copy) => <EnDoa copy={copy} />}
    </DocsShell>
  );
}
