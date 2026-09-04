# Sandbox webhook sink — assurance infrastructure.
#
# No database, no Redis, no production network, no secrets, no Docker socket and
# no host mounts. It records bounded test data in memory and nothing else, so
# there is nothing here worth reaching for.
FROM node:20-alpine
WORKDIR /app
COPY sink.mjs .
USER node
EXPOSE 8090
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
    CMD wget -qO- http://127.0.0.1:8090/healthz || exit 1
CMD ["node", "sink.mjs"]
