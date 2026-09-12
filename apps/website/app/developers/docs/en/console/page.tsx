'use client';

import { DocsShell } from '../../shell';
import { EnConsole } from '../../content-en';

export default function EnConsolePage() {
  return (
    <DocsShell lang="en" active="console">
      {(copy) => <EnConsole copy={copy} />}
    </DocsShell>
  );
}
