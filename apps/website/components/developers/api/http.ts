/**
 * The HTTP semantics the Developer Platform draws — one table for the
 * documentation, its search and the Console's API Explorer (DOCS-VISUAL-DX-002).
 *
 * Methods and statuses get protocol colours, not brand colours: Banzami red is
 * the brand and the colour of navigation, so a DELETE, a 4xx and a link must not
 * all read as the same red thing. The verb or the status code is always written
 * out; colour is a second signal, never the only one. Every foreground passes
 * WCAG AA (4.5:1) on its own background.
 */

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

export type Swatch = { fg: string; bg: string; bd: string };

export const METHOD_SWATCH: Record<HttpMethod, Swatch> = {
  GET: { fg: '#1B5E9E', bg: '#EAF2FB', bd: '#CADCF1' },     // read — calm blue
  POST: { fg: '#146B46', bg: '#E7F4EC', bd: '#C3E2D0' },    // create — green
  PUT: { fg: '#4F42A8', bg: '#EFEDFA', bd: '#D6D1F1' },     // replace — indigo
  PATCH: { fg: '#8A5300', bg: '#FCF1DF', bd: '#EFD7AE' },   // modify — amber
  DELETE: { fg: '#A3213A', bg: '#FBEAEC', bd: '#F0C9CF' },  // remove — rose red, not the brand red
  HEAD: { fg: '#574C50', bg: '#F2EFEF', bd: '#DFD8D9' },
  OPTIONS: { fg: '#574C50', bg: '#F2EFEF', bd: '#DFD8D9' },
};

export const isHttpMethod = (m: string): m is HttpMethod => Object.prototype.hasOwnProperty.call(METHOD_SWATCH, m);

export type StatusClass = 'success' | 'redirect' | 'client' | 'server';

export const STATUS_SWATCH: Record<StatusClass, Swatch> = {
  success: { fg: '#146B46', bg: '#E7F4EC', bd: '#C3E2D0' },
  redirect: { fg: '#574C50', bg: '#F2EFEF', bd: '#DFD8D9' },
  client: { fg: '#8F3F12', bg: '#FCEDE3', bd: '#F0D0BC' },   // the request needs changing — terracotta
  server: { fg: '#A3213A', bg: '#FBEAEC', bd: '#F0C9CF' },   // the service failed — red
};

export function statusClass(code: number): StatusClass {
  if (code >= 500) return 'server';
  if (code >= 400) return 'client';
  if (code >= 300) return 'redirect';
  return 'success';
}

/** Reason phrases for the statuses the platform returns. */
export const STATUS_TEXT: Record<number, string> = {
  200: 'OK', 201: 'Created', 202: 'Accepted', 204: 'No Content', 304: 'Not Modified',
  400: 'Bad Request', 401: 'Unauthorized', 402: 'Payment Required', 403: 'Forbidden', 404: 'Not Found',
  405: 'Method Not Allowed', 409: 'Conflict', 410: 'Gone', 413: 'Payload Too Large', 415: 'Unsupported Media Type',
  422: 'Unprocessable Entity', 429: 'Too Many Requests', 500: 'Internal Server Error', 502: 'Bad Gateway',
  503: 'Service Unavailable', 504: 'Gateway Timeout',
};
