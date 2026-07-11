# Deployment

Two deployables + one database (spec §5, §14.15):

| Piece | Host | Notes |
|---|---|---|
| **Web** (`apps/web`) | Vercel | Next.js 14 app: landing, auth, report, API routes |
| **Worker** (`apps/worker`) | Render / Fly.io / **your own server** | Always-on Node process, native Stockfish, poll loop |
| **Postgres** | Supabase (or Neon) | Prisma schema; run migrations before first deploy |

Everything is behind adapters selected by env, so flip a provider by changing one variable.

---

## 0. Provision external services

- **Supabase** project → copy the pooled `DATABASE_URL` and the direct `DIRECT_URL`.
- **Google AI Studio** → `GEMINI_API_KEY`.
- **Resend** → `RESEND_API_KEY` + verify your sending domain → set `EMAIL_FROM`.
- **PostHog** (cloud) → `POSTHOG_KEY` + `POSTHOG_HOST`.
- Pick a descriptive `LICHESS_USER_AGENT` (e.g. `ChessCoach/1.0 (you@example.com)`).
- Generate `AUTH_SECRET`: `openssl rand -base64 32`.

## 1. Database migration (once, and on schema changes)

```bash
DATABASE_URL=... DIRECT_URL=... pnpm --filter @chess-coach/db exec prisma migrate deploy
```

For the very first migration from the schema, run `prisma migrate dev --name init` locally against the dev DB to create the migration files, commit them, then `migrate deploy` in prod.

## 2. Web → Vercel

- Import the repo; set **Root Directory = `apps/web`**.
- Build command `pnpm build`, install `pnpm install` (Vercel detects pnpm workspaces).
- Env vars: `DATABASE_URL`, `DIRECT_URL`, `APP_URL` (your Vercel URL), `AUTH_SECRET`,
  `LLM_PROVIDER=mock` *(web never calls the LLM; worker does)*, `ANALYTICS_PROVIDER=posthog`,
  `POSTHOG_KEY`, `POSTHOG_HOST`, `MAILER_PROVIDER=resend`, `RESEND_API_KEY`, `EMAIL_FROM`,
  `GAME_SOURCE=lichess`.
- The web tier only enqueues jobs and reads reports — it needs DB + analytics + mailer (for
  magic links), not Stockfish or Gemini.

## 3. Worker → Render (blueprint provided)

