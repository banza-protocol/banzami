# Doa × Banzami — Frontend Integration

Complete reference for the Doa payment UI, including component architecture, QR panel implementation, loading states, and UX flows.

---

## Component Hierarchy

The Banzami UI lives inside Doa's multi-step donation flow:

```
DonateFlow
└── Step 4: Payment method selection
    ├── MethodPicker          ← list of available methods (Stripe, Bank Transfer, Banzami)
    └── BanzaPanel          ← mounted when method = 'banzami'
        ├── Sandbox badge     ← conditional, amber, top-right
        ├── Step instructions ← numbered list (open app → scan → confirm)
        ├── QR card           ← bordered container with generated QR image
        ├── External link     ← "Ou abre o link de pagamento" (mobile fallback)
        └── Status indicator  ← pulsing dot → success animation → redirect
```

All components are in `app/(public)/c/[slug]/doar/`.

---

## BanzaPanel Props

```typescript
interface BanzaPanelProps {
  payUrl:    string;   // e.g. "https://pay.banzami.org/abc123def"
  linkId:    string;   // e.g. "lnk_01jqx..." — used as &link_id param in status poll
  intentId:  string;   // donation_intent.id — used as &intent_id param in status poll
  returnUrl: string;   // redirect target after confirmed (e.g. "/c/{slug}/doar/obrigado?intent=...")
  isSandbox: boolean;  // true when BANZAMI_API_KEY starts with bz_test_
}
```

`payUrl` and `linkId` are both derived from the Banzami payment link — `payUrl = BANZAMI_PAY_BASE_URL + '/' + slug`, `linkId = link.id`. They differ: `slug` is used in URLs, `id` is used for API calls.

---

## Sandbox Badge

When `isSandbox = true`, an amber badge appears in the panel header:

```tsx
{isSandbox && (
  <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700 ring-1 ring-amber-300">
    SANDBOX
  </span>
)}
```

This badge is purely informational. It does not alter API behavior. The API key prefix is the actual environment gate.

The badge disappears in production when `BANZAMI_API_KEY=bz_live_...`.

---

## Sandbox Propagation Chain

The `isSandbox` prop traces back to the API key stored in the server environment:

```
process.env.BANZAMI_API_KEY (bz_test_...)
    → BanzaProvider.sandbox = true         (lib/payments/providers/banzami.ts)
    → PaymentProvider.sandbox?: boolean      (lib/payments/provider.ts)
    → listPublicMethods() → PaymentMethodMeta.sandbox  (lib/payments/registry.ts)
    → DonateFlow props.methods[].sandbox     (app/(public)/c/[slug]/doar/donate-flow.tsx)
    → banzamiSandbox state variable
    → BanzaPanel isSandbox={true}
    → "SANDBOX" badge rendered
```

The `sandbox` field is optional on `PaymentProvider` and `PaymentMethodMeta` — other providers (Stripe, bank transfer) omit it and the badge is never shown.

---

## QR Generation

The QR image is generated client-side using dynamic import:

```typescript
useEffect(() => {
  let alive = true;
  import('qrcode').then((QRCode) => {
    QRCode.toDataURL(payUrl, {
      width: 260,
      margin: 2,
      color: { dark: '#0f172a', light: '#ffffff' },
    }).then((url) => {
      if (alive) setQrSrc(url);
    });
  });
  return () => { alive = false; };
}, [payUrl]);
```

**Why client-side?**

The `qrcode` library is ~50 kB. Dynamic import defers this load until the donor actually reaches the Banzami stage — about 30–40% of donors who reach step 4 choose Banzami. Server-side generation would impose this cost for all donors at SSR time, or require a separate API call.

**Why a data URL?**

`QRCode.toDataURL()` returns a PNG encoded as a base64 data URL (~5–8 kB). This is set directly as `<img src={qrSrc} />`. No server round-trip, no separate image endpoint, no caching needed.

**Loading state**: `qrSrc` initialises as `null`. The panel renders a spinner (`animate-spin` border element) until `qrSrc` is set.

**Error state**: If `toDataURL()` throws (e.g. malformed URL), the spinner remains. The external link fallback is always present so the donor can still complete payment.

---

## QR Card Layout

```
┌──────────────────────────────────────────┐
│ Paga com o Banzami            [SANDBOX]  │  ← header row
│                                           │
│  1 ● Abre a app Banzami                  │
│  2 ● Toca em Pagar e usa o QR code       │  ← step instructions
│  3 ● Confirma o pagamento                │
│                                           │
│  ┌────────────────────────────────────┐  │
│  │                                    │  │
│  │   [QR code — 260 × 260 px]        │  │  ← bordered QR card
│  │                                    │  │
│  └────────────────────────────────────┘  │
│                                           │
│   Ou abre o link de pagamento →          │  ← mobile fallback link
│                                           │
│  ● A aguardar confirmação…               │  ← pulsing dot (waiting state)
└──────────────────────────────────────────┘
```

---

## Step Instructions

Numbered instructions guide the donor through the payment process:

```tsx
<ol className="space-y-1 text-sm text-slate-600">
  <li className="flex items-start gap-2">
    <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-500">1</span>
    <span>Abre a app Banzami</span>
  </li>
  <li className="flex items-start gap-2">
    <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-500">2</span>
    <span>Toca em <strong>Pagar</strong> e usa o QR code</span>
  </li>
  <li className="flex items-start gap-2">
    <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-500">3</span>
    <span>Confirma o pagamento</span>
  </li>
</ol>
```

