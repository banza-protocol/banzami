// Who is reading a proof (A9-08).
//
// /r/{ref} is rendered on the website's server, so its lookup reaches the
// gateway from the website's own address. Keyed on that address, every reader
// shared one allowance: one client asking ~70 times a minute made verification
// "unavailable" for everybody. The website therefore names the reader in a
// header of its own. The gateway believes it only when the call comes from the
// website's egress address (PROOF_READER_FORWARDER_CIDRS) and limits per
// reader; from anyone else it is ignored.
//
// The reader's address is the X-Real-IP the website edge set — $remote_addr,
// which is Cloudflare's CF-Connecting-IP only from Cloudflare's ranges
// (infra/nginx/website.conf). It is forwarded only if it is one address, so the
// header can never carry anything else.
//
// Plain module, no next/headers: lib/api.ts is also bundled for the browser.
// The server page reads its request headers and passes them in.

/** The header the gateway reads (services/api-gateway config.ProofReaderHeader). */
export const PROOF_READER_HEADER = 'X-Banzami-Reader-IP';

const IPV4 = /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/;
const IPV6 = /^[0-9a-fA-F:]{2,39}$/;

function isAddress(v: string): boolean {
  if (IPV4.test(v)) return true;
  // An IPv6 address as nginx prints it: hex groups and colons, at least two
  // colons, at most one "::". (An IPv4 tail, ::ffff:a.b.c.d, is not forwarded.)
  return IPV6.test(v) && (v.match(/:/g) ?? []).length >= 2 && v.split('::').length <= 2;
}

/** The reader's address from the request the website edge proxied, if it is one. */
export function readerIpFrom(h: { get(name: string): string | null }): string | undefined {
  const v = (h.get('x-real-ip') ?? '').trim();
  return isAddress(v) ? v : undefined;
}

/** Headers for the gateway's proof lookup: the reader, or nothing. */
export function proofReaderHeaders(readerIp?: string): Record<string, string> {
  return readerIp && isAddress(readerIp) ? { [PROOF_READER_HEADER]: readerIp } : {};
}
