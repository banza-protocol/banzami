// BANZADMIN navigation. An item with an attentionKey shows the server's count
// for that category (lib/attention.ts); an item without one never has a badge —
// it is a place to look things up or configure, not a queue.
//
// NAV ITEM → attentionKey → rule (server) → page view:
//   Inbox                → inbox                   → unresolved compliance cases → /compliance/inbox?attention=1 (status OPEN)
//   Candidaturas         → business_applications   → to review / re-approve      → /merchants?attention=1 (status ATTENTION)
//   Documentos KYB       → kyb_documents           → Businesses with documents pending review → /merchant-kyb?attention=1
//   Documentos KYC       → kyc_documents           → cases the consumer submitted → /consumer-kyc?attention=1 (UNDER_REVIEW)
//   Liquidações          → settlements             → to submit / confirm         → /settlements?attention=1
//   Levantamentos        → payouts                 → not yet terminal            → /payments?attention=1
//   Reconciliação        → reconciliation          → latest run failed / unmatched items → /reconciliation
//   Disputas             → disputes                → waiting for the operator    → /disputes?attention=1
//   Risco e auditoria    → risk_flags              → unresolved flags            → /risk?attention=1
//   Liquidações de apps  → application_settlements → stuck in flight             → /application-settlements?attention=1
// docs/admin/OPERATOR_ATTENTION.md holds the same table with the full rules.

import {
  LayoutGrid, Building2, Users, Layers, CreditCard, ReceiptText, RefreshCw, Scale, Shield, UserCog,
  FileCheck, ScanFace, Inbox, ToggleLeft, ShieldCheck, Tags, Coins, HandCoins, PieChart,
  SlidersHorizontal, ScrollText, Store, FlaskConical, type LucideIcon,
} from 'lucide-react';
import type { AttentionKey } from '@/lib/attention';

// `roles`, when set, restricts who SEES the item in the sidebar (presentation
// only — admin-api re-authorizes every action; the sidebar is never authority).
// Omitted = visible to every authenticated operator.
export type NavItem = { href: string; label: string; Icon: LucideIcon; exact?: boolean; attentionKey?: AttentionKey; roles?: string[] };
export type NavSection = { section: string; items: NavItem[] };
export type NavEntry = NavItem | NavSection;

// One operator concept → one owner route → one label, grouped by operator task
// (BANZADMIN-IA-NAV-001). Routes are stable; only labels/grouping change.
// Terminology is Portuguese and consistent: Comerciantes (operational merchant
// accounts, route stays /businesses), Risco e auditoria, Políticas de taxas,
// Resumo financeiro (the finance overview, distinct from the global Visão geral).
export const NAV: NavEntry[] = [
  { href: '/', label: 'Visão geral', Icon: LayoutGrid, exact: true },
  {
    section: 'Identidade e onboarding',
    items: [
      { href: '/compliance/inbox', label: 'Inbox', Icon: Inbox, attentionKey: 'inbox' },
      { href: '/merchants', label: 'Candidaturas', Icon: Building2, attentionKey: 'business_applications' },
      { href: '/businesses', label: 'Comerciantes', Icon: Store },
      { href: '/consumers', label: 'Consumidores', Icon: Users },
      { href: '/merchant-kyb', label: 'Documentos KYB', Icon: FileCheck, attentionKey: 'kyb_documents' },
      { href: '/consumer-kyc', label: 'Documentos KYC', Icon: ScanFace, attentionKey: 'kyc_documents' },
      { href: '/beta-testers', label: 'Beta testers', Icon: FlaskConical },
    ],
  },
  {
    section: 'Operações financeiras',
    items: [
      { href: '/wallet-payments', label: 'Pagamentos recebidos', Icon: ReceiptText },
      { href: '/proofs', label: 'Comprovativos', Icon: ShieldCheck },
      { href: '/settlements', label: 'Liquidações', Icon: Layers, attentionKey: 'settlements' },
      { href: '/payments', label: 'Levantamentos', Icon: CreditCard, attentionKey: 'payouts' },
      { href: '/reconciliation', label: 'Reconciliação', Icon: RefreshCw, attentionKey: 'reconciliation' },
      { href: '/disputes', label: 'Disputas', Icon: Scale, attentionKey: 'disputes' },
    ],
  },
  {
    section: 'Risco e plataforma',
    items: [
      { href: '/risk', label: 'Risco e auditoria', Icon: Shield, attentionKey: 'risk_flags' },
      { href: '/operators', label: 'Operadores', Icon: UserCog, roles: ['SUPER_ADMIN'] },
      { href: '/platform-mode', label: 'Modo da plataforma', Icon: ToggleLeft, roles: ['SUPER_ADMIN'] },
    ],
  },
  {
    section: 'Preços e finanças',
    items: [
      { href: '/finance', label: 'Resumo financeiro', Icon: PieChart },
      { href: '/pricing-rules', label: 'Regras de preço', Icon: Tags },
      { href: '/pricing-profiles', label: 'Perfis de preço', Icon: SlidersHorizontal },
      { href: '/fee-policies', label: 'Políticas de taxas', Icon: ScrollText },
      { href: '/operator-fees', label: 'Taxas do operador', Icon: Coins },
      { href: '/application-settlements', label: 'Liquidações de aplicações', Icon: HandCoins, attentionKey: 'application_settlements' },
    ],
  },
];

export function isSection(e: NavEntry): e is NavSection {
  return (e as NavSection).section !== undefined;
}

export function navItems(entries: NavEntry[] = NAV): NavItem[] {
  return entries.flatMap((e) => (isSection(e) ? e.items : [e]));
}

// The sidebar for a role: drops items the role may not see and any section left
// empty. Presentation only — authority stays with admin-api.
export function navForRole(role: string | undefined, entries: NavEntry[] = NAV): NavEntry[] {
  const allowed = (i: NavItem) => !i.roles || (role !== undefined && i.roles.includes(role));
  return entries
    .map((e) => (isSection(e) ? { ...e, items: e.items.filter(allowed) } : e))
    .filter((e) => (isSection(e) ? e.items.length > 0 : allowed(e as NavItem)));
}
