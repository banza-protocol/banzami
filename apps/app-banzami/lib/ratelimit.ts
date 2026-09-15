// A small in-process per-IP limiter for the public write routes (registration
// abuse control, WEB-APP-001 §111). The authoritative limits live in the
// Consumer backend; this is defence-in-depth at the BFF edge. The Sandbox runs a
// single app instance, so an in-memory bucket is sufficient here.
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now > b.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (b.count >= max) return false;
  b.count++;
  return true;
}

export function clientIp(req: Request): string {
  const h = req.headers;
  return (
    (h.get('x-forwarded-for') ?? '').split(',')[0].trim() ||
    h.get('x-real-ip') ||
    'unknown'
  );
}
