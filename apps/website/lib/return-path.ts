// Where sign-in returns to: the Console page that sent the developer to sign in
// (a "Try in Sandbox" link from the API reference, a bookmarked page).
//
// Only a same-origin path is accepted. "//evil.example", "/\evil.example",
// "https://…", "javascript:…" and anything with a control character would turn
// sign-in into an open redirect, so they all fall back to "/".
export function safeReturnPath(raw: string | null | undefined): string {
  if (!raw || raw.length > 512) return '/';
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return '/';
  if (/[\x00-\x1f\x7f\\]/.test(raw)) return '/';
  try {
    const u = new URL(raw, 'https://console.invalid');
    if (u.origin !== 'https://console.invalid') return '/';
    if (u.pathname === '/login' || u.pathname === '/verify') return '/';
    return u.pathname + u.search + u.hash;
  } catch {
    return '/';
  }
}
