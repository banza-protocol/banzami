'use client';

import { useEffect } from 'react';
import { Card } from './ui';

const mono = "'JetBrains Mono', ui-monospace, monospace";

// The domain half of a scope, in the developer's language. A scope string is an
// authority decision compressed into one token; the table can only ever show a
// summary of it, so this is where the decision is actually readable.
//
// A domain missing from this map still renders — under its raw token — because a
// scope the Console does not recognise is exactly the one a developer most needs
// to see, not the one to hide.
export const SCOPE_DOMAIN_LABEL: Record<string, string> = {
  payments: 'Pagamentos',
  payment_sessions: 'Sessões de pagamento',
  payment_links: 'Links de pagamento',
  wallet_accounts: 'Contas de carteira',
  webhooks: 'Webhooks',
  refunds: 'Reembolsos',
  transfers: 'Transferências',
  customers: 'Clientes',
  identity: 'Identidade',
  application_settlements: 'Liquidações',
};

// Read and write are not two shades of the same permission. A read scope can
// never move money, register an endpoint or open a session — and the difference
// has to survive being summarised, so it is a label on every row and not a
// colour on the token.
export type ScopeAccess = 'read' | 'write';

export function scopeAccess(scope: string): ScopeAccess {
  const verb = scope.split(':')[1] ?? '';
  return verb === 'read' ? 'read' : 'write';
}

export function scopeDomain(scope: string): string {
  return scope.split(':')[0] ?? scope;
}

export function domainLabel(domain: string): string {
  return SCOPE_DOMAIN_LABEL[domain] ?? domain;
}

/** Scopes grouped by domain, domains in the order the key's scopes first name them. */
export function groupScopesByDomain(scopes: string[]): { domain: string; label: string; scopes: string[] }[] {
  const byDomain = new Map<string, string[]>();
  for (const sc of scopes) {
    const d = scopeDomain(sc);
    byDomain.set(d, [...(byDomain.get(d) ?? []), sc]);
  }
  return [...byDomain.entries()].map(([domain, list]) => ({
    domain,
    label: domainLabel(domain),
    // Reads before writes inside a domain: the weaker authority reads first.
    scopes: [...list].sort((a, b) => scopeAccess(a).localeCompare(scopeAccess(b)) || a.localeCompare(b)),
  }));
}

const ACCESS_LABEL: Record<ScopeAccess, string> = { read: 'Leitura', write: 'Escrita' };

/**
 * What a key is actually allowed to do, on one screen.
 *
 * The table cannot carry this: a key with eight scopes rendered as a joined
 * token string produced a cell wider than the rest of the table put together,
 * and still did not say what any of it granted. So the table carries a summary
 * and this carries the decision — grouped by domain, with the same plain-language
 * text the picker shows when the scope is chosen.
 */
export function ScopeDrawer({
  keyName,
  scopes,
  help,
  onClose,
}: {
  keyName: string;
  scopes: string[];
  // Passed in rather than imported: SCOPE_HELP lives beside the picker in
  // ApiKeysManager, and importing it here would close a cycle between the two.
  help: Record<string, string>;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const groups = groupScopesByDomain(scopes);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Permissões da chave ${keyName}`}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 70,
        background: 'rgba(42,32,36,.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <Card style={{ maxWidth: 560, width: '100%', maxHeight: '82vh', overflowY: 'auto', padding: 24 }}>
        <h3 style={{ margin: '0 0 4px', fontSize: 17, fontWeight: 900 }}>Permissões da chave</h3>
        <p style={{ margin: '0 0 14px', fontSize: 13.5, color: '#8a7a7e', fontWeight: 700 }}>{keyName}</p>

        <p style={{ margin: '0 0 16px', fontSize: 12.5, color: '#8a7a7e', fontWeight: 600, lineHeight: 1.55 }}>
          Cada permissão (<em>scope</em>) é uma decisão de autoridade. Uma permissão de{' '}
          <strong>leitura</strong> nunca autoriza uma alteração — só ver.
        </p>

        {groups.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: '#8a7a7e' }}>
            Esta chave não tem permissões — não consegue chamar nenhuma rota.
          </p>
        ) : (
          groups.map((g) => (
            <div key={g.domain} style={{ marginBottom: 14 }}>
              <p style={{ margin: '0 0 6px', fontSize: 11.5, fontWeight: 900, letterSpacing: '.04em', color: '#a89a9e', textTransform: 'uppercase' }}>
                {g.label}
              </p>
              {g.scopes.map((sc) => {
                const access = scopeAccess(sc);
                return (
                  <div
                    key={sc}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 10,
                      padding: '9px 11px',
                      borderRadius: 11,
                      border: '1px solid #F2E2E0',
                      marginBottom: 6,
                    }}
                  >
                    <span
                      style={{
                        flex: 'none',
                        marginTop: 1,
                        padding: '2px 7px',
                        borderRadius: 30,
                        fontSize: 10.5,
                        fontWeight: 900,
                        background: access === 'write' ? '#FDECEC' : '#F3EDEC',
                        color: access === 'write' ? '#C4303C' : '#8a7a7e',
                      }}
                    >
                      {ACCESS_LABEL[access]}
                    </span>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: 'block', fontFamily: mono, fontSize: 11.5, fontWeight: 700, color: '#3a2a2e', wordBreak: 'break-all' }}>
                        {sc}
                      </span>
                      <span style={{ display: 'block', marginTop: 2, fontSize: 12, fontWeight: 600, lineHeight: 1.45, color: '#8a7a7e' }}>
                        {help[sc] ?? 'Permissão não reconhecida por esta consola.'}
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>
          ))
        )}

        <button
          onClick={onClose}
          style={{ width: '100%', padding: 12, border: '1.5px solid #EBDBD9', borderRadius: 12, background: '#fff', color: '#6a5a5e', fontWeight: 800, fontSize: 13.5, cursor: 'pointer' }}
        >
          Fechar
        </button>
      </Card>
    </div>
  );
}
