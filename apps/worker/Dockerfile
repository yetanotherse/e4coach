# Worker image: native Stockfish + the analysis pipeline. Build context = repo root:
#   docker build -f apps/worker/Dockerfile -t chess-coach-worker .
FROM node:22-bookworm-slim

# Native Stockfish + openssl (Prisma) + ca-certificates (HTTPS to Lichess/Gemini).
RUN apt-get update \
  && apt-get install -y --no-install-recommends stockfish openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

# Install dependencies with the lockfile for reproducibility.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages ./packages
COPY apps/worker ./apps/worker
RUN pnpm install --frozen-lockfile

# Generate the Prisma client.
RUN pnpm --filter @chess-coach/db exec prisma generate

# Native engine on Debian/Ubuntu lives here.
ENV ENGINE_KIND=native \
    STOCKFISH_PATH=/usr/games/stockfish \
    GAME_SOURCE=lichess \
    LLM_PROVIDER=gemini \
    ANALYTICS_PROVIDER=posthog \
    MAILER_PROVIDER=resend \
    NODE_ENV=production

# Run the poll loop via tsx (no cross-package build step needed).
CMD ["pnpm", "--filter", "@chess-coach/worker", "exec", "tsx", "src/main.ts"]
