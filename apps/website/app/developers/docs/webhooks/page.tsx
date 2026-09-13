'use client';

import { DocsShell } from '../shell';
import { PtWebhooks } from '../content-pt';

export default function PtWebhooksPage() {
  return (
    <DocsShell lang="pt" active="webhooks">
      {(copy) => <PtWebhooks copy={copy} />}
    </DocsShell>
  );
}
