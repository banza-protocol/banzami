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

export interface WebhookEvent {
  id:         string;
  type:       string;
  payload:    unknown;
  created_at: string;
}
