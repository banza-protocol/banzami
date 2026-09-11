# @banzami/checkout

Show a Banzami payment link on any website: a modal with the link's QR, an
"Abrir app Banzami" button and the hosted payment page — or a redirect straight
to pay.banzami.com.

**This package holds no credential and never calls the Banzami API.** A secret
key in a web page is a secret key handed to every visitor, so the link is
created where the key lives — on your server — and the browser only shows it.

> Not published to npm. Build it from this repository (`npm run build` →
> `dist/checkout.mjs`, `dist/checkout.cjs`, `dist/checkout.iife.js`) and serve
> the bundle yourself.

## How it fits together

1. **Your server** creates the payment link with the server SDK and its secret
   key (see `@banzami/sdk`), and gives the page the link's slug — or its
   `https://pay.banzami.com/pay/<slug>` URL.
2. **The page** opens it with this package.
3. **Your server** learns the link was paid from the `payment_link.paid`
   webhook (or the server SDK's status call). The modal can ask your server
   through `checkPaid`.

## Modal

```ts
import { BanzamiCheckout } from '@banzami/checkout';

const checkout = new BanzamiCheckout();

document.getElementById('pay-btn')!.addEventListener('click', async () => {
  // Your own endpoint, which creates the link server-side.
  const { slug } = await fetch('/checkout/link', { method: 'POST' }).then((r) => r.json());

  checkout.open({
    link:        slug,             // or 'https://pay.banzami.com/pay/<slug>'
    amountMinor: 5_000_000,        // display only: 50 000 Kz
    currency:    'AOA',
    description: 'Pedido #123',
    // Ask YOUR server whether it was paid; polled every 3 s while open.
    checkPaid:   () => fetch(`/checkout/link/${slug}/paid`).then((r) => r.json()).then((j) => j.paid),
    onSuccess:   () => console.log('Pago'),
    onCancel:    () => console.log('Fechado'),
    onError:     (err) => console.error(err),
  });
});
```

## Redirect

```ts
checkout.redirect(slug); // → https://pay.banzami.com/pay/<slug>
```

## Script tag

The IIFE bundle defines one global, `BanzamiCheckout`:

```html
<script src="/assets/checkout.iife.js"></script>
<script>
  BanzamiCheckout.openCheckout({ link: '<slug from your server>', currency: 'AOA' });
  // or: BanzamiCheckout.redirectToPayment('<slug from your server>');
</script>
```

## API

### `new BanzamiCheckout(config?)`

| Field    | Type      | Description                                                    |
|----------|-----------|----------------------------------------------------------------|
| `payUrl` | `string?` | Hosted payer page origin. Defaults to `https://pay.banzami.com` |

A configuration carrying a key (`apiKey`, `secretKey`, …) is refused with a
`BanzamiCheckoutError` before anything renders.

### `checkout.open(opts)`

| Field          | Type                      | Description                                                |
|----------------|---------------------------|------------------------------------------------------------|
| `link`         | `string`                  | Slug, or pay.banzami.com URL, of a link your server created |
| `amountMinor`  | `number?`                 | Shown in the modal (integer minor units); omit for open amount |
| `currency`     | `string?`                 | Defaults to `"AOA"`                                        |
| `description`  | `string?`                 | Shown in the modal header                                  |
| `checkPaid`    | `() => Promise<boolean>`? | Your server's answer to "has it been paid?"                |
| `onSuccess`    | `() => void`              | After `checkPaid` answers true                             |
| `onError`      | `(err) => void`           | The value was not a Banzami payment link                   |
| `onCancel`     | `() => void`              | The payer closed the modal                                 |

### `checkout.redirect(link)` · `checkout.close()`

Send the payer to the hosted page; close the modal.

### Helpers

`paymentLinkSlug(link)`, `payPageUrl(link)`, `formatAmount(minor, currency)`.
