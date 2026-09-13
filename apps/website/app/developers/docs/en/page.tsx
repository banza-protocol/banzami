'use client';

import { DocsShell } from '../shell';
import { DocsHome } from '../HomePage';

export default function DocsHomeEn() {
  return (
    <DocsShell lang="en" active="">
      {() => <DocsHome lang="en" />}
    </DocsShell>
  );
}
