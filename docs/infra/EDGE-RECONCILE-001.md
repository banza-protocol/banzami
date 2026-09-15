# EDGE-RECONCILE-001 — reconcile the committed sandbox edge with the deployed edge

Status: OPEN (bounded follow-up) · Opened 2026-09-15 (WEB-APP-001 §9/§65).

## The remainder (stated plainly, not hidden)

`app.banzami.com` is public and durable, but its edge server block is currently a
**hand-added `conf.d/zz-app-banzami.conf`** inside the running
`bzsbedge-sandbox-edge` container (pointing at the canonical
`<project>-app-frontend:3007`), **not** the generated render.

The reason is a **pre-existing drift**: the deployed sandbox edge serves
`admin.banzami.com` via `SB_ADMIN_API`/`SB_ADMIN_APP` (added server-side with
Stage D) that the committed `infra/docker/docker-compose.sandbox-edge.yml` and
`infra/nginx/sandbox-edge.conf.template` do **not** yet declare. Re-rendering the
edge purely from the repo today would therefore **drop admin**. So the additive
block is the safe interim, and re-rendering must not be done casually
(WEB-APP-001 §9/§65).

Honest counter state:
- `APP_WEB_EDGE_ROUTE_SURVIVES_CANONICAL_DEPLOY = PASS` — a canonical
  `./deploy.sh app-frontend` recreates only the `app-frontend` container and
  never the edge, so the route is preserved (proven across two redeploys +
  a rollback; `pay`/`sandbox-api`/`developers`/`admin` all stayed 200).
- `APP_WEB_PARALLEL_DEPLOYMENT_TRUTHS ≠ 0` — the edge block is a second,
  container-local truth. This is **not** claimed as 0 until this milestone
  closes. `tools/check-app-web-route.mjs` detects loss of the public route.
- What a full edge **recreate** (`docker compose -p bzsbedge up`, not part of a
  normal deploy) would drop the additive block — hence this milestone.

## Goal

Make the repository edge configuration faithfully represent **every** currently
deployed canonical host — `banzami.com`/`www`, `developers`, `admin`, `pay`,
`sandbox-api`, `developer-api`, `sandbox-webhook`, `checkout`, and `app` — with
the matching `SB_*` env, so a repo-driven edge redeploy reproduces the live edge
exactly, and the additive `app` block can be removed.

## Method (safe, host-by-host — do NOT rush)

1. **Read-only inventory** — dump the deployed rendered config
   (`docker exec bzsbedge-sandbox-edge cat /etc/nginx/conf.d/sandbox-edge.conf`)
   and the deployed env (`docker inspect … SB_*`), plus the deployed template
   under `/srv/banzami/sandbox-edge/templates`.
2. **Config diff** — diff the deployed template against the committed
   `infra/nginx/sandbox-edge.conf.template`; list every host block and `SB_*`
   variable present in one and not the other (admin is the known gap; confirm
   there are no others).
3. **Host-by-host expected-status matrix** — for each host, the expected public
   status (200 / 404-at-root / 503) before and after, so a regression is visible.
4. **Render + `nginx -t`** in a throwaway `nginx:1.27-alpine` with all `SB_*`
   set, against the real cert paths, BEFORE touching the live edge.
5. **Safe rollout** — update the committed compose/template + the server `.env`
   (add `SB_APP` and any missing `SB_ADMIN_*`), recreate the edge in a window,
   verify the whole matrix, then remove `zz-app-banzami.conf`.
6. **Rollback** — keep the previous template + `.env`; on any matrix regression,
   restore and recreate.

## Exit

- Repo edge config == deployed edge config for all hosts.
- `app.banzami.com` served from the generated render (`SB_APP`), additive block
  removed.
- `APP_WEB_EDGE_CONFIG_GENERATED = PASS`, `APP_WEB_PARALLEL_DEPLOYMENT_TRUTHS = 0`.
