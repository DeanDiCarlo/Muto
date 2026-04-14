# Muto — Project Context for Claude Code

## What Is This Project

Muto is an EdTech SaaS platform that transforms professors' existing course materials (syllabi, textbooks, papers) into interactive labs with AI-powered Knowledge Reviews. Students engage with labs and complete concept-tagged assessments; the system builds a concept-level knowledge graph that shows professors exactly where students are struggling, delivered as insight reports timed to their class schedule.

**Primary user:** Professors (they create, students follow)
**Launch scope:** Quantum computing courses at Miami University, pipeline is subject-agnostic
**Domain:** trymuto.com

## Architecture

- **Framework:** Next.js 14+ with App Router (server components, route handlers, server actions)
- **Language:** TypeScript (strict mode)
- **Styling:** Tailwind CSS + shadcn/ui
- **Database:** Supabase (PostgreSQL + pgvector + Row Level Security)
- **Auth:** Institutional SSO via Supabase Auth (Miami University pilot uses Duo-backed SAML)
- **Generation Pipeline:** Render (structured LLM pipeline for lab generation)
- **Hosting:** TBD (likely Vercel for Next.js)

## Repo Structure

```
/
├── CLAUDE.md                    # This file (project memory)
├── README.md                    # Northstar thesis document
├── SCHEMA.md                    # Complete data model reference
├── .claude/
│   ├── settings.json            # Shared project settings (version controlled)
│   ├── settings.local.json      # Personal settings (gitignored)
│   └── commands/                # Custom slash commands
│       ├── plan.md              # Architecture planning mode
│       ├── implement.md         # Implementation mode
│       ├── review.md            # Code review mode
│       ├── schema-check.md      # Validate against SCHEMA.md
│       └── generate-migration.md # Create Supabase migration
├── src/
│   ├── app/                     # Next.js App Router pages and layouts
│   │   ├── (auth)/              # Auth routes (login, SSO callback)
│   │   ├── (dashboard)/         # Protected routes
│   │   │   ├── professor/       # Professor dashboard, course management
│   │   │   └── student/         # Student lab view, knowledge review, chatbot
│   │   └── api/                 # Route handlers (generation pipeline, webhooks)
│   ├── components/              # React components
│   │   ├── ui/                  # shadcn/ui components
│   │   └── ...                  # Feature-specific components
│   ├── lib/                     # Shared utilities
│   │   ├── supabase/            # Supabase client setup (server + client)
│   │   ├── actions/             # Server Actions (mutations)
│   │   ├── rate-limit.ts        # Rate limit checking utility
│   │   └── utils/               # Helpers
│   └── types/                   # TypeScript type definitions (mirrors SCHEMA.md)
├── worker/                      # Railway worker (generation pipeline)
│   ├── index.ts                 # Job polling loop
│   ├── processors/              # Job type handlers
│   │   ├── parse-materials.ts   # PDF/doc parsing → content_blocks
│   │   ├── propose-plan.ts      # Materials → generation_plan
│   │   ├── generate-lab.ts      # Plan → lab content + concepts + questions
│   │   └── generate-embeddings.ts # Content blocks → vector embeddings
│   └── lib/
│       ├── cost-tracker.ts      # Writes to api_usage_log after each LLM call
│       └── job-runner.ts        # Poll, claim, process, update pattern
├── supabase/
│   ├── migrations/              # SQL migration files
│   ├── seed.sql                 # Dev seed data (includes default rate_limits)
│   └── config.toml              # Supabase local config
└── public/                      # Static assets
```

## Data Access Patterns

- **Reads:** Use Supabase JS client directly in server components via `@supabase/ssr`. RLS enforces access control.
- **Mutations:** Use Next.js Server Actions in `src/lib/actions/`. Server Actions orchestrate multi-step Supabase calls and handle validation.
- **Chatbot RAG:** Vector similarity search via pgvector on `content_embeddings`, scoped to `lab_id`.

## Generation Pipeline Architecture

The generation pipeline uses a **Map → Review → Generate** three-phase flow:

1. **Map**: Professor uploads materials. A `parse_materials` job extracts content blocks. A `propose_plan` job analyzes the parsed content and proposes a generation plan (modules, labs, concepts, estimated costs).
2. **Review**: Professor sees the proposed plan in the UI. They can add/remove/reorder modules and labs, edit concept lists, add notes for the generator, and see estimated costs. Professor approves when satisfied.
3. **Generate**: On approval, the system creates individual `generate_lab` jobs for each lab in the plan. Jobs execute on the Railway worker, which updates `progress_percent` and `current_step` in real-time. The frontend subscribes via Supabase Realtime.

