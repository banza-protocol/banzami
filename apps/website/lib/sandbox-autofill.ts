// Sandbox-only autofill data + fake document generation for the Business
// onboarding form (/comerciantes/candidatura). Kept in its own module so the
// values are unit-testable without rendering the whole form, and so the form
// component stays a thin consumer.
//
// SANDBOX ONLY: every consumer of this module is gated behind the live Platform
// Mode (SANDBOX). The generated documents are ordinary uploads — the onboarding
// backend stamps the environment authoritatively from the API host and stores
// them in the environment's own bucket, so a sandbox document can never reach a
// LIVE bucket (the fill controls are never rendered in LIVE either).

import { VOLUME_FAIXAS } from './business-categories';

export type SandboxBusiness = {
  // Sobre o seu negócio
  name: string;
  handle: string;
  category: string;
  subcategory: string;
  phone: string;
  email: string;
  // Localização
  provincia: string;
  municipio: string;
  cidade: string;
  endereco: string;
  referencia: string;
  // Responsável legal
  repNome: string;
  nif: string;
  cargo: string;
  emailPessoal: string;
  telPessoal: string;
  // Atividade do negócio
  descricao: string;
  volume: string;
};

/** A 4-digit seed makes the @handle and emails unique per fill so repeated
 *  sandbox applications never collide on an already-reserved handle. */
export function sandboxSeed(): number {
  return Math.floor(1000 + Math.random() * 9000);
}

/** Complete, valid Angolan test data for every field of the form. The values
 *  are chosen to pass every client-side validation (handle format, 9-digit
 *  phones, NIF, a real Luanda município, a category+subcategory pair, a volume
 *  band) so a single fill lets the tester reach the review step. */
export function sandboxBusinessData(seed: number = sandboxSeed()): SandboxBusiness {
  return {
    name: 'Cantina do Kilamba',
    handle: `cantina_teste_${seed}`,
    category: 'Alimentação e bebidas',
    subcategory: 'Cantina',
    phone: '923456789',
    email: `negocio.teste${seed}@exemplo.co.ao`,
    provincia: 'Luanda',
    municipio: 'Talatona',
    cidade: 'Talatona',
    endereco: 'Rua Direita do Kilamba, Bairro Talatona',
    referencia: 'Próximo ao supermercado Kero',
    repNome: 'João da Silva',
    nif: '5001234567',
    cargo: 'Proprietário(a)',
    emailPessoal: `joao.teste${seed}@exemplo.co.ao`,
    telPessoal: '923000111',
    descricao: 'Cantina com refeições e bebidas para levar',
    volume: VOLUME_FAIXAS[0] ?? '',
  };
}

// --- Sandbox documents -----------------------------------------------------

/** Filenames of the generated sandbox documents, per document slot. */
export const SANDBOX_DOC_FILENAMES = {
  docCertidao: 'registo-comercial-sandbox.pdf',
  docBi: 'bi-representante-sandbox.pdf',
  docExtra: 'documento-adicional-sandbox.pdf',
} as const;

/** A minimal, self-describing PDF payload for a generated sandbox document.
 *  Pure (returns the bytes as a string) so it is testable without a DOM. The
 *  content is a valid single-page PDF stating it is a Banzami SANDBOX document. */
export function sandboxPdfContent(title: string): string {
  const text = `(${title}) Tj 0 -28 Td (Documento SANDBOX - Banzami) Tj 0 -28 Td (Gerado para testes. Sem valor legal.) Tj`;
  const stream = `BT /F1 18 Tf 56 760 Td ${text} ET`;
  return [
    '%PDF-1.4',
    '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj',
    '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj',
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj',
    `4 0 obj<</Length ${stream.length}>>stream`,
    stream,
    'endstream endobj',
    '5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj',
    'trailer<</Root 1 0 R>>',
    '%%EOF',
  ].join('\n');
}

/** Build a generated sandbox document as a real File so it uploads through the
 *  normal presigned-URL path. Browser/Node-20 `File` only; call from the form. */
export function makeSandboxDoc(filename: string, title: string): File {
  return new File([sandboxPdfContent(title)], filename, { type: 'application/pdf' });
}
