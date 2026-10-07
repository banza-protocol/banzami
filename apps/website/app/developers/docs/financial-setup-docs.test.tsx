// @vitest-environment jsdom
//
// Financial setup documentation: business identity selection and verified @banza
// linking. Guards the model the page teaches, in both languages:
//   - the @banza belongs to the Business, not to the Project; a project LINKS to a Business;
//   - three ways in: create a Business, link by @banza (verified contact), use a link code;
//   - two email confirmations, neither of them KYB, and the security box that says why a
//     user cannot provide another email;
//   - the Sandbox is fictitious money and real-money operations are unavailable;
//   - the Console-internal operations are described as a flow and never published as API;
//   - the page is reachable (sidebar, home, search metadata) and linked from the pages that
//     need it, and the quickstart puts it between the project and the API key.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import PtFinancialSetupPage from './financial-setup/page';
import EnFinancialSetupPage from './en/financial-setup/page';
import { AREAS_EN, AREAS_PT, NAV_GROUPS, TOC_PAGES } from './shell';
import { DOCS_META } from './docs-meta';
import { GLOSSARY_BY_ID } from './glossary';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const DIR = 'app/developers/docs';
const PT = read(`${DIR}/content-pt.tsx`);
const EN = read(`${DIR}/content-en.tsx`);

const fn = (src: string, name: string) => {
  const at = src.indexOf(`export function ${name}(`);
  const next = src.indexOf('\nexport function ', at + 10);
  return src.slice(at, next < 0 ? undefined : next);
};
const PT_PAGE = fn(PT, 'PtFinancialSetup');
const EN_PAGE = fn(EN, 'EnFinancialSetup');

beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', class {
    observe() {} unobserve() {} disconnect() {}
  });
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Financial setup page: structure, in order, in both languages', () => {
  const PT_SECTIONS = [
    'O que é a configuração financeira', 'Projeto vs negócio', 'O que é o @banza', 'Criar um novo negócio de teste', 'Ligar um negócio existente',
    'Confirmar controlo por email', 'Usar um código de ligação', 'Negócios encontrados na sua conta', 'Candidaturas e @banza já reservado', 'Estado «Pronto»',
    'KYB vs confirmação de controlo', 'Utilizar o mesmo negócio em mais de um projeto', 'Segurança e privacidade', 'Erros e situações comuns',
    'Sandbox vs operações com dinheiro real', 'Próximos passos',
  ];
  const EN_SECTIONS = [
    'What financial setup is', 'Project vs Business', 'What the @banza is', 'Create a new test Business', 'Link an existing Business',
    'Confirm control by email', 'Use a link code', 'Businesses found in your account', 'Applications and an @banza already reserved', 'The “Ready” state',
    'KYB vs confirmation of control', 'Use the same Business in more than one project', 'Security and privacy', 'Common errors and situations',
    'Sandbox vs real-money operations', 'Next steps',
  ];
  it('PT: sixteen sections in the planned order', () => {
    render(<PtFinancialSetupPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Configuração financeira' })).toBeTruthy();
    const h2 = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(h2).toEqual(PT_SECTIONS);
  });
  it('EN: the same sixteen sections', () => {
    render(<EnFinancialSetupPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Financial setup' })).toBeTruthy();
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(EN_SECTIONS);
  });
  it('draws the Project, Business and @banza diagram with a title and a description', () => {
    render(<PtFinancialSetupPage />);
    const fig = screen.getByRole('img', { name: /Workspace, projeto, negócio, @banza e carteira/ });
    expect(fig.querySelector('desc')?.textContent).toMatch(/Doa Sandbox.*Doa Payments.*Doa/);
    cleanup();
    render(<EnFinancialSetupPage />);
    expect(screen.getByRole('img', { name: /Workspace, project, Business, @banza and wallet/ })).toBeTruthy();
  });
});

