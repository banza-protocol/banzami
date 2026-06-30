// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

/** Selects the data universe for all API operations.
 *  'live' uses real money; 'sandbox' uses virtual, simulated funds.
 *  LIVE and SANDBOX data are completely isolated — they never mix. */
export type BanzamiEnvironment = 'live' | 'sandbox';

/**
 * BANZA ADR-039 fee references — operator-internal categorization. These are
 * **references only**: they let the operator price a payment internally. The SDK
 * never sends or receives a fee, a percentage, or a pricing rule. `string` is
 * permitted for forward-compatibility with categories not yet in this list
 * (an unknown value resolves to a zero fee).
 */
export type BusinessCategory =
  | 'DONATION'
  | 'CROWDFUNDING'
  | 'MARKETPLACE'
  | 'ECOMMERCE'
  | 'DELIVERY'
  | 'FOOD_DELIVERY'
  | 'RIDE_HAILING'
  | 'SUBSCRIPTION'
  | 'TICKETING'
  | 'DIGITAL_GOODS'
  | 'PHYSICAL_GOODS'
  | 'P2P'
  | 'BILL_PAYMENT'
  | 'NGO'
  | 'GOVERNMENT'
  | (string & {});

/** Commercial pricing tier (reference only; never a price). */
export type PricingProfile =
  | 'STANDARD'
  | 'BUSINESS'
  | 'ENTERPRISE'
  | 'PARTNER'
  | 'NGO'
  | 'GOVERNMENT'
  | 'CUSTOM'
  | (string & {});

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

export interface Page<T> {
  data:         T[];
  next_cursor?: string;
}

// ---------------------------------------------------------------------------
// Consumers
// ---------------------------------------------------------------------------

export type ConsumerStatus = 'ACTIVE' | 'SUSPENDED' | 'CLOSED';

export interface Consumer {
  id:            string;
  handle:        string;
  display_name?: string;
  status:        ConsumerStatus;
  created_at:    string;
  updated_at:    string;
}

// ---------------------------------------------------------------------------
// Consumer wallets
// ---------------------------------------------------------------------------

export type WalletStatus = 'ACTIVE' | 'SUSPENDED' | 'CLOSED';

export interface ConsumerWallet {
  id:          string;
  consumer_id: string;
  currency:    string;
  status:      WalletStatus;
  created_at:  string;
}

export interface WalletBalance {
  available_minor: number;
  reserved_minor:  number;
  currency:        string;
}

// ---------------------------------------------------------------------------
// Transfers (P2P)
// ---------------------------------------------------------------------------

export type TransferStatus = 'PENDING' | 'COMPLETED' | 'FAILED';
export type TransferDirection = 'SENT' | 'RECEIVED';

export interface TransferMoney {
  amount_minor: number;
  currency:     string;
}

export interface Transfer {
  id:           string;
  sender_id:    string;
  recipient_id: string;
  amount:       TransferMoney;
  description?: string;
  status:       TransferStatus;
  created_at:   string;
  updated_at:   string;
}

// ---------------------------------------------------------------------------
// Transactions (merchant-facing)
// ---------------------------------------------------------------------------

export type TransactionStatus = 'PENDING' | 'COMPLETED' | 'FAILED' | 'REFUNDED';

export interface Transaction {
  id:           string;
  merchant_id:  string;
  consumer_id?: string;
  amount_minor: number;
  currency:     string;
  status:       TransactionStatus;
  environment:  'LIVE' | 'SANDBOX';
  reference?:   string;
  description?: string;
  created_at:   string;
  updated_at:   string;
}

// ---------------------------------------------------------------------------
// Wallets (merchant-facing)
// ---------------------------------------------------------------------------

export interface Wallet {
  id:           string;
  merchant_id?: string;
  currency:     string;
  status:       WalletStatus;
  created_at:   string;
}

// ---------------------------------------------------------------------------
// Payouts
// ---------------------------------------------------------------------------

export type PayoutStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export interface Payout {
  id:           string;
  wallet_id:    string;
  amount_minor: number;
  currency:     string;
  status:       PayoutStatus;
  reference?:   string;
  created_at:   string;
  updated_at:   string;
}

// ---------------------------------------------------------------------------
// QR codes
// ---------------------------------------------------------------------------

export type QrCodeType   = 'STATIC' | 'DYNAMIC';
export type QrCodeStatus = 'ACTIVE' | 'USED' | 'EXPIRED';

export interface QrCode {
  id:               string;
  owner_id:         string;
  type:             QrCodeType;
  status:           QrCodeStatus;
  amount_minor?:    number;
  currency:         string;
  reference?:       string;
  expires_at?:      string;
  created_at:       string;
}

export interface QrResponse {
  qr_code: QrCode;
  payload: string;
}

export interface ParsedQr {
  owner_id?:    string;
  qr_code_id?:  string;
  type:         QrCodeType;
  currency?:    string;
  is_dynamic:   boolean;
}

// ---------------------------------------------------------------------------
// Merchants
// ---------------------------------------------------------------------------

export type MerchantStatus = 'ACTIVE' | 'SUSPENDED';

export interface Merchant {
  id:         string;
  name:       string;
  status:     MerchantStatus;
  created_at: string;
}

export interface ApiKey {
  id:            string;
  prefix:        string;
  label?:        string;
  environment:   'LIVE' | 'SANDBOX';
  created_at:    string;
  last_used_at?: string;
}

export interface NewApiKey extends ApiKey {
  key: string;
}

// ---------------------------------------------------------------------------
// Payment links
// ---------------------------------------------------------------------------

export type PaymentLinkStatus = 'ACTIVE' | 'USED' | 'CANCELLED' | 'EXPIRED';

