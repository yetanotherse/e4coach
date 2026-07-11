# Worker image: native Stockfish + the analysis pipeline. Build context = repo root:
#   docker build -f apps/worker/Dockerfile -t chess-coach-worker .
#
# Stockfish is compiled from a pinned source tag (statically linked) rather than
# installed from apt — Debian ships an old version (bookworm = SF 15/16) whose
# fixed-depth evals differ from a modern engine. Static linking keeps the binary
# self-contained so it runs regardless of the base image's (or host's) glibc.
#   Match your local engine for identical evals:
#     docker build --build-arg STOCKFISH_REF=sf_18 ...
#   Older CPU without AVX2? Use a more portable arch:
#     docker build --build-arg STOCKFISH_ARCH=x86-64-sse41-popcnt ...   (or x86-64)

# ---- Stage 1: compile Stockfish ----
FROM debian:bookworm-slim AS stockfish
ARG STOCKFISH_REF=sf_18
ARG STOCKFISH_ARCH=x86-64-avx2
RUN apt-get update \
  && apt-get install -y --no-install-recommends git build-essential ca-certificates curl wget \
  && rm -rf /var/lib/apt/lists/*
RUN git clone --depth 1 --branch "${STOCKFISH_REF}" https://github.com/official-stockfish/Stockfish.git /sf
# `make build` downloads the embedded NNUE net (needs network) then compiles.
# PGO (profile-build) is intentionally avoided: it runs the binary during build
# (illegal-instruction risk on arch mismatch) and does not change eval output.
RUN cd /sf/src \
  && make -j"$(nproc)" build ARCH="${STOCKFISH_ARCH}" EXTRALDFLAGS='-static' \
  && strip stockfish \
  && mv stockfish /usr/local/bin/stockfish

# ---- Stage 2: worker runtime ----
FROM node:22-bookworm-slim

# openssl (Prisma) + ca-certificates (HTTPS to Lichess/Gemini). Stockfish now
# comes from the build stage, not apt.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY --from=stockfish /usr/local/bin/stockfish /usr/local/bin/stockfish

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

# Native engine baked in at /usr/local/bin/stockfish (see build stage).
ENV ENGINE_KIND=native \
    STOCKFISH_PATH=/usr/local/bin/stockfish \
    GAME_SOURCE=lichess \
    LLM_PROVIDER=gemini \
    ANALYTICS_PROVIDER=posthog \
    MAILER_PROVIDER=resend \
    NODE_ENV=production

# Run the poll loop via tsx (no cross-package build step needed).
CMD ["pnpm", "--filter", "@chess-coach/worker", "exec", "tsx", "src/main.ts"]
