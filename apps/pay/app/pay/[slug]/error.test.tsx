import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }));

import PayLinkError from './error';

// A gateway failure on the payment-link page is a Portuguese "try again", with
// a retry — never Next's default English error page, and never "invalid link".
describe('payment-link error boundary', () => {
  it('speaks Portuguese, offers a retry, and does not call the link invalid', () => {
    const html = renderToStaticMarkup(<PayLinkError error={new Error('API error 503')} reset={() => {}} />);
    expect(html).toContain('Não foi possível carregar este link de pagamento');
    expect(html).toContain('Tentar novamente');
    expect(html).not.toMatch(/inválid/i);
    expect(html).not.toContain('API error');
    expect(html).not.toMatch(/Application error|client-side exception/);
  });
});
