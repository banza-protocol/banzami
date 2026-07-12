'use client';

import { DocsShell } from '../../shell';
import { EnTesting } from '../../content-en';

export default function EnTestingPage() {
  return (
    <DocsShell lang="en" active="testing">
      {(copy) => <EnTesting copy={copy} />}
    </DocsShell>
  );
}
