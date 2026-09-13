'use client';

import { DocsShell } from './shell';
import { DocsHome } from './HomePage';

export default function DocsHomePt() {
  return (
    <DocsShell lang="pt" active="">
      {() => <DocsHome lang="pt" />}
    </DocsShell>
  );
}
