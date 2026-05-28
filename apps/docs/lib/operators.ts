import operatorsData from '@/data/operators.json'

export type OperatorType =
  | 'reference'
  | 'commercial'
  | 'government_sandbox'
  | 'academic'
  | 'bank'
  | 'merchant_network'
  | 'experimental'
  | 'federation_test_node'

export type OperatorEnvironment = 'sandbox' | 'production' | 'experimental'

export type OperatorStatus = 'active' | 'experimental' | 'deprecated' | 'offline'

export type FederationStatus = 'supported' | 'experimental' | 'planned' | 'unavailable'

export type CapabilityMeta = 'supported' | 'experimental' | 'planned' | 'unavailable'

export type ConformanceBadge =
  | 'protocol-compatible'
  | 'trace-compatible'
  | 'federation-ready'
  | 'settlement-compatible'

export interface SigningKey {
  fingerprint: string
  type: string
  created_at: string
  rotation_date: string | null
  revoked: boolean
}

export interface AuditTrailEntry {
  date: string
  event: string
  description: string
}

export type OperatorCapabilities = Record<string, boolean>

export interface Operator {
  id: string
  display_name: string
  description: string
  type: OperatorType
  environment: OperatorEnvironment
  jurisdiction: string
  public_endpoint: string
  manifest_url: string
  website: string | null
  security_contact: string
  protocol_version: string
  manifest_version: string
  status: OperatorStatus
  certification_level: number
  certification_level_name: string
  conformance_badges: ConformanceBadge[]
  last_conformance_run: string
  conformance_report_hash: string
  runner_version: string
  passed_suites: string[]
  failed_suites: string[]
  capabilities: OperatorCapabilities
  capabilities_metadata: Record<string, CapabilityMeta>
  supported_currencies: string[]
  supported_qr_versions: number[]
  settlement_modes: string[]
  supported_sdk_versions: string[]
  trace_support: boolean
  trace_schema_version: string | null
  federation_support: boolean
  federation_status: FederationStatus
  manifest_status: string
  manifest_schema_valid: boolean
  stale_manifest: boolean
  last_manifest_fetch: string
  simulated: boolean
  production_allowed: boolean
  signing_keys: SigningKey[]
  audit_trail: AuditTrailEntry[]
}

export function getAllOperators(): Operator[] {
  return operatorsData as unknown as Operator[]
}

export function getOperatorById(id: string): Operator | undefined {
  return (operatorsData as unknown as Operator[]).find(op => op.id === id)
}

export const OPERATOR_TYPE_LABELS: Record<OperatorType, string> = {
  reference: 'Referência',
  commercial: 'Comercial',
  government_sandbox: 'Sandbox Governamental',
  academic: 'Académico',
  bank: 'Bancário',
  merchant_network: 'Rede de Comerciantes',
  experimental: 'Experimental',
  federation_test_node: 'Nó de Teste de Federação',
}

export const CERTIFICATION_LEVEL_LABELS: Record<number, { name: string; color: string; bg: string; border: string }> = {
  0: { name: 'Level 0 — Reference',    color: 'text-slate-700',   bg: 'bg-slate-100',   border: 'border-slate-200' },
  1: { name: 'Level 1 — Protocol',     color: 'text-green-700',   bg: 'bg-green-50',    border: 'border-green-200' },
  2: { name: 'Level 2 — Trace',        color: 'text-blue-700',    bg: 'bg-blue-50',     border: 'border-blue-200' },
  3: { name: 'Level 3 — Federation',   color: 'text-purple-700',  bg: 'bg-purple-50',   border: 'border-purple-200' },
  4: { name: 'Level 4 — Settlement',   color: 'text-amber-700',   bg: 'bg-amber-50',    border: 'border-amber-200' },
}

export const CAPABILITY_LABELS: Record<string, string> = {
  supports_wallets: 'Wallets',
  supports_qr: 'QR',
  supports_settlement: 'Liquidação',
  supports_payment_requests: 'Pedidos de Pagamento',
  supports_events: 'Eventos',
  supports_traces: 'Rastreabilidade',
  supports_webhooks: 'Webhooks',
  supports_federation: 'Federação',
  supports_offline_payments: 'Pagamentos Offline',
  supports_multi_currency: 'Multi-Moeda',
  supports_acquiring: 'Acquiring',
  supports_routing: 'Routing',
}

export const BADGE_CONFIG: Record<ConformanceBadge, { label: string; color: string; bg: string; border: string }> = {
  'protocol-compatible':  { label: 'Protocol Compatible',  color: 'text-green-700',  bg: 'bg-green-50',  border: 'border-green-200' },
  'trace-compatible':     { label: 'Trace Compatible',     color: 'text-blue-700',   bg: 'bg-blue-50',   border: 'border-blue-200' },
  'federation-ready':     { label: 'Federation Ready',     color: 'text-purple-700', bg: 'bg-purple-50', border: 'border-purple-200' },
  'settlement-compatible':{ label: 'Settlement Compatible', color: 'text-amber-700', bg: 'bg-amber-50',  border: 'border-amber-200' },
}
