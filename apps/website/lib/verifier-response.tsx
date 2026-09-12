import type { ReactElement } from 'react';

/**
 * Turns a verifier view into an HTTP response with an exact status.
 *
 * It lives outside app/ because it renders React to HTML itself: the App Router
 * refuses react-dom/server inside app/, and rightly — a component has no
 * business doing this. A route handler that must control its status code does,
 * and this is the one place that does it.
 */

const TITLE = 'Verificação de comprovativo · Banzami';
const DESCRIPTION = 'Confirme a autenticidade de um comprovativo Banzami no sistema oficial.';

// The document shell. The verifier is a standalone trust surface — every part of
// it is styled inline (verifier-parts.tsx) — so it needs only the site's two
// faces and the reset the body relies on, not the marketing layout.
function documentHtml(body: string): string {
  return `<!DOCTYPE html><html lang="pt"><head>` +
    `<meta charset="utf-8"/>` +
    `<meta name="viewport" content="width=device-width, initial-scale=1"/>` +
    `<meta name="robots" content="noindex, nofollow"/>` +
    `<meta name="description" content="${DESCRIPTION}"/>` +
    `<meta name="theme-color" content="#FBD2D0"/>` +
    `<title>${TITLE}</title>` +
    `<link rel="icon" href="/icon.svg" type="image/svg+xml"/>` +
    `<link rel="preconnect" href="https://fonts.googleapis.com"/>` +
    `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin=""/>` +
    `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600;700&display=swap"/>` +
    `<style>*{box-sizing:border-box}body{margin:0;font-family:'Nunito',system-ui,-apple-system,BlinkMacSystemFont,sans-serif;color:#2a2024;background:#fff;-webkit-font-smoothing:antialiased}a{color:inherit}::selection{background:#fbd2d0;color:#9a1b22}</style>` +
    `</head><body>${body}</body></html>`;
}

export async function verifierResponse(view: ReactElement, status: number): Promise<Response> {
  const { renderToStaticMarkup } = await import('react-dom/server');
  return new Response(documentHtml(renderToStaticMarkup(view)), {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      // An answer about one reader's reference, read live. Never held by a
      // shared cache, and never indexed — in any of the four states.
      'cache-control': 'no-store, must-revalidate',
      'x-robots-tag': 'noindex, nofollow',
      'referrer-policy': 'no-referrer',
    },
  });
}
