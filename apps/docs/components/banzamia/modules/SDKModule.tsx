'use client'

import { useState } from 'react'

const SDK_EXAMPLES: Record<string, Record<string, string>> = {
  typescript: {
    'QR Payment': `import { BanzaClient } from '@banza/sdk'

const client = new BanzaClient({
  baseUrl: process.env.BANZA_API_URL,
  apiKey:  process.env.BANZA_API_KEY,
})

// Create QR payment
const qr = await client.qr.create({
  merchant_wallet: 'wal_abc123',
  amount_minor:    5000,        // 50.00 XOF
  currency:        'XOF',
  idempotency_key: \`qr-\${Date.now()}\`,
})

// Wait for payment (webhook or poll)
const paid = await client.qr.get(qr.id)
if (paid.status === 'paid') {
  const transfer = await client.transfers.get(paid.transfer_id!)
  // INV-STL-001: net + fee == gross
  console.assert(
    transfer.net_minor + transfer.fee_minor === transfer.gross_minor
  )
}`,
    'P2P Transfer': `import { BanzaClient } from '@banza/sdk'

const client = new BanzaClient({ baseUrl, apiKey })

const transfer = await client.transfers.create({
  from_wallet:     'wal_sender',
  to_wallet:       'wal_receiver',
  gross_minor:     10000,        // 100.00 XOF
  currency:        'XOF',
  idempotency_key: \`transfer-\${crypto.randomUUID()}\`,
})

if (transfer.status === 'failed') {
  throw new Error(\`Transfer failed: \${transfer.failure_reason}\`)
}`,
    'Wallet Balance': `const wallet = await client.wallets.get('wal_abc123')
console.log(wallet.balance_minor)  // Always >= 0 (INV-LEDGER-002)

const ledger = await client.wallets.ledger('wal_abc123', {
  limit: 20,
})
// All entries are immutable once confirmed (INV-LEDGER-003)`,
  },
  python: {
    'QR Payment': `from banza import BanzaClient

client = BanzaClient(
    base_url=os.environ["BANZA_API_URL"],
    api_key=os.environ["BANZA_API_KEY"],
)

qr = client.qr.create(
    merchant_wallet="wal_abc123",
    amount_minor=5000,
    currency="XOF",
)
print(qr.id, qr.trace_id)`,
    'P2P Transfer': `transfer = client.transfers.create(
    from_wallet="wal_sender",
    to_wallet="wal_receiver",
    gross_minor=10000,
    currency="XOF",
    idempotency_key=f"transfer-{uuid4()}",
)
assert transfer.net_minor + transfer.fee_minor == transfer.gross_minor`,
  },
  dart: {
    'QR Payment': `import 'package:banza_sdk/banza_sdk.dart';

final client = BanzaClient(
  baseUrl: Env.banzaApiUrl,
  apiKey: Env.banzaApiKey,
);

final qr = await client.qr.create(
  merchantWallet: 'wal_abc123',
  amountMinor: 5000,
  currency: 'XOF',
);

// Listen to payment event
client.events.qrPaid(qr.id).listen((event) {
  print('Paid! trace_id: \${event.traceId}');
});`,
  },
}

const LANGUAGES = ['typescript', 'python', 'dart'] as const
type Language = typeof LANGUAGES[number]

const FEATURES: Record<Language, string[]> = {
  typescript: ['QR Payment', 'P2P Transfer', 'Wallet Balance'],
  python:     ['QR Payment', 'P2P Transfer'],
  dart:       ['QR Payment'],
}

export function SDKModule() {
  const [lang, setLang] = useState<Language>('typescript')
  const [feature, setFeature] = useState('QR Payment')
  const [copied, setCopied] = useState(false)

  const code = SDK_EXAMPLES[lang]?.[feature] ?? '// Example not available for this combination'

  const copy = async () => {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-2xl mx-auto space-y-5">
        <div>
          <h2 className="text-lg font-bold text-bia-text mb-1">SDK Assistant</h2>
          <p className="text-sm text-bia-muted">Generate Banzami SDK integration examples. All code follows SDK-first policy — no raw HTTP.</p>
        </div>

        {/* Language selector */}
        <div className="flex gap-2">
          {LANGUAGES.map(l => (
            <button
              key={l}
              onClick={() => { setLang(l); setFeature(FEATURES[l][0]) }}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                lang === l ? 'bg-bia-primary text-white' : 'border border-bia-border bg-bia-surface text-bia-muted hover:bg-bia-surface-2 hover:text-bia-text'
              }`}
            >
              {l.charAt(0).toUpperCase() + l.slice(1)}
            </button>
          ))}
        </div>

        {/* Feature selector */}
        <div className="flex flex-wrap gap-2">
          {FEATURES[lang].map(f => (
            <button
              key={f}
              onClick={() => setFeature(f)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                feature === f ? 'bg-bia-gold/10 border border-bia-gold/30 text-bia-gold' : 'border border-bia-border text-bia-muted hover:bg-bia-surface-2'
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        {/* Code block */}
        <div className="relative rounded-xl border border-bia-border bg-bia-bg overflow-hidden">
          <div className="flex items-center justify-between border-b border-bia-border px-4 py-2.5 bg-bia-surface">
            <span className="font-mono text-[11px] text-bia-muted">{lang} — {feature}</span>
            <button
              onClick={copy}
              className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] text-bia-muted hover:bg-bia-surface-2 hover:text-bia-text transition-colors"
            >
              {copied ? '✓ Copied' : 'Copy'}
            </button>
          </div>
          <pre className="overflow-x-auto p-4 text-[12px] leading-relaxed text-bia-text font-mono">
            <code>{code}</code>
          </pre>
        </div>

        {/* Safety note */}
        <div className="rounded-xl border border-bia-primary/20 bg-bia-primary/5 px-4 py-3">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-bia-primary mb-1">SDK-first policy</div>
          <p className="text-xs text-bia-muted">
            All Banzami integrations must use official SDKs. Direct <code className="text-bia-gold">fetch()</code> or <code className="text-bia-gold">http.Get()</code> calls to the API are not recommended. The SDK enforces financial invariants at the response validation layer.
          </p>
        </div>
      </div>
    </div>
  )
}
