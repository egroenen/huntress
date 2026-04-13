FROM node:22-bookworm-slim AS deps

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM deps AS builder

COPY . .
RUN pnpm build

FROM node:22-bookworm-slim AS runner

LABEL org.opencontainers.image.title="huntress"
LABEL org.opencontainers.image.description="Deterministic Arr re-search orchestrator with operator UI"

ENV NODE_ENV="production"
ENV PORT="47892"
ENV HOSTNAME="0.0.0.0"
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/config ./config

RUN mkdir -p /config /data \
  && chown -R node:node /app /config /data

USER node

EXPOSE 47892

VOLUME ["/config", "/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD node -e "fetch(`http://127.0.0.1:${process.env.PORT ?? '47892'}/api/readyz`).then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["./node_modules/.bin/next", "start", "--hostname", "0.0.0.0", "--port", "47892"]
