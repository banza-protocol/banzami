# Banzami official website (apps/website) — Next.js standalone.
# Serves both banzami.com (marketing) and developers.banzami.com (the Developer
# Console), which is why it does reach the public Gateway: Platform Mode and the
# /r/{ref} proof lookup. It never touches core/api or the payment services.

# ─── Stage 1: Build ───────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# The Gateway stack the browser is pointed at. NEXT_PUBLIC_* is compiled into
# the client bundle, so this is a build input, not a runtime one.
#
# It defaults to the SANDBOX rail deliberately. The application default in
# lib/api.ts is api.banzami.com, and while the platform is SANDBOX that rail is
# fail-closed — it answers 503 with an HTML page, so every Console page load
# failed its platform-mode call in the browser. Nothing broke, because
# getPlatformMode treats any failure as SANDBOX, but the site was asking a door
# it knows is shut.
#
# AT LIVE LAUNCH: this becomes https://api.banzami.com. It is a build argument
# rather than a source default so that flipping it is a deploy decision with one
# obvious place to change, not an edit inside lib/api.ts.
ARG NEXT_PUBLIC_BANZAMI_API_URL=https://sandbox-api.banzami.com
ENV NEXT_PUBLIC_BANZAMI_API_URL=$NEXT_PUBLIC_BANZAMI_API_URL

ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ─── Stage 2: Runtime ─────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup -S banzami && adduser -S banzami -G banzami

# Next.js standalone output: a self-contained server.js + minimal node_modules.
COPY --from=builder --chown=banzami:banzami /app/.next/standalone ./
COPY --from=builder --chown=banzami:banzami /app/.next/static ./.next/static
COPY --from=builder --chown=banzami:banzami /app/public ./public

USER banzami

EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
    CMD wget -qO- http://127.0.0.1:3000/ || exit 1

CMD ["node", "server.js"]