These steps are rendered in Portuguese (pt-AO) — the primary language of Doa's Angolan donor base.

---

## Mobile Fallback Link

```tsx
<a
  href={payUrl}
  target="_blank"
  rel="noopener noreferrer"
  className="text-sm text-blue-600 underline underline-offset-2 hover:text-blue-800"
>
  Ou abre o link de pagamento
</a>
```

This link is critical for donors on mobile — a donor cannot scan a QR displayed on the same screen. Tapping this opens `pay.banzami.org/{slug}` either in the browser or, if the Banza app is installed and handles the URL scheme, directly in the app.

`rel="noopener noreferrer"` prevents the opened tab from accessing `window.opener` — a standard security practice for `target="_blank"` links.

---

## Status Indicator States

The panel cycles through three visual states:

### Waiting

```tsx
<div className="flex items-center gap-2 text-sm text-slate-500">
  <span className="relative flex h-2.5 w-2.5">
    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-slate-400 opacity-75" />
    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-slate-400" />
  </span>
  A aguardar confirmação — não feches esta página…
</div>
```

The `animate-ping` creates a pulsing halo effect that communicates "live" without explicit text.

### Confirmed

```tsx
{confirmed && (
  <div className="flex flex-col items-center gap-3 py-4">
    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-100 ring-4 ring-green-200">
      <svg className="h-7 w-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
    </div>
    <p className="text-base font-semibold text-slate-800">Pagamento confirmado!</p>
    <p className="text-sm text-slate-500">A redirecionar…</p>
  </div>
)}
```

The green check ring replaces the QR and status indicator when `confirmed = true`. The 1.2-second redirect delay lets the donor see the animation before being taken away.

---

## Polling Loop

```typescript
const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

useEffect(() => {
  pollRef.current = setInterval(async () => {
    try {
      const params = new URLSearchParams({ intent_id: intentId, link_id: linkId });
      const r = await fetch(`/api/donations/banzami-status?${params}`);
      if (!r.ok) return;
      const j = await r.json() as { confirmed: boolean };
      if (j.confirmed) {
        clearInterval(pollRef.current!);
        setConfirmed(true);
        setTimeout(() => { window.location.href = returnUrl; }, 1200);
      }
    } catch { /* transient network error — next tick retries */ }
  }, 3000);

  return () => {
    if (pollRef.current) clearInterval(pollRef.current);
  };
}, [intentId, linkId, returnUrl]);
```

**Cleanup**: The `useEffect` cleanup clears the interval on unmount — prevents state updates on an unmounted component and avoids network calls for donors who navigate away before confirming.

**Transient errors**: Network errors are silently caught. The next tick (3 s later) retries. The link remains valid on Banzami's side regardless of poll failures.

**Webhook acceleration**: If `BANZAMI_WEBHOOK_SECRET` is configured, Banzami pushes `payment_link.paid` before the next poll tick. The webhook handler records the confirmation server-side. When the poll fires, the status check returns `{ confirmed: true }` immediately. The browser proceeds identically — it cannot distinguish webhook-confirmed from poll-confirmed.

---

## DonateFlow State for Banzami

Relevant state in `donate-flow.tsx`:

```typescript
// Tracks if the active provider is in sandbox mode
const [banzamiSandbox, setBanzamiSandbox] = useState(false);

// Set when the donor clicks "Pay with Banza" and initiate-payment succeeds
// stage === 'banzami' triggers BanzaPanel mount
const [stage, setStage] = useState<'method' | 'banzami' | 'done'>('method');

// The inline result from initiate-payment (payUrl + linkId)
const [banzamiInline, setBanzamiInline] = useState<{
  token: string;        // payUrl
  provider_ref: string; // linkId
} | null>(null);
```

When `submitMethod('banzami')` is called:

1. `setBanzamiSandbox(methods.find(m => m.id === 'banzami')?.sandbox ?? false)`
2. `POST /api/donations/initiate-payment` → `{ result: { kind: 'inline', token, provider_ref } }`
3. `setBanzamiInline({ token, provider_ref })`
4. `setStage('banzami')`
5. `BanzaPanel` mounts with all required props

---

## Accessibility

- Step indicators use numbered `<span>` elements inside `<ol>` — semantic, screen-reader friendly.
- The pulsing dot uses `aria-live="polite"` wrapper or is paired with visible text — screen readers announce "A aguardar confirmação" without announcing the visual pulse.
- The success state contains a `<p>` with "Pagamento confirmado!" — announced immediately.
- The external link includes descriptive text ("Ou abre o link de pagamento") rather than an icon-only link.

---

## Branding Usage

The panel uses the text label "Banza" (or "Banza (Sandbox)") as the method name. Banzami's logo is not embedded in the panel — only the name.

The QR code uses dark navy (`#0f172a`) ink on white background — high contrast for scanning and visually neutral (doesn't conflict with any Banzami brand colors or Doa's Tailwind palette).

---

## No Client-Side Banzami Credentials

The `BanzaPanel` never sees any Banzami API key, JWT, or webhook secret. The pay URL (`https://pay.banzami.org/{slug}`) is public — it was created server-side and returned to the browser as the `token` field. The donor scanning or clicking this URL is the intended public interaction.

All API calls to `api.banzami.org` are made from Next.js API routes, where credentials live in server-only environment variables.