describe('Financial setup page: the model and the mandatory statements', () => {
  it('states that the @banza belongs to the Business, in both languages', () => {
    render(<PtFinancialSetupPage />);
    expect(screen.getAllByText(/O @banza pertence ao negócio, não ao projeto\./).length).toBeGreaterThan(0);
    cleanup();
    render(<EnFinancialSetupPage />);
    expect(screen.getAllByText(/The @banza belongs to the Business, not to the Project\./).length).toBeGreaterThan(0);
  });
  it('says an application email is not confirmed until verification is complete', () => {
    expect(PT_PAGE).toContain('Um email indicado numa candidatura não é considerado confirmado até concluir a verificação.');
    expect(EN_PAGE).toContain('An email provided in an application is not considered confirmed until verification is complete.');
  });
  it('has the security box that says why another email cannot be provided', () => {
    render(<PtFinancialSetupPage />);
    const box = screen.getAllByRole('note').find((n) => /Porque não pode indicar outro email\?/.test(n.textContent ?? ''));
    expect(box, 'a security box').toBeTruthy();
    expect(box!.textContent).toContain('Ao ligar um @banza existente, a Banzami não utiliza um email indicado nesse momento pelo utilizador.');
    expect(box!.textContent).toContain('A confirmação é enviada para um contacto previamente verificado associado ao negócio.');
    cleanup();
    render(<EnFinancialSetupPage />);
    const en = screen.getAllByRole('note').find((n) => /Why can’t you provide another email\?/.test(n.textContent ?? ''));
    expect(en!.textContent).toContain('Banzami does not use an email that the user provides at that moment.');
    expect(en!.textContent).toContain('previously verified contact associated with the Business');
  });
  it('keeps the three ways in, and shows a contact only masked', () => {
    for (const page of [PT_PAGE, EN_PAGE]) {
      expect(page).toContain('f****@example.com');
      expect(page).not.toMatch(/[a-z0-9._-]+@(?!example\.com)[a-z0-9-]+\.[a-z]{2,}/i);
    }
    expect(PT_PAGE).toMatch(/Criar um novo negócio de teste[\s\S]*Ligar um negócio existente[\s\S]*Usar um código de ligação/);
    expect(EN_PAGE).toMatch(/Create a new test Business[\s\S]*Link an existing Business[\s\S]*Use a link code/);
  });
  it('keeps email confirmation and KYB apart, and a test Business out of KYB', () => {
    expect(PT_PAGE).toContain('Não aplicável no Sandbox');
    expect(EN_PAGE).toContain('Not applicable in the Sandbox');
    expect(PT_PAGE).toContain('Um email confirmado prova acesso a um contacto. Não é KYB');
    expect(EN_PAGE).toContain('A confirmed email proves access to a contact. It is not KYB');
  });
  it('states the Sandbox is fictitious money and real-money operations are unavailable', () => {
    expect(PT_PAGE).toContain('todos os valores são fictícios e as operações com dinheiro real estão indisponíveis');
    expect(EN_PAGE).toContain('every value is fictitious and real-money operations are unavailable');
  });
  it('uses the canonical example everywhere, and never says the Project owns the @banza', () => {
    for (const page of [PT_PAGE, EN_PAGE]) {
      for (const name of ['Doa Sandbox', 'Doa Payments', '@doa', 'AOA']) expect(page, name).toContain(name);
      expect(page).not.toMatch(/Doa Payments (owns|possui|tem) (o |the )?@doa/);
    }
  });
  it('exposes no namespace classification, no internal routes, no table or pepper names', () => {
    for (const page of [PT_PAGE, EN_PAGE]) {
      expect(page).not.toMatch(/\b(RESERVED|PROTECTED|SYSTEM)\b/);
      expect(page).not.toMatch(/link-by-handle|financial-setup\/(contact|create)|financial-onboarding|BUSINESS_CONTACT_VERIFY|BUSINESS_PROJECT_LINK|pepper|HMAC|dev_project|handle_registry/i);
    }
  });
  it('uses no em or en dash as editorial punctuation', () => {
    for (const page of [PT_PAGE, EN_PAGE]) expect(page).not.toMatch(/[—–]/);
  });
});

