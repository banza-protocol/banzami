'use client';

import { DocsShell } from '../../shell';
import { EnWebhooks } from '../../content-en';

export default function EnWebhooksPage() {
  return (
    <DocsShell lang="en" active="webhooks">
      {(copy) => <EnWebhooks copy={copy} />}
    </DocsShell>
  );
}
