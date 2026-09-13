/**
 * Type-level contract for createPaymentLink and listPaymentLinks.
 *
 * 0.13.0 made `merchantId` and `walletId` required on createPaymentLink, and
 * `merchantId` on listPaymentLinks. A project key has neither, and the API
 * refuses a request that names a payee with 400 PAYEE_NOT_ALLOWED — so a
 * TypeScript integrator with a project key could not create or list a link
 * without a cast. The runtime never needed them (an undefined field is omitted
 * from the body and the query), which is why only `tsc --noEmit` over this file
 * can catch the defect coming back.
 */
import type { BanzamiClient } from './client.js';

declare const client: BanzamiClient;

// ── Project key: no payee, no merchant ───────────────────────────────────────
void client.createPaymentLink({ amountMinor: 25_000, description: 'Pedido #123' });
void client.createPaymentLink({});
void client.listPaymentLinks({ limit: 20 });
void client.listPaymentLinks();

// ── Merchant credential: still accepted as before ────────────────────────────
void client.createPaymentLink({ merchantId: 'm-1', walletId: 'w-1', amountMinor: 25_000 });
void client.listPaymentLinks({ merchantId: 'm-1', cursor: 'c' });