describe('Financial setup page: the Console codes it documents are the real ones', () => {
  it('lists the same codes, with the same HTTP status, in both languages', () => {
    const rows = (page: string) => [...page.matchAll(/\['([A-Z][A-Z_]+)', '(\d{3})', '/g)].map((m) => `${m[2]} ${m[1]}`);
    const expected = [
      '400 INVALID_HANDLE', '409 HANDLE_UNAVAILABLE', '400 INVALID_CODE', '429 TOO_MANY_ATTEMPTS', '409 NO_VERIFIED_CONTACT',
      '410 LINK_GRANT_EXPIRED', '404 NOT_FOUND', '409 PROJECT_ALREADY_RECEIVING', '403 FORBIDDEN',
    ];
    expect(rows(PT_PAGE)).toEqual(expected);
    expect(rows(EN_PAGE)).toEqual(expected);
  });
  it('tells the developer never to decide by the message', () => {
    expect(PT_PAGE).toContain('nunca pela mensagem');
    expect(EN_PAGE).toContain('never by the message');
  });
});

describe('Financial setup page: the Console operations are a flow, not public API', () => {
  const ref = read(`${DIR}/reference.tsx`) + read(`${DIR}/endpoint-meta.ts`);
  const openapi = read('public/developers/openapi/banzami-sandbox.openapi.json');
  const postman = read('public/developers/postman/banzami-sandbox.postman_collection.json');
  it('publishes only GET /v1/financial-setup, and none of the Console routes', () => {
    expect(ref).toContain("path: '/v1/financial-setup'");
    for (const internal of ['link-by-handle', 'financial-setup/contact', 'financial-setup/create', 'financial-onboarding/contact']) {
      expect(ref.includes(internal), `reference.tsx names ${internal}`).toBe(false);
      expect(openapi.includes(internal), `OpenAPI names ${internal}`).toBe(false);
      expect(postman.includes(internal), `Postman names ${internal}`).toBe(false);
    }
    for (const page of [PT_PAGE, EN_PAGE]) expect(page).toMatch(/GET \/v1\/financial-setup/);
  });
  it('says the endpoints behind the Console flow are internal and an API key does not reach them', () => {
    expect(PT_PAGE).toContain('Uma chave de API não cria nem liga negócios.');
    expect(EN_PAGE).toContain('An API key does not create or link Businesses.');
  });
});

describe('Financial setup page: reachable and linked', () => {
  it('is in the Console group, the sidebar order, the table of contents and the page metadata', () => {
    const group = NAV_GROUPS.find((g) => g.id === 'console');
    expect(group?.slugs).toEqual(['console', 'financial-setup']);
    expect(AREAS_PT.map((a) => a.slug)).toContain('financial-setup');
    expect(AREAS_PT.map((a) => a.slug)).toEqual(AREAS_EN.map((a) => a.slug));
    expect(AREAS_PT.find((a) => a.slug === 'financial-setup')?.label).toBe('Configuração financeira');
    expect(AREAS_EN.find((a) => a.slug === 'financial-setup')?.label).toBe('Financial setup');
    expect(TOC_PAGES).toContain('financial-setup');
    expect(DOCS_META['financial-setup'].pt[0]).toBe('Configuração financeira');
    expect(DOCS_META['financial-setup'].en[0]).toBe('Financial setup');
  });
  it('is linked from the quickstart, the Console, the concepts, DOA, testing, glossary and errors pages', () => {
    for (const name of ['GetStarted', 'Console', 'Concepts', 'Doa', 'Testing', 'Errors']) {
      expect(fn(PT, `Pt${name}`), `PT ${name}`).toMatch(/href="\/docs\/financial-setup[#"]|href: '\/docs\/financial-setup/);
      expect(fn(EN, `En${name}`), `EN ${name}`).toMatch(/href="\/docs\/en\/financial-setup[#"]|href: '\/docs\/en\/financial-setup/);
    }
    expect(PT_PAGE).toContain("href: '/docs/glossary'");
    expect(EN_PAGE).toContain("href: '/docs/en/glossary'");
    for (const g of [fn(PT, 'PtGlossary'), fn(EN, 'EnGlossary')]) expect(g).toMatch(/\/docs(\/en)?\/financial-setup/);
    expect(read(`${DIR}/HomePage.tsx`)).toContain("'/docs/financial-setup'");
    expect(read(`${DIR}/HomePage.tsx`)).toContain("'/docs/en/financial-setup'");
  });
  it('defines the new terms in the glossary, with the @banza definition the model needs', () => {
    expect(GLOSSARY_BY_ID['banza-handle'].def).toBe('Identificador único de um negócio na Banzami. O @banza pertence ao negócio, não ao projeto.');
    for (const id of ['business', 'projeto', 'configuracao-financeira', 'negocio-teste', 'confirmacao-controlo', 'kyb', 'codigo-ligacao']) expect(GLOSSARY_BY_ID[id], id).toBeTruthy();
    expect(EN).toContain('The unique identifier of a Business on Banzami. The @banza belongs to the Business, not to the Project.');
  });
});

describe('Quickstart: a project is not financially ready when it is created', () => {
  it('goes workspace, project, financial identity, Ready, API key, first payment, verify', () => {
    for (const [src, terms] of [
      [fn(PT, 'PtGetStarted'), ['id="passo-2"', 'id="passo-3"', 'Configurar a identidade financeira', 'estado Pronto', 'id="passo-5"', 'id="passo-8"', 'id="passo-10"']],
      [fn(EN, 'EnGetStarted'), ['id="step-2"', 'id="step-3"', 'Set up the financial identity', 'state Ready', 'id="step-5"', 'id="step-8"', 'id="step-10"']],
    ] as [string, string[]][]) {
      let at = -1;
      for (const t of terms) {
        const i = src.indexOf(t, at + 1);
        expect(i, `"${t}" after position ${at}`).toBeGreaterThan(at);
        at = i;
      }
    }
    expect(fn(PT, 'PtGetStarted')).toContain('Um projeto não fica financeiramente pronto quando é criado.');
    expect(fn(EN, 'EnGetStarted')).toContain('A project is not financially ready when it is created.');
  });
  it('the DOA guide no longer says Banzami creates the human Business for you', () => {
    for (const page of [fn(PT, 'PtDoa'), fn(EN, 'EnDoa')]) {
      expect(page).not.toMatch(/waiting for nobody|sem esperar por ninguém/);
      expect(page).not.toMatch(/Banzami creates the project’s test Business|Cria o negócio de teste do projeto/);
    }
    expect(fn(PT, 'PtDoa')).toMatch(/Doa Sandbox[\s\S]*Doa Payments[\s\S]*@doa[\s\S]*código de consentimento/);
    expect(fn(EN, 'EnDoa')).toMatch(/Doa Sandbox[\s\S]*Doa Payments[\s\S]*@doa[\s\S]*consent code/);
  });
});

describe('Financial setup page: nothing fetches and no origin leaks', () => {
  it('renders statically', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    render(<PtFinancialSetupPage />);
    const main = screen.getByRole('main');
    expect(within(main).getAllByRole('link').length).toBeGreaterThan(5);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