export interface PaymentLink {
  id:           string;
  slug:         string;
  merchant_id:  string;
  wallet_id:    string;
  amount_minor?: number;
  currency:     string;
  description?: string;
  status:       PaymentLinkStatus;
  expires_at?:  string;
  paid_at?:     string;
  created_at:   string;
  updated_at:   string;
}

/**
 * The official, renderable QR payload for a payment link — derived by the
 * SDK so the payload format stays owned by Banzami. `qrValue` is the
 * canonical, scannable value: encode it into a QR image as-is. Consumers
 * must NOT construct this value themselves; always obtain it from the SDK.
 */
export interface PaymentQr {
  /** Official QR payload — encode this exact string into the QR image. */
  qrValue:          string;
  /** Canonical Banzami pay URL the QR resolves to (same as `qrValue`). */
  paymentUrl:       string;
  /** Payment link slug. */
  slug:             string;
  /** Payment link id. */
  paymentLinkId:    string;
  /** Amount in minor units, or null for open-amount links. */
  amountMinor:      number | null;
  /** ISO currency code (e.g. 'AOA'). */
  currency:         string;
  /** Link description, if any. */
  description:      string | null;
  /** Recipient display name, when known to the caller. */
  recipientName:    string | null;
  /** Recipient @banza handle, when known to the caller. */
  recipientHandle:  string | null;
  /** Environment the link belongs to. */
  environment:      BanzamiEnvironment;
  /** Convenience flag — true in sandbox. */
  isSandbox:        boolean;
  /** Current payment link status. */
  status:           PaymentLinkStatus;
}

// ---------------------------------------------------------------------------
// Refunds
// ---------------------------------------------------------------------------

export type RefundStatus = 'PENDING' | 'SUCCEEDED' | 'FAILED';

export interface Refund {
  id:             string;
  transaction_id: string;
  merchant_id:    string;
  amount_minor:   number;
  currency:       string;
  status:         RefundStatus;
  reason?:        string;
  created_at:     string;
  updated_at:     string;
}

export interface CreateRefundParams {
  transaction_id:   string;
  amount_minor:     number;
  reason?:          string;
  /** Idempotency key — auto-generated if omitted. */
  idempotency_key?: string;
}

// ---------------------------------------------------------------------------
// Disputes
// ---------------------------------------------------------------------------

export type DisputeStatus =
  | 'OPEN'
  | 'UNDER_REVIEW'
  | 'WON_BY_CONSUMER'
  | 'WON_BY_MERCHANT'
  | 'CLOSED';

export interface Dispute {
  id:                string;
  transaction_id:    string;
  merchant_id:       string;
  consumer_id:       string;
  amount_minor:      number;
  currency:          string;
  reason:            string;
  status:            DisputeStatus;
  evidence_deadline?: string;
  resolution_notes?:  string;
  resolved_at?:       string;
  created_at:        string;
  updated_at:        string;
}

export interface OpenDisputeParams {
  transaction_id:   string;
  consumer_id:      string;
  amount_minor:     number;
  currency:         string;
  reason:           string;
  evidence_deadline?: string;
}

export interface ListDisputesParams {
  status?: DisputeStatus;
  limit?:  number;
}

// ---------------------------------------------------------------------------
// Payment requests
// ---------------------------------------------------------------------------

export type PaymentRequestStatus =
  | 'PENDING'
  | 'PAID'
  | 'DECLINED'
  | 'CANCELLED'
  | 'EXPIRED';

export interface PaymentRequest {
  id:             string;
  requester_id:   string;
  payer_id?:      string;
  amount_minor:   number;
  currency:       string;
  description?:   string;
  status:         PaymentRequestStatus;
  expires_at?:    string;
  created_at:     string;
  updated_at:     string;
}

export interface CreatePaymentRequestParams {
  requester_id:     string;
  payer_handle?:    string;
  amount_minor:     number;
  currency:         string;
  description?:     string;
  expires_at?:      string;
  idempotency_key?: string;
}

export interface ListPaymentRequestsParams {
  status?: PaymentRequestStatus;
  limit?:  number;
}

// ---------------------------------------------------------------------------
// Webhooks
// ---------------------------------------------------------------------------

export type WebhookEndpointStatus = 'ACTIVE' | 'DISABLED';

export interface WebhookEndpoint {
  id:         string;
  url:        string;
  events:     string[];
  status:     WebhookEndpointStatus;
  created_at: string;
}

/**
 * Canonical event types dispatched by the Banzami api-gateway.
 * Use `string` for forward-compatibility with types not yet in this list.
 */
export type WebhookEventType =
  | 'payment_link.paid'
  | 'transaction.completed'
  | 'transaction.failed'
  | 'payout.created'
  | 'payout.completed'
  | 'payout.failed';

export interface WebhookEvent {
  id:         string;
  type:       WebhookEventType | string;
  /** Event-specific payload. Cast to a typed interface after checking `type`. */
  data:       unknown;
  created_at: string;
}

// Application Settlement (Banzami ADR-021) — an app settles accumulated net value
// from one of its wallets to a beneficiary, splitting off an application fee.
export type ApplicationSettlementStatus = 'CREATED' | 'PENDING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export interface ApplicationSettlement {
  id: string;
  owner_ref: string;
  status: ApplicationSettlementStatus;
  gross_amount_minor: number;
  application_fee_minor: number;
  net_amount_minor: number;
  currency: string;
  environment: string;
  created_at: string;
  completed_at: string | null;
  failure_reason: string | null;
}

export interface CreateApplicationSettlementParams {
  idempotencyKey: string;
  ownerRef: string;
  sourceWalletId: string;
  beneficiaryWalletId: string;
  applicationFeeWalletId?: string;
  feePolicyRef?: string;
  businessCategory?: string;
  pricingProfile?: string;
}
