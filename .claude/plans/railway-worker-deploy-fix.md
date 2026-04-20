# Railway Worker Deploy — Consolidated Fix

## Context

The Railway worker deploy has been failing across several attempts. Each failure got patched individually, and we're now at a point where it builds successfully but crashes at runtime with `supabaseUrl is required`. Before adding another patch, this plan steps back and reconciles three distinct issues that have been tangled together.

The goal is a worker deploy that is:
- **Explicit** — the deploy artifact is described in code, not in a Railway UI setting
- **Fast** — the worker container doesn't carry Next.js build output it never uses
- **Portable** — could move to Fly / Render / k8s later without rework
- **Honest** — runs in `NODE_ENV=production` without relying on dev-only tooling

## Diagnosis — three separate issues

### 1. Runtime crash: env var naming mismatch (THE ACTUAL CURRENT BUG)
`worker/lib/supabase.ts:7` reads `process.env.SUPABASE_URL`. The user added `NEXT_PUBLIC_SUPABASE_URL` on Railway (copying Vercel's naming). The `NEXT_PUBLIC_` prefix is a Next.js concept for client-exposure — it has no meaning in a standalone Node process. The worker simply doesn't see the variable.

**Fix**: rename the Railway env var from `NEXT_PUBLIC_SUPABASE_URL` to `SUPABASE_URL`. No code change — the current worker code is correct.

### 2. Builder choice: Railpack vs Dockerfile
Railpack 0.23 now supports npm workspaces natively (confirmed in latest log: `Found workspace with 2 packages`). But Railpack's default flow runs `npm run build` at repo root, which triggers `next build` inside the worker container — producing ~80MB of `.next/` output the worker never reads. It's wasteful and couples worker deploy time to Next.js build time.

Commit `c21a976` already landed a Dockerfile that installs only what the worker needs. It is not being used — Railway's Builder setting is still "Railpack".

**Fix**: flip Railway's Builder setting to "Dockerfile". The Dockerfile already exists and is correct in structure; one cleanup needed (issue #3).

### 3. Cleanup: `tsx` as devDependency requires `NODE_ENV=development` hack
The Dockerfile currently has `ENV NODE_ENV=development` so `npm ci` won't prune devDependencies. This is because `tsx` lives under `devDependencies` in `worker/package.json`. But `tsx` is genuinely a runtime dependency of this worker — removing it breaks startup.

**Fix**: move `tsx` from `devDependencies` to `dependencies` in `worker/package.json`, then drop the `NODE_ENV=development` line from the Dockerfile. TypeScript stays in devDependencies (tsx bundles its own esbuild; typescript is only used for `npm run typecheck` during development).

## Files to modify

| File | Change |
|---|---|
| `worker/package.json` | Move `tsx` from `devDependencies` to `dependencies` |
| `Dockerfile` | Remove `ENV NODE_ENV=development` line |

No source code changes. No Next.js config changes.

## Railway settings to change (manual, in the UI)

| Setting | From | To |
|---|---|---|
| Builder | Railpack | Dockerfile |
| Custom Build Command | (whatever) | blank (Dockerfile owns build) |
| Custom Start Command | (whatever) | blank (Dockerfile `CMD` owns start) |
| Pre-deploy Command | (whatever) | blank |
| Root Directory | `/` | `/` (unchanged) |
| Env var `NEXT_PUBLIC_SUPABASE_URL` | delete this key | — |
| Env var `SUPABASE_URL` | — | add, same value as Vercel's `NEXT_PUBLIC_SUPABASE_URL` |
| Env var `SUPABASE_SERVICE_ROLE_KEY` | (already set) | (unchanged) |
| Env var `ANTHROPIC_API_KEY` | (already set) | (unchanged) |

Worker does **not** need `NEXT_PUBLIC_SUPABASE_ANON_KEY` (uses service role) or `OPENAI_API_KEY` (embeddings not wired).

## What's intentionally NOT in this plan

- **Precompile TS → JS with `tsc` + run `node dist/index.js`**: the "most production-grade" answer, but over-engineered for pilot phase. `tsx` at runtime is fast enough and keeps the edit loop tight. Revisit when the worker needs tighter cold-start or container size.
- **Multi-stage Dockerfile**: would save ~50MB by dropping build tooling after install. Trivial optimization, defer until the image is actually a problem.
- **`railway.json` to pin Builder in code**: Railway supports this but it's another config file. A single UI setting change is fine for a single-service project; reconsider if we add more Railway services.
- **`SUPABASE_URL` fallback to `NEXT_PUBLIC_SUPABASE_URL` in worker**: would hide the naming distinction. The worker is a server process — it should use the server-side name. Being explicit is worth the one-time correction.

## Verification

After pushing + Railway settings + redeploy:

1. **Build log** shows Docker stages (`=> [1/6] FROM node:22-alpine`, etc.), NOT Railpack plan output.
2. **Build time** should drop to ~60s (from ~105s) since we skip `next build`.
3. **Deploy log** shows in order:
   ```
   [job-runner] Registered processor for job_type: parse_materials
   [job-runner] Registered processor for job_type: propose_plan
   [job-runner] Registered processor for job_type: generate_lab
   [job-runner] Registered processor for job_type: evaluate_review
   [worker] Starting poll loop...
   ```
4. **Process stays alive** — no restart loop, no crash.
5. **End-to-end smoke**: from Supabase SQL editor, `UPDATE generation_jobs SET status='pending' WHERE id=...` on a known-good row, or upload a material from the app. Within 5s worker log shows `[job-runner] Claimed job <id>`.

## Why this is the long-term-correct answer

- **One source of truth for the deploy artifact**: the Dockerfile. Not split between Railpack defaults + Railway UI settings + repo layout.
- **Env var naming matches the consumer**: Next.js uses `NEXT_PUBLIC_*`, Node uses plain names. Each service sets only what it actually reads.
- **No NODE_ENV trickery**: `tsx` sits where it's actually used (runtime deps). The container builds in production mode honestly.
- **The image contains only what the worker needs**: no Next.js build artifacts, no app source under `src/`.
- **Portable**: the Dockerfile runs locally with `docker build . && docker run --env-file .env.local`. If Railway ever disappoints, we lift the same artifact to Fly/Render/k8s without code changes.