`render.yaml` defines the worker service from `apps/worker/Dockerfile` (Debian + `stockfish`
at `/usr/games/stockfish`). Set the secret env vars in the dashboard (they're `sync:false`).

Ubuntu/Debian Stockfish install (what the Docker image does):

```bash
sudo apt-get update && sudo apt-get install -y stockfish   # → /usr/games/stockfish
```

Or Fly.io: `fly launch` with the same Dockerfile; set secrets via `fly secrets set`.

## 3b. Worker → your own Ubuntu server (Docker)

The worker is a **headless poll loop, not a web service**. It opens no port and needs no
inbound URL, domain, or Apache reverse proxy — it connects **directly to Postgres**
(`DATABASE_URL`), claims the oldest `PENDING` job, and processes it. All its network traffic is
*outbound* (Postgres, Lichess, Gemini, Resend, PostHog). `APP_URL` is only used to build report
links inside the "report ready" email, so point it at your **Vercel web URL**, not the server.

So Apache2 stays dedicated to whatever else you host — the worker just needs Docker + outbound
internet. You can run more than one container (or more than one server) safely: the guarded
`updateMany` claim in `poller.ts` stops two workers from grabbing the same job.

### 1. Prerequisites (once per server)

```bash
# Docker Engine (skip if already installed — you said the docker service is running)
sudo apt-get update && sudo apt-get install -y docker.io git
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER"   # log out/in so you can run docker without sudo
```

### 2. Get the code onto the server

```bash
git clone <your-repo-url> chessapp && cd chessapp
# on later deploys: cd chessapp && git pull
```

### 3. Create the env file (CLI, no dashboard needed)

The container reads its config from a `.env` file you pass with `--env-file`. Create it **outside
git** on the server (e.g. `/opt/e4coach/worker.env`) and lock down its permissions — it holds
secrets.

> **Ownership matters:** `--env-file` is read by the **docker CLI as your user** (client-side,
> before the container starts), *not* by the root daemon. So the file must be owned by — and
> readable by — the user who runs `docker run`. Don't leave it `root`-owned (e.g. from `sudo tee`),
> or you'll get `--env-file: permission denied`. Create it as your own user:

> **`--env-file` is not a shell.** Docker takes everything after `=` **literally** — it does
> **not** strip trailing spaces and does **not** support inline `# comments`. So `ENGINE_KIND=native   `
> (trailing spaces) or `DATABASE_URL=... # note` become part of the value and fail validation
> (`Invalid enum value ... received 'native   '`). Keep `#` comments on their **own lines**, put no
> spaces around `=`, and no trailing whitespace. Do **not** quote values unless the quotes are meant
> to be literal (docker keeps the quotes too).

```bash
sudo mkdir -p /opt/e4coach && sudo chown "$(whoami)":"$(whoami)" /opt/e4coach
cat > /opt/e4coach/worker.env <<'EOF'
# --- connection (direct to Postgres; use the pooled URL for the app runtime) ---
DATABASE_URL=postgres://...
DIRECT_URL=postgres://...
# web URL, used only for email report links
APP_URL=https://your-app.vercel.app

# --- providers ---
GAME_SOURCE=lichess
ENGINE_KIND=native
STOCKFISH_PATH=/usr/local/bin/stockfish
LLM_PROVIDER=gemini
LLM_MODEL=gemini-2.5-flash
GEMINI_API_KEY=...
ANALYTICS_PROVIDER=posthog
POSTHOG_KEY=...
POSTHOG_HOST=https://us.i.posthog.com
MAILER_PROVIDER=resend
RESEND_API_KEY=...
EMAIL_FROM=Chess Coach <coach@yourdomain.com>
LICHESS_USER_AGENT=ChessCoach/1.0 (you@example.com)

# --- tuning (optional; these are the render.yaml defaults) ---
MAX_GAMES_PER_JOB=20
ENGINE_MOVETIME_MS=150
WORKER_POLL_INTERVAL_MS=2000
NODE_ENV=production
# --- engine cores (set ENGINE_POOL_SIZE to your CPU-core count) ---
# ENGINE_POOL_SIZE single-threaded engines run in parallel, one per core.
# Keep ENGINE_THREADS=1: it keeps analysis deterministic (same games -> same
# report). Raising ENGINE_THREADS makes Stockfish search non-deterministic.
# Total worker RAM is roughly ENGINE_POOL_SIZE x ENGINE_HASH (MB), so 4 x 256 = ~1 GB.
ENGINE_POOL_SIZE=4
ENGINE_THREADS=1
ENGINE_HASH=256
EOF
chmod 600 /opt/e4coach/worker.env   # owner-only; you own it, so docker can still read it

# Guard against the trailing-space / inline-comment trap above:
sed -i 's/[[:space:]]*$//' /opt/e4coach/worker.env
```

> `ENGINE_KIND`, `STOCKFISH_PATH`, and the provider names are already baked into the Dockerfile,
> but keeping them in the env file makes the container's config explicit and easy to override.

> **Stockfish lives *inside* the container.** The image compiles a modern Stockfish from source
> (statically linked) to `/usr/local/bin/stockfish` — Debian's apt package is old and gives
> different fixed-depth evals. Do **not** point `STOCKFISH_PATH` at a binary on the host
> (e.g. `/usr/local/bin/stockfish` you installed with `make`): the container can't see the host
> filesystem, so you'll get `Error: spawn … ENOENT`. Pick the engine version/arch at **build time**:
>
> ```bash
> # match your local engine version (see it via `stockfish` then type `uci`), and
> # drop to a more portable arch if the CPU lacks AVX2 (else you'll get SIGILL):
> docker build -f apps/worker/Dockerfile \
>   --build-arg STOCKFISH_REF=sf_18 \
>   --build-arg STOCKFISH_ARCH=x86-64-avx2 \
>   -t chess-coach-worker .
> # docker compose: pass the same via `args:` under build (see the compose example below).
> ```

### 4. Build the image (build context = repo root)

```bash
docker build -f apps/worker/Dockerfile -t chess-coach-worker .
```

### 5. Run migrations once (if not already applied from elsewhere)

```bash
docker run --rm --env-file /opt/e4coach/worker.env chess-coach-worker \
  pnpm --filter @chess-coach/db exec prisma migrate deploy
```

### 6. Run the worker as a long-lived, auto-restarting container

```bash
docker run -d \
  --name chess-coach-worker \
  --env-file /opt/e4coach/worker.env \
  --restart unless-stopped \
  chess-coach-worker
```

`--restart unless-stopped` brings it back after crashes and server reboots (works with the
Docker service you already have enabled). Manage it with:

```bash
docker logs -f chess-coach-worker      # follow the FETCHING → … → DONE loop
docker restart chess-coach-worker
docker stop chess-coach-worker && docker rm chess-coach-worker
```

### 7. Redeploying a new version

```bash
cd chessapp && git pull
docker build -f apps/worker/Dockerfile -t chess-coach-worker .
docker stop chess-coach-worker && docker rm chess-coach-worker
docker run -d --name chess-coach-worker --env-file /opt/e4coach/worker.env \
  --restart unless-stopped chess-coach-worker
```

### Optional: docker compose (nicer for edits + boot persistence)

Put this at `/opt/e4coach/docker-compose.yml` so config lives in one file:

```yaml
services:
  worker:
    build:
      context: .                      # run compose from the repo root
      dockerfile: apps/worker/Dockerfile
      args:
        STOCKFISH_REF: sf_18          # engine version — match your local engine
        STOCKFISH_ARCH: x86-64-avx2   # x86-64-sse41-popcnt or x86-64 for older CPUs
    image: chess-coach-worker
    env_file: /opt/e4coach/worker.env
    restart: unless-stopped
```

```bash
docker compose up -d --build     # build + start (from the repo root)
docker compose logs -f
docker compose pull; docker compose up -d --build   # redeploy
```

> After editing `worker.env`, run `docker compose up -d` (or `--build`) to
> recreate the container — `docker compose restart` / `docker restart` reuse the
> old environment and will **not** pick up the new values. `APP_URL` in
> particular must be your public web URL: it's baked into every report email
> link, and a missing value falls back to `http://localhost:3000`. The worker
> logs its `appUrl` at boot and warns if it's still localhost in production.

## 4. Smoke-check production

- Sign up on the landing page with a real Lichess username.
- Watch the worker logs step through `FETCHING → EVALUATING → CLASSIFYING → GENERATING → DONE`.
- Confirm the "report ready" email arrives and the report renders with real positions.
- Verify funnel events land in PostHog (`landing_view`, `signup_completed`, `job_completed`,
  `report_viewed`, `interest_clicked`).

## Local end-to-end (mocks, no external keys)

```bash
cp .env.example .env            # defaults are all `mock` except set DATABASE_URL
pnpm db:generate && pnpm --filter @chess-coach/db exec prisma migrate deploy
pnpm web:dev        # terminal 1
pnpm worker:dev     # terminal 2
```

Sign up with username `mockuser` (canned games), or `unknownuser` / `nogamesuser` to exercise
the error paths. To run the real engine locally set `ENGINE_KIND=native GAME_SOURCE=lichess`
and `STOCKFISH_PATH` (e.g. `/opt/homebrew/bin/stockfish` on macOS).

## e2e funnel test

With the stack running (mock providers) and a test Postgres:

```bash
pnpm --filter @chess-coach/e2e run install-browsers
BASE_URL=http://localhost:3000 pnpm --filter @chess-coach/e2e test
```
