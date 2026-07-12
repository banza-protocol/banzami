'use client';

import { DocsShell } from '../../shell';
import { EnGlossary } from '../../content-en';

export default function EnGlossaryPage() {
  return (
    <DocsShell lang="en" active="glossary">
      {(copy) => <EnGlossary copy={copy} />}
    </DocsShell>
  );
}
