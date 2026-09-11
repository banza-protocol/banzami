// The environment this pay server belongs to — its own configuration, never a
// request parameter.
//
// The consumer pay-request route read `?sandbox=1` to choose both the backend
// and the label on the answer (A2-28), so any URL could relabel a request. The
// environment is what the deployment says: PAY_ENVIRONMENT when it is set, or
// else the gateway the server is built against (sandbox-api.banzami.com is the
// Sandbox, api.banzami.com is Live). Anything else is unknown, and an unknown
// environment is refused rather than guessed.

export type ServerEnvironment = 'LIVE' | 'SANDBOX';

export function environmentFrom(explicit: string | undefined, gatewayUrl: string | undefined): ServerEnvironment | null {
  const e = (explicit ?? '').trim().toUpperCase();
  if (e === 'LIVE' || e === 'SANDBOX') return e;
  // A value that is set but not an environment is a misconfiguration, not a
  // cue to fall through to a guess.
  if (e !== '') return null;
  let host = '';
  try {
    host = new URL(gatewayUrl ?? '').hostname.toLowerCase();
  } catch {
    return null;
  }
  if (host === 'sandbox-api.banzami.com') return 'SANDBOX';
  if (host === 'api.banzami.com') return 'LIVE';
  return null;
}

/** Read at call time: PAY_ENVIRONMENT is runtime configuration. */
export function serverEnvironment(): ServerEnvironment | null {
  return environmentFrom(process.env.PAY_ENVIRONMENT, process.env.NEXT_PUBLIC_GATEWAY_URL);
}