**Execution**: Railway worker (`worker/`) polls `generation_jobs` table for `status = 'pending'`, processes jobs, writes results back to Supabase.

**Cost tracking**: Every LLM API call writes to `api_usage_log` with token counts and calculated cost. Rate limits are checked before each call via `src/lib/rate-limit.ts`.

**Rate limiting strategy**:
- Student usage (chatbot, review evaluation): hard `block` limits. 50 chatbot messages/hour, 300/day.
- Generation usage: soft `alert` limits. You get notified at $50/day or $500/month but jobs still run. Manual intervention for the pilot phase.

## Key Domain Concepts

- **Course vs Course Instance:** Course is the reusable definition (modules, labs). Course Instance is a semester offering (enrollments, student data, join code).
- **Knowledge Review vs Chatbot:** Knowledge Review = structured, concept-tagged measurement instrument (primary signal). Chatbot = freeform learning tool (secondary signal). These are separate systems.
- **Concept Evaluations:** The core data atom. Each row = one student answer evaluated against one concept at one Bloom's level, with mastery score + confidence + reasoning.
- **Insight Deadlines:** Professor-defined timestamps (usually class meeting days) that trigger compiled metrics reports. Not due dates — snapshot triggers.
- **Bloom's Taxonomy:** Labs and review questions are structured by cognitive level (remember → understand → apply → analyze → evaluate → create). This is structural, not decorative.

## Coding Conventions

- All components use TypeScript with strict mode
- Server components are the default; use `'use client'` only when needed for interactivity
- File naming: kebab-case for files, PascalCase for components
- Server Actions go in `src/lib/actions/[domain].ts` (e.g., `courses.ts`, `labs.ts`, `reviews.ts`)
- Database types are generated from Supabase and live in `src/types/database.ts`
- Custom domain types (not auto-generated) live in `src/types/[domain].ts`
- Always validate inputs with Zod schemas before Server Actions hit the database
- Supabase migrations are numbered sequentially: `001_initial_schema.sql`, `002_add_indexes.sql`, etc.

## Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=        # Server-only, never expose to client
ANTHROPIC_API_KEY=                # For generation pipeline and chatbot
OPENAI_API_KEY=                   # For embedding generation (text-embedding-3-small)
```

## Git Conventions

- Main branch: `main`
- Feature branches: `feat/[short-description]`
- Bug fixes: `fix/[short-description]`
- Commit messages: conventional commits (`feat:`, `fix:`, `chore:`, `docs:`)
- Owen works on separate feature branches and submits PRs

## What NOT To Do

- Never expose `SUPABASE_SERVICE_ROLE_KEY` in client components
- Never bypass RLS — if a query needs elevated access, use the service role client in a Server Action, not by disabling RLS
- Never store raw API keys or secrets in code — use environment variables
- Never use Pages Router patterns — this is an App Router project
- Never create components with required props that don't have defaults unless the component is always used with explicit props
- Never put business logic in components — keep it in Server Actions or lib utilities

## Agent Workflow

This project uses an Opus-plans-Sonnet-executes workflow via Claude Code CLI.

### Commands

| Command | Model | Purpose |
|---|---|---|
| `/sprint [feature]` | Opus | Break a feature into verified subtasks with dependency graph |
| `/plan [feature]` | Opus | Architecture plan for a single feature (use `/sprint` for multi-task work) |
| `/implement [plan-or-task-id]` | Sonnet | Execute a plan or sprint task |
| `/verify [task-id]` | Sonnet | Run verification tests and check acceptance criteria |
| `/review [file]` | Either | Code review against project standards |
| `/schema-check` | Sonnet | Validate code against SCHEMA.md |
| `/generate-migration` | Sonnet | Create Supabase SQL migration from SCHEMA.md |
| `/vertical-slice [feature]` | Sonnet | Build one thin feature end-to-end |

### Sprint Structure

Sprints live in `.claude/sprints/`. Each task has:
- Explicit dependencies (which tasks must complete first)
- Exact files and schema sections to read (minimizes token usage)
- A runnable verification test (proves the task is done)
- Acceptance criteria (checklist of what "done" means)

### Token Efficiency Rules

- **Never read all of SCHEMA.md.** Use `grep -n "### \`tablename\`" SCHEMA.md` to find line numbers, then read only the tables you need.
- **Plans specify context.** The `/plan` and `/sprint` commands tell the implementing agent exactly what to read. The implementing agent should not speculatively read additional files.
- **If context exceeds 300 lines, stop and ask.** Something is probably scoped too broadly.
- **Prefer type checking over re-reading.** After creating types, use `npx tsc --noEmit` to catch errors rather than re-reading the schema to double-check.