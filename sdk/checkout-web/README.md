# @banzami/checkout

Embeddable payment checkout for any website. Opens a QR + deep-link modal that lets customers pay via the Banza mobile app.

## Quick start (NPM)

```bash
npm install @banzami/checkout
```

```ts
import { BanzamiCheckout } from '@banzami/checkout';

const checkout = new BanzamiCheckout({
  gatewayUrl: 'https://api.banzami.org',
  apiKey:     'bz_live_...',
  merchantId: 'your-merchant-id',
  walletId:   'your-wallet-id',
});

document.getElementById('pay-btn').addEventListener('click', () => {
  checkout.open({
    amountMinor: 50000,     // 50 000 Kz
    currency:    'AOA',
    description: 'Pedido #123',
    onSuccess: (link) => console.log('Paid! Link ID:', link.id),
    onCancel:  () => console.log('Cancelled'),
    onError:   (err) => console.error(err),
  });
});
```

## Script tag (CDN)

```html
<script src="https://cdn.banzami.org/checkout/0.1.0/checkout.iife.js"></script>
<script>
  const checkout = new BanzamiCheckout({
    gatewayUrl: 'https://api.banzami.org',
    apiKey:     'bz_live_...',
    merchantId: '...',
    walletId:   '...',
  });

  checkout.open({ amountMinor: 50000, currency: 'AOA' });
</script>
```

## Open-amount links

Omit `amountMinor` to create a link where the customer sets the amount in the app:

```ts
checkout.open({ currency: 'AOA', description: 'Donativo' });
```

## API

### `new BanzamiCheckout(config)`

| Field        | Type     | Description                        |
|--------------|----------|------------------------------------|
| `gatewayUrl` | `string` | Banza API base URL               |
| `apiKey`     | `string` | Merchant API key (`bz_live_...`)   |
| `merchantId` | `string` | Merchant UUID                      |
| `walletId`   | `string` | Destination wallet UUID            |

### `checkout.open(opts)`

| Field          | Type                    | Description                             |
|----------------|-------------------------|-----------------------------------------|
| `amountMinor`  | `number?`               | Amount in minor units (AOA = kwanzas)   |
| `currency`     | `string`                | `"AOA"` or `"USD"`                      |
| `description`  | `string?`               | Shown in the modal header               |
| `expiresAt`    | `Date?`                 | Defaults to 30 minutes from now         |
| `onSuccess`    | `(link) => void`        | Called after payment confirmed          |
| `onError`      | `(err) => void`         | Called if link creation fails           |
| `onCancel`     | `() => void`            | Called when user closes the modal       |

Returns `Promise<PaymentLink>` — resolves once the modal is open.

### `checkout.close()`

Programmatically close the modal (e.g. after a timeout on your side).
