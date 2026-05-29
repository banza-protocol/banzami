# apps/checkout

Hosted checkout page at `pay.banzami.org`. Renders a payment link as a QR code and a deep-link button to open the Banza consumer app. Polls for payment confirmation and updates the UI when the link is paid.

---

## Stack

Next.js (App Router) · TypeScript · Tailwind CSS

---

## Routes

| Path | Description |
|------|-------------|
| `/[slug]` | Main checkout page — renders QR and payment button |
| `/api/pay/[slug]/status` | Server-side proxy for payment status polling |

---

## Architecture note — status polling

The checkout page polls for payment confirmation from the browser. Direct browser calls to `api.banzami.org` are cross-origin from `pay.banzami.org`; CORS for this origin is handled at the Go middleware level (not nginx), but polling from a browser `fetch` would still require the `Origin` header to match.

To avoid this entirely, the polling call goes to `/api/pay/[slug]/status` — a Next.js Route Handler (`app/api/pay/[slug]/status/route.ts`) that fetches `api.banzami.org` server-side (no CORS restriction) and proxies `{ paid: boolean }` back to the client. The client component never makes a cross-origin request.

---

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PAY_API_URL` | `https://api.banzami.org` | Internal API base URL used by the server-side proxy. Set to the internal Docker network address in production to avoid the public internet hop. |

`PAY_API_URL` must **not** be prefixed with `NEXT_PUBLIC_` — it is only read server-side.

---

## Running locally

```bash
cd apps/checkout
npm install
npm run dev   # starts on http://localhost:3003
```

---

## Building

```bash
npm run build
npm start
```

---

## Docker

The app is containerised as `banzami_checkout_frontend` and served behind nginx at `pay.banzami.org`.

```bash
# from repo root
docker compose build checkout
docker compose up -d checkout
```
