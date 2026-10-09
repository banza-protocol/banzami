// @vitest-environment jsdom
//
// Login redesign (2026-10): one unified email + OTP access flow, professional and
// restrained. These lock the copy and structure the brief requires — canonical
// placeholder, no emoji, no "PLATAFORMA DE DEVELOPERS" badge, no secondary
// sign-in/signup prompt — and that a valid email still starts the OTP flow.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import LoginPage from './page';

const push = vi.fn();
const requestOtp = vi.fn();
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: unknown }) => (
    <a href={href} {...(rest as Record<string, unknown>)}>
      {children as never}
    </a>
  ),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: vi.fn() }) }));
vi.mock('@/lib/developer-api', () => ({
  developerApi: { requestOtp: (...a: unknown[]) => requestOtp(...a) },
  ApiError: class ApiError extends Error { code = 'X'; },
  MESSAGES: {} as Record<string, string>,
}));

beforeEach(() => {
  push.mockReset();
  requestOtp.mockReset();
  requestOtp.mockResolvedValue(undefined);
});
afterEach(cleanup);

describe('Developers login — redesigned access surface', () => {
  it('renders the email field with the canonical .com placeholder and an explicit label', () => {
    render(<LoginPage />);
    const input = screen.getByLabelText('Email') as HTMLInputElement;
    expect(input.tagName).toBe('INPUT');
    expect(input.getAttribute('type')).toBe('email');
    expect(input.getAttribute('autocomplete')).toBe('email');
    expect(input.getAttribute('placeholder')).toBe('nome@empresa.com');
  });

  it('uses the new title and subtitle', () => {
    render(<LoginPage />);
    expect(screen.getByRole('heading', { name: 'Aceder à Banzami Developers' })).toBeTruthy();
    expect(screen.getByText('Introduza o seu email para receber um código de acesso.')).toBeTruthy();
    expect(screen.getByText('Enviaremos um código de verificação para o seu email.')).toBeTruthy();
  });

  it('drops the old placeholder, emoji, badge and secondary sign-in prompt', () => {
    const { container } = render(<LoginPage />);
    const text = container.textContent ?? '';
    expect(container.querySelector('input')?.getAttribute('placeholder')).not.toMatch(/\.ao/);
    expect(text).not.toContain('PLATAFORMA DE DEVELOPERS');
    expect(text).not.toContain('Bem-vindo');
    expect(text).not.toContain('👋');
    expect(text).not.toContain('Já tem uma conta');
    expect(text).not.toContain('Entrar');
    expect(text).not.toContain('Criar conta');
    expect(text).not.toContain('Registar');
    // Exactly one primary access action.
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeTruthy();
  });

  it('shows the single "Ao continuar" legal line with Terms and Privacy links', () => {
    render(<LoginPage />);
    // Authentication is not Terms acceptance: the line says what continuing
    // does (signs in) and points at the documents, never "concorda".
    expect(screen.getByText(/Ao continuar, prossegue com a autenticação\. Consulte os/)).toBeTruthy();
    expect(document.body.textContent ?? '').not.toMatch(/concorda/i);
    const terms = screen.getByRole('link', { name: 'Termos de Serviço' });
    const privacy = screen.getByRole('link', { name: 'Política de Privacidade' });
    expect(terms.getAttribute('href')).toBe('https://banzami.com/termos');
    expect(privacy.getAttribute('href')).toBe('https://banzami.com/privacidade');
  });

  it('a valid email starts the OTP flow (requestOtp then navigate to /verify)', async () => {
    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'dev@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    await waitFor(() => expect(requestOtp).toHaveBeenCalledWith('dev@example.com'));
    await waitFor(() => expect(push).toHaveBeenCalledTimes(1));
    expect(push.mock.calls[0][0]).toContain('/verify?email=dev%40example.com');
  });
});
