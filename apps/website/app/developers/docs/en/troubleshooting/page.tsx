'use client';

import { DocsShell } from '../../shell';
import { EnTroubleshooting } from '../../content-en';

export default function EnTroubleshootingPage() {
  return (
    <DocsShell lang="en" active="troubleshooting">
      {(copy) => <EnTroubleshooting copy={copy} />}
    </DocsShell>
  );
}
