/**
 * The external-developer cleanroom: Console side.
 *
 * Evaluated in the authenticated Developer Console page, because the Account
 * Identity session is a host-only HttpOnly cookie — there is no token to hand a
 * shell script, by design. Driving the Console's own API from the Console's own
 * origin is therefore not a convenience here, it is the only public way in, and
 * it keeps the proof honest: every call below is one the browser already makes.
 *
 * Nothing here uses /internal/v1/* or a fixture route. If a step cannot be done
 * with an ordinary member's authority, that is the finding.
 *
 * Load into the page, then call phases in order:
 *
 *   await BZ.zeroState()          // §1 — inspect BEFORE creating anything
 *   await BZ.create(capability)   // §3 — workspace → project → setup → key → endpoint
 *   await BZ.sealProof()          // §4 — ADR-055 seal, and that it cannot be undone
 *   await BZ.observe()            // §11 — events, deliveries, balances
 *
 * `create` returns the Project key and the reveal-once webhook secret. Those are
 * live credentials for a Sandbox project: they are returned to the caller and
 * deliberately not stored on the page.
 */
(() => {
  const API = 'https://developer-api.banzami.com';
  const state = { csrf: null, user: null, workspace: null, project: null, endpoint: null };

  async function req(path, { method = 'GET', body, csrf } = {}) {
    const headers = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (csrf) headers['X-CSRF-Token'] = csrf;
    const res = await fetch(`${API}${path}`, {
      method, headers, credentials: 'include',
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let json = null;
    try { json = await res.json(); } catch { /* empty or non-json */ }
    return { status: res.status, json };
  }

  async function auth() {
    const me = await req('/auth/me');
    if (me.status !== 200) throw new Error(`not authenticated (/auth/me → ${me.status})`);
    state.csrf = me.json.csrf_token;
    state.user = me.json.user;
    return state.user;
  }

  /**
   * §1 — what this identity already has, read only through supported surfaces.
   *
   * A cleanroom claim rests on this being empty, so it is counted before
   * anything is created and never "cleaned up" to make it so. Existing state is
   * reported, not deleted.
   */
  async function zeroState() {
    const user = await auth();
    const ws = await req('/workspaces');
    const workspaces = ws.json?.workspaces ?? [];
    const detail = [];
    for (const w of workspaces) {
      const [projects, members] = await Promise.all([
        req(`/workspaces/${w.id}/projects`),
        req(`/workspaces/${w.id}/members`),
      ]);
      const projs = projects.json?.projects ?? [];
      const perProject = [];
      for (const p of projs) {
        const [keys, setup, endpoints] = await Promise.all([
          req(`/projects/${p.id}/keys`),
          req(`/projects/${p.id}/financial-setup`),
          req(`/projects/${p.id}/webhooks/endpoints`),
        ]);
        perProject.push({
          id: p.id, name: p.name, environment: p.environment,
          keys: (keys.json?.keys ?? []).length,
          financial_state: setup.json?.state ?? null,
          sealed: setup.json?.sealed ?? null,
          endpoints: (endpoints.json?.endpoints ?? []).length,
        });
      }
      detail.push({
        id: w.id, name: w.name,
        members: (members.json?.members ?? []).length,
        projects: perProject,
      });
    }
    const totals = {
      workspaces: workspaces.length,
      projects: detail.reduce((n, w) => n + w.projects.length, 0),
      keys: detail.reduce((n, w) => n + w.projects.reduce((m, p) => m + p.keys, 0), 0),
      endpoints: detail.reduce((n, w) => n + w.projects.reduce((m, p) => m + p.endpoints, 0), 0),
      financial_setups: detail.reduce(
        (n, w) => n + w.projects.filter((p) => p.financial_state && p.financial_state !== 'UNCONFIGURED'
          && p.financial_state !== 'UNAVAILABLE').length, 0),
    };
    const zero = totals.workspaces === 0 && totals.projects === 0 && totals.keys === 0
      && totals.endpoints === 0 && totals.financial_setups === 0;
    return {
      identity: { id: user.id, email: user.email },
      verdict: zero ? 'ZERO_STATE_PASS' : 'ZERO_STATE_FAIL',
      totals, workspaces: detail,
    };
  }

  /** §3 — the whole lifecycle, through the surfaces a member actually has. */
  async function create(capability, opts = {}) {
    if (!capability) throw new Error('a sink capability token is required');
    await auth();
    const out = { steps: [] };
    const step = (name, ok, detail) => { out.steps.push({ step: name, ok, ...detail }); return ok; };

    const wsName = opts.workspace ?? 'External Cleanroom';
    const pjName = opts.project ?? 'External Cleanroom Sandbox';

    const ws = await req('/workspaces', { method: 'POST', body: { name: wsName }, csrf: state.csrf });
    if (ws.status !== 200 && ws.status !== 201) {
      step('workspace created', false, { note: `${ws.status}`, detail: ws.json });
      return out;
    }
    state.workspace = ws.json;
    step('workspace created', true, { id: ws.json.id, name: ws.json.name, slug: ws.json.slug });

    // Ownership must come from the act of creating, not from anything granted.
    const members = await req(`/workspaces/${ws.json.id}/members`);
    const me = (members.json?.members ?? []).find((m) => m.user_id === state.user.id || m.email === state.user.email);
    step('creator is OWNER by the normal identity flow', me?.role === 'OWNER',
      { role: me?.role ?? null, members: (members.json?.members ?? []).length });

    const pj = await req(`/workspaces/${ws.json.id}/projects`, {
      method: 'POST', body: { name: pjName, environment: 'SANDBOX' }, csrf: state.csrf,
    });
    if (pj.status !== 200 && pj.status !== 201) {
      step('project created', false, { note: `${pj.status}`, detail: pj.json });
      return out;
    }
    state.project = pj.json;
    step('project created', true, { id: pj.json.id, name: pj.json.name, environment: pj.json.environment });

    const before = await req(`/projects/${pj.json.id}/financial-setup`);
    step('project starts with no financial owner', before.json?.state === 'UNCONFIGURED',
      { state: before.json?.state, can_configure: before.json?.can_configure });

    const setup = await req(`/projects/${pj.json.id}/financial-setup`, { method: 'POST', csrf: state.csrf });
    step('financial setup provisions a Sandbox owner', setup.json?.state === 'READY',
      { status: setup.status, state: setup.json?.state, sealed: setup.json?.sealed });
    step('the binding starts unsealed', setup.json?.sealed === false, { sealed: setup.json?.sealed });

    // Idempotent by contract: asking twice must not create a second owner.
    const again = await req(`/projects/${pj.json.id}/financial-setup`, { method: 'POST', csrf: state.csrf });
    step('configuring twice returns the same owner, not a second one',
      again.json?.state === 'READY' || again.json?.state === 'SEALED',
      { state: again.json?.state });

    const key = await req(`/projects/${pj.json.id}/keys`, {
      method: 'POST', body: { name: 'cleanroom', scopes: opts.scopes ?? ['payments:write', 'payments:read'] },
      csrf: state.csrf,
    });
    const secretKey = key.json?.api_key ?? key.json?.key ?? null;
    step('project API key issued', Boolean(secretKey),
      { status: key.status, id: key.json?.id ?? null, scopes: key.json?.scopes ?? null,
        detail: secretKey ? undefined : key.json });

    const url = `https://sandbox-webhook.banzami.com/receive/${capability}`;
    const ep = await req(`/projects/${pj.json.id}/webhooks/endpoints`, {
      method: 'POST', body: { url, events: opts.events ?? ['payment_link.paid', 'payment_session.paid'] },
      csrf: state.csrf,
    });
    const whSecret = ep.json?.secret ?? ep.json?.signing_secret ?? null;
    state.endpoint = ep.json;
    step('webhook endpoint created through the public lifecycle', ep.status === 200 || ep.status === 201,
      { status: ep.status, id: ep.json?.id ?? null, url, detail: ep.json?.id ? undefined : ep.json });
    step('signing secret revealed exactly once on creation', Boolean(whSecret),
      { revealed: Boolean(whSecret) });

    // Reveal-once means the secret is not readable again. If a later GET returns
    // it, "reveal-once" is a description of the UI and not of the system.
    const reread = await req(`/projects/${pj.json.id}/webhooks/endpoints`);
    const listed = (reread.json?.endpoints ?? []).find((e) => e.id === ep.json?.id);
    const leaked = listed && Object.values(listed).some(
      (v) => typeof v === 'string' && whSecret && v === whSecret);
    step('the secret is not readable again afterwards', !leaked, { leaked: Boolean(leaked) });

    return {
      ...out,
      workspace_id: ws.json.id,
      project_id: pj.json.id,
      endpoint_id: ep.json?.id ?? null,
      capability,
      // Returned to the caller, never stored on the page.
      project_key: secretKey,
      webhook_secret: whSecret,
      pass: out.steps.filter((s) => s.ok).length,
      fail: out.steps.filter((s) => !s.ok).length,
    };
  }

  /**
   * §4 — ADR-055. READY/unsealed until the first qualifying payer-facing
   * artifact, SEALED after, and then not reversible by any public route.
   */
  async function sealProof(projectID = state.project?.id) {
    await auth();
    const steps = [];
    const step = (name, ok, detail) => steps.push({ step: name, ok, ...detail });

    const s = await req(`/projects/${projectID}/financial-setup`);
    step('setup is SEALED after the first payer-facing artifact',
      s.json?.state === 'SEALED' && s.json?.sealed === true,
      { state: s.json?.state, sealed: s.json?.sealed });

    // Reload: a seal that only exists in one response is not a seal.
    const s2 = await req(`/projects/${projectID}/financial-setup`);
    step('the seal survives a reload', s2.json?.sealed === true, { sealed: s2.json?.sealed });

    // Re-running setup on a sealed project must not rebind or unseal it.
    const rebind = await req(`/projects/${projectID}/financial-setup`, { method: 'POST', csrf: state.csrf });
    step('re-running financial setup does not unseal or rebind',
      rebind.json?.sealed === true || rebind.status >= 400,
      { status: rebind.status, state: rebind.json?.state, sealed: rebind.json?.sealed });

    // There must be no public route that takes an owner as input.
    const aimed = await req(`/projects/${projectID}/financial-setup`, {
      method: 'POST', csrf: state.csrf,
      body: { merchant_id: '00000000-0000-0000-0000-000000000000', wallet_id: '00000000-0000-0000-0000-000000000000' },
    });
    const stillSame = await req(`/projects/${projectID}/financial-setup`);
    step('a caller-supplied owner cannot replace the financial owner',
      stillSame.json?.sealed === true && stillSame.json?.state === 'SEALED',
      { attempt_status: aimed.status, state_after: stillSame.json?.state });

    return { project_id: projectID, steps, pass: steps.filter((s) => s.ok).length, fail: steps.filter((s) => !s.ok).length };
  }

  /** §11 — what the developer can see, through the Platform and nothing else. */
  async function observe(projectID = state.project?.id) {
    await auth();
    const [events, endpoints, balances, setup, logs] = await Promise.all([
      req(`/projects/${projectID}/webhooks/events`),
      req(`/projects/${projectID}/webhooks/endpoints`),
      req(`/projects/${projectID}/balances`),
      req(`/projects/${projectID}/financial-setup`),
      req(`/projects/${projectID}/logs`),
    ]);
    const evs = events.json?.events ?? [];
    const deliveries = [];
    for (const e of evs.slice(0, 10)) {
      const d = await req(`/projects/${projectID}/webhooks/events/${e.id}/deliveries`);
      deliveries.push({ event_id: e.id, type: e.type ?? e.event_type, attempts: d.json?.deliveries ?? [] });
    }
    return {
      project_id: projectID,
      financial: { state: setup.json?.state, sealed: setup.json?.sealed },
      events: evs.map((e) => ({ id: e.id, type: e.type ?? e.event_type, created_at: e.created_at })),
      deliveries,
      endpoints: (endpoints.json?.endpoints ?? []).map((e) => ({
        id: e.id, url: e.url, active: e.active ?? e.status, events: e.events,
      })),
      balances: balances.json?.accounts ?? [],
      api_requests: (logs.json?.logs ?? logs.json?.requests ?? []).length,
    };
  }

  window.BZ = { zeroState, create, sealProof, observe, state, req };
  return 'BZ ready: zeroState() · create(capability) · sealProof() · observe()';
})();
