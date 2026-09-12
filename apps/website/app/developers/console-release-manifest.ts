/**
 * What the Developer Console releases, stated once.
 *
 * Navigation became the accidental source of truth: a sidebar entry existed, so
 * a page had to exist, so a placeholder was written, and a placeholder that
 * ships long enough starts to look like a feature. Three surfaces were removed
 * on that basis — a customer directory the platform has no primitive for, an
 * operational status painted green in the markup, and a notification bell with
 * nothing behind it.
 *
 * This file is the list. The guard compares it against the navigation and the
 * routes on disk, so adding a nav entry without a real page fails, and so does
 * shipping a page for something marked NOT RELEASED.
 */

export type ReleaseState = 'RELEASED' | 'NOT_RELEASED';

export type ConsoleSurface = {
  key: string;
  /** The route under the Console host, or null when nothing is served. */
  route: string | null;
  state: ReleaseState;
  /** Why, in one line. Required for anything not released. */
  note?: string;
};

export const CONSOLE_SURFACES: ConsoleSurface[] = [
  { key: 'overview', route: '/', state: 'RELEASED' },
  { key: 'balances', route: '/saldos', state: 'RELEASED' },
  { key: 'transactions', route: '/transacoes', state: 'RELEASED' },
  { key: 'financial_setup', route: '/financeiro', state: 'RELEASED' },
  { key: 'api_keys', route: '/api-keys', state: 'RELEASED' },
  { key: 'webhooks', route: '/webhooks', state: 'RELEASED' },
  { key: 'logs_events', route: '/logs', state: 'RELEASED' },
  { key: 'docs', route: '/docs', state: 'RELEASED' },
  { key: 'settings', route: '/settings', state: 'RELEASED' },
  { key: 'go_live_info', route: '/go-live', state: 'RELEASED' },
  { key: 'support', route: '/suporte', state: 'RELEASED' },
  // The person's own account — distinct from the workspace, the project and the
  // business. Profile, the real auth model, and where the account is signed in.
  { key: 'account', route: '/conta', state: 'RELEASED' },

  {
    key: 'customers',
    route: null,
    state: 'NOT_RELEASED',
    note: 'No project-scoped customer resource exists. customers:read resolves a single @handle and returns the handle and a display name; a list would be a directory of strangers’ accounts.',
  },
  {
    key: 'status',
    route: null,
    state: 'NOT_RELEASED',
    note: 'No status service. The previous item was a green dot in the markup that reported healthy through every outage.',
  },
  {
    key: 'notifications',
    route: null,
    state: 'NOT_RELEASED',
    note: 'No notification backend. The bell had no handler and an unread dot that was always on.',
  },
];
