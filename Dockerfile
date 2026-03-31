FROM oven/bun:1.3.9 AS base

WORKDIR /app

COPY package.json bun.lock tsconfig.json tsconfig.base.json ./
COPY packages ./packages

RUN bun install --frozen-lockfile --production

EXPOSE 3000

USER bun

CMD ["bun", "run", "--filter", "@pkp-sdk/api", "start", "--host", "0.0.0.0", "--port", "3000"]
