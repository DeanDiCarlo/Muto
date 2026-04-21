# Muto — Project Context for Claude Code

> This file is the project memory. Every planning or implementation session should start by reading it. Keep it current — stale framing here propagates into every plan Claude Code writes.

## What This Project Is

Muto is an institutional SaaS platform sold to universities. Before a semester begins, a professor uploads their full body of course material — textbooks, lecture notes, slide decks, past exams, supplementary readings. Muto ingests it and produces a **digital twin of the textbook**: every page, section, and figure navigable inside Muto, with hundreds to a thousand pre-generated interactive labs indexed to specific passages and images.

The student opens the digital textbook, highlights any text or drags over any figure, and the selection resolves to a pre-generated lab for that exact content. The lab is rendered in a way that's adapted to how that specific student learns, and gets sharper over time as the system accumulates signal on them.

**Customer:** Universities (institutional sale, per-course or per-department licensing).
**Primary user:** Students (the digital twin textbook is their daily surface).
**Secondary user:** Professors (they ingest materials pre-semester and consume aggregate class-level insight reports to adjust their in-class teaching).
**Launch scope:** Miami University, quantum computing courses. Pipeline is subject-agnostic.
**Domain:** trymuto.com

## Architecture at a Glance

- **Framework:** Next.js 14+ App Router (server components, server actions, route handlers)
- **Language:** TypeScript (strict mode)
- **Styling:** Tailwind CSS + shadcn/ui
- **Database:** Supabase (PostgreSQL + pgvector + Row Level Security)
- **Auth:** Supabase Auth with institutional SSO (Miami pilot uses Duo-backed SAML)
- **Async processing:** Railway-hosted worker polling a `generation_jobs` queue in Postgres
- **Generation LLMs:** Gemini 2.5 Flash for parsing/ingest, Gemini 3.1 Pro for lab generation, Anthropic for chatbot, OpenAI for embeddings
- **Hosting:** Vercel (Next.js), Railway (worker)

## Repo Structure

```
/
├── CLAUDE.md                    # This file (project memory)
├── README.md                    # Northstar thesis document
├── SCHEMA.md                    # Complete data model reference
├── docs/architecture/           # Product + system architecture documents
│   ├── 01_generation_pipeline.md       # Per-course generation pipeline
│   └── 02_context_composer.md          # Context composer ranking logic
├── .claude/
│   ├── settings.json            # Shared project settings (version controlled)
│   ├── settings.local.json      # Personal settings (gitignored)
│   ├── commands/                # Custom slash commands
│   ├── plans/                   # Architecture plans (Opus-authored)
│   └── sprints/                 # Decomposed, dependency-graphed tasks
├── src/
│   ├── app/
│   │   ├── (auth)/              # Auth routes (login, SSO callback)
│   │   ├── (dashboard)/
│   │   │   ├── professor/       # Ingest, plan review, insight reports
│   │   │   └── student/         # Digital twin textbook, labs, tutor
│   │   └── api/
│   ├── components/
│   │   ├── ui/                  # shadcn/ui primitives
│   │   └── ...
│   ├── lib/
│   │   ├── supabase/            # Server + client SDKs
│   │   ├── actions/             # Server Actions (mutations)
│   │   ├── composer/            # Context composer (planned — Layer 1/2/3 → packed prompt)
│   │   └── rate-limit.ts
│   └── types/
├── worker/                      # Railway worker (generation pipeline)
│   ├── index.ts                 # Job polling loop
│   ├── processors/
│   │   ├── parse-materials.ts          # PDF/doc → content_blocks
│   │   ├── propose-plan.ts             # Materials → draft generation plan
│   │   ├── generate-lab.ts             # Plan → stable lab core (pre-ingest)
│   │   ├── evaluate-review.ts          # Student responses → concept evaluations
│   │   └── generate-embeddings.ts      # content_blocks → vectors
│   └── lib/
│       ├── job-runner.ts               # Poll-claim-process pattern
│       ├── cost-tracker.ts             # Per-call usage → api_usage_log
│       ├── supabase.ts                 # Service-role client
│       └── prompts/                    # Prompt builders per processor
├── packages/shared/             # Cross-process Zod schemas (@muto/shared)
├── supabase/
│   ├── migrations/              # Numbered SQL migrations
│   ├── seed.sql                 # Dev seed data
│   └── config.toml
├── Dockerfile                   # Worker image (Railway)
└── public/
```

## The Product Model

Two distinct pipelines run at different times, both equally essential.

### Ingest Pipeline (pre-semester, batch, per professor)

Runs once when a professor uploads their materials. Produces the digital twin + the full pre-generated lab library for that course.

1. **Parse** — All uploaded materials (PDF, DOCX, PPTX) are parsed by Gemini 2.5 Flash into structured `content_blocks` (headings, paragraphs, figures, tables, equations). Images are extracted and stored as addressable entities so students can later drag-drop over them.
2. **Propose Plan** — The system analyzes the parsed content and proposes a generation plan: which sections warrant labs, which concepts they cover, estimated cost.
3. **Review** — Professor reviews and edits the plan in UI. Adds notes, reorders, approves.
4. **Generate** — On approval, hundreds to a thousand `generate_lab` jobs fan out. Each produces the **stable core** of one lab (see below). Labs are indexed back to the specific content block range they cover, which is how highlight-to-lab resolution works at runtime.

### Open-Time Pipeline (per student, per lab open)

Runs every time a student highlights content and opens a lab. Keeps the stable core, regenerates only the student-specific wrapper.

1. **Resolve** — Highlighted text or selected figure → content block range → one or more pre-generated labs covering that range. Primary match is deterministic (block range lookup); fallback is vector similarity against lab summaries.
2. **Compose** — The Context Composer (see below) assembles a packed prompt from the three context layers.
3. **Generate Wrapper** — One Gemini 3.1 Pro call regenerates only the adaptive 20% (framing, entry point, scaffolding depth, emphasis, explanation modality).
4. **Render** — The stable core (served from cache) + the adaptive wrapper render into the final interactive lab the student sees.

## The Three Context Layers

Every generation draws from three layers of context. These are the product's structural moat — competitors can copy the architecture but cannot copy the accumulated data.

**Layer 1 — Course Knowledge Graph.** Per-course, per-professor. The professor's full materials, a concept taxonomy with prerequisite edges, vector index (pgvector), terminology conventions, past exam emphasis patterns, teaching sequence. This is what makes a Muto lab feel like *this professor's* lab, not a generic explanation. Stable across semesters; deepens as professors add material.

**Layer 2 — Simulation Pattern Library.** Cross-course. A growing library of proven simulation archetypes (molecular models, rigid-body physics, vector fields, economic curves, state machines, process flows) with working code, real parameters, and engagement scores. Every successful generation contributes. New generations retrieve and adapt a proven archetype rather than writing simulation code from scratch — this is what takes the render-success rate from ~60% (cold generation) to ~95% (archetype-based).

**Layer 3 — Per-Student Cognitive Model.** Per-student, per-course. Interaction log, mastery vector (from `concept_evaluations`), prior path through the course. This is the signal that shapes the adaptive 20% of each lab.

Details: `docs/architecture/01_generation_pipeline.md`, `docs/architecture/02_context_composer.md`.

## The 80/20 Adaptive Split

Every lab has two parts with different lifecycles.

**Stable core (80% — pre-generated once at ingest, cached, identical across all students):**
- Simulation code (Three.js/Rapier scene, physics, controls)
- Core concept content (the factual substance of the lab)
- Review questions (the pool; selection/ordering is adaptive)
- Reference figures and diagrams
- Concept taxonomy links

**Adaptive wrapper (20% — regenerated per student at open-time):**
- Opening framing / hook
- Scaffolding depth (prerequisite refreshers shown or skipped)
- Entry point (where in the lab to start this student)
- Emphasis (which aspects to dwell on, which to compress)
- Explanation modality (worked example vs conceptual vs visual vs formal)

This split is the architectural reason Muto can be both "pre-generated at ingest" and "adaptive per student." Expensive work (simulation code, core content) is done once; cheap work (framing, scaffolding) runs per open. A lab open is sub-second for the cached core and ~5s for the wrapper regen — not a 30s full regeneration.

## How Data Compounds Across Semesters

When the class changes every fall, per-student data doesn't transfer — but that's only one of three tiers.

**Tier 1 — Ephemeral (resets each semester):** Individual student mastery vectors, interaction logs, and prior paths. Gone when the student graduates or the class ends. This is expected.

**Tier 2 — Cohort-aggregate (compounds forever):** Data aggregated up across the full class or multiple classes produces patterns that transfer to next year's students:
- **Misconception maps** — The wrong turns 400 students took through the ETC chapter tell you where the 401st will stumble.
- **Empirical prerequisite edges** — Concept links discovered from failure patterns, not from the taxonomy.
- **Archetype-for-concept fit** — "Bloch sphere archetype outperformed wave function on superposition by 30% across 300 students."
- **Explanation modality fit per course** — "Worked examples outperformed derivations by 22% in Prof. Ma's section."
- **Peer paths** — The composer's "similar students" retrieval draws from past semesters, not just the current one.

**Tier 3 — Structural (permanent assets):** The course knowledge graph (Layer 1) and the archetype library (Layer 2). Neither resets.

Pitch framing: *Muto does not need to know a specific student to serve them well — it needs to know the 1,200 students who previously took this course with this professor using this textbook. That's an extraordinarily sharp neighborhood.*

## Data Access Patterns

- **Reads:** Supabase JS client in server components via `@supabase/ssr`. RLS enforces access control.
- **Mutations:** Next.js Server Actions in `src/lib/actions/`. Validate all inputs with Zod before hitting the DB.
- **Chatbot RAG:** Vector similarity via pgvector on `content_embeddings`, scoped to `lab_id`.
- **Generation-time retrieval:** Context composer (`src/lib/composer/`) orchestrates Layer 1/2/3 retrieval, reranking, and prompt packing.

## Key Domain Concepts

- **Digital twin:** Muto's rendered version of a textbook. Every page, paragraph, and figure is navigable and selectable. Students read inside it; labs appear as overlays on top of selected content.
- **Ingest vs Open-Time:** Two distinct pipelines. Ingest runs once per course and produces the stable cores. Open-time runs per student per lab and produces the adaptive wrapper.
- **Stable core / Adaptive wrapper:** The 80/20 split within each lab. Never conflate them — different pipelines, different cache lifetimes, different cost profiles.
- **Archetype:** A proven simulation pattern with working code, validated parameters, and engagement scores. The retrieval unit of Layer 2.
- **Context Composer:** The service that packs Layer 1/2/3 signals into a single ~60k-token prompt for Gemini 3.1 Pro. Four stages: Resolve, Retrieve, Rerank, Pack.
- **Course vs Course Instance:** Course is the reusable per-professor definition (materials, knowledge graph, lab library). Course Instance is one semester's offering (enrollments, join code, student data).
- **Knowledge Review vs Chatbot:** Structured concept-tagged measurement (primary signal) vs freeform RAG tutor (secondary signal). Separate systems that should not be conflated.
- **Concept Evaluations:** The core student data atom — one row = one student's answer evaluated against one concept at one Bloom's level, with mastery score + confidence + reasoning. The primary input to the per-student cognitive model.
- **Insight Deadlines:** Professor-defined snapshot triggers (usually class meeting days) that compile cohort-level metrics reports. Not due dates — report triggers.
- **Bloom's Taxonomy:** Structural, not decorative. Labs are ordered `remember → understand → apply → analyze → evaluate → create`. Every review question is tagged at one of these six levels.
- **Cohort-aggregate signal:** Tier 2 data. Patterns aggregated from past students that transfer to next year's class.

## Coding Conventions

- TypeScript strict mode everywhere
- Server components by default; `'use client'` only when interactivity requires it
- File naming: kebab-case for files, PascalCase for components
- Server Actions go in `src/lib/actions/[domain].ts`
- Database types generated from Supabase → `src/types/database.ts`
- Custom domain types → `src/types/[domain].ts`
- All Server Action inputs validated with Zod before DB access
- Supabase migrations numbered sequentially (`001_initial_schema.sql`, `002_add_indexes.sql`, …)
- Business logic lives in Server Actions or `src/lib/` utilities, never in components

## Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=        # Server-only, never expose to client
GEMINI_API_KEY=                   # Parsing (Flash) + lab generation (3.1 Pro)
ANTHROPIC_API_KEY=                # Chatbot / tutor
OPENAI_API_KEY=                   # Embeddings (text-embedding-3-small)
```

Worker-only note: the Railway worker reads `SUPABASE_URL` (no `NEXT_PUBLIC_` prefix). That prefix is a Next.js concept; the standalone worker process doesn't understand it.

## Git Conventions

- Main branch: `main`
- Feature branches: `feat/[short-description]`; bug fixes: `fix/[short-description]`
- Conventional commits (`feat:`, `fix:`, `chore:`, `docs:`)
- PRs off feature branches; no direct pushes to main

## What NOT To Do

- Never expose `SUPABASE_SERVICE_ROLE_KEY` or `GEMINI_API_KEY` in client components
- Never bypass RLS — if a query needs elevated access, use the service-role client in a Server Action, not by disabling RLS
- Never store raw API keys or secrets in code
- Never use Pages Router patterns — this is an App Router project
- Never create components with required props that lack defaults (unless the component is always instantiated with explicit props)
- Never put business logic in components
- Never generate simulation code from scratch when an archetype exists that covers the concept — always retrieve first, adapt second
- Never conflate the stable core and the adaptive wrapper. They live in different tables, run on different pipelines, and have different cache lifetimes
- Never treat `concept_evaluations` as optional telemetry. It is the primary input to the per-student cognitive model and a required write path for every student review response

## Agent Workflow

This project uses an Opus-plans, Sonnet-executes workflow via Claude Code CLI.

| Command | Model | Purpose |
|---|---|---|
| `/sprint [feature]` | Opus | Break a feature into dependency-graphed verified subtasks |
| `/plan [feature]` | Opus | Architecture plan for a single feature (use `/sprint` for 4+ subtasks) |
| `/implement [id]` | Sonnet | Execute a plan or sprint task |
| `/verify [id]` | Sonnet | Run verification and check acceptance criteria |
| `/review [file]` | Either | Code review against project standards |
| `/schema-check` | Sonnet | Validate code against SCHEMA.md |
| `/generate-migration` | Sonnet | Create Supabase SQL migration from SCHEMA.md |
| `/vertical-slice [feature]` | Sonnet | Build one thin feature end-to-end |

### Token Efficiency Rules

- **Never read all of SCHEMA.md.** Use `grep -n "### \`tablename\`" SCHEMA.md` to find line numbers, then read only the tables you need.
- **Plans specify context.** `/plan` and `/sprint` tell the implementing agent exactly what to read. Do not speculatively read additional files.
- **If context exceeds 300 lines, stop and ask.** Something is probably scoped too broadly.
- **Prefer type checking over re-reading.** After types are written, `npx tsc --noEmit` catches errors faster than re-reading the schema.

### Sprint Structure

Sprints live in `.claude/sprints/`. Each task specifies: dependencies, exact files and SCHEMA.md sections to read, a runnable verification test, and acceptance criteria. Plans live in `.claude/plans/`.

## Build Sequencing

The target architecture is not built in one shot. Each version ships working software and generates the data the next version needs.

- **V1 — Foundation.** Ingest pipeline, parse → content_blocks → embeddings, Bloom's-structured labs generated at approval time (single-variant, non-adaptive), concept evaluations captured. Rough parity with a well-tuned generic RAG.
- **V2 — Archetype library.** Extract proven patterns from V1's successful labs. Seed the archetype library. Retrieval over archetypes for new generations. Pedagogical alignment as a hand-coded filter on retrieval.
- **V3 — Adaptivity kicks in.** Per-student cognitive model built from accumulated concept evaluations and interaction logs. Adaptive wrapper regenerated per lab open. Five-signal reranker in the composer with hand-tuned weights. *This is where the moat starts accumulating observably.*
- **V4 — Learned reranker.** Replace hand-tuned weights with a small Flash-tier reranker trained on Muto's own engagement data.
- **V5 — Adaptive slot budgeting.** Composer slot sizes shift per request type (new concept vs variation vs review).
- **V6+ — Hybrid RAG/CAG.** Cache-augmented generation for the stable context layers (professor profile, archetype library). Drops generation cost and latency substantially once the data justifies it.

## Current State vs Target Architecture

To avoid confusion in planning:

- **Built and working:** Ingest pipeline (parse → content_blocks → embeddings), Bloom's-structured lab generation, concept evaluations, RLS-enforced multi-tenancy, professor plan review flow, worker job queue.
- **Schema exists, infrastructure partial:** Labs are generated at approval time, not yet indexed to content_block ranges (required for highlight-to-lab). Concepts exist as a tree (`parent_concept_id`) but not yet as a DAG with explicit prerequisite edges.
- **Not yet built:** Archetype library (Layer 2). Per-student cognitive model beyond raw concept evaluations (Layer 3). Context composer service. Open-time adaptive wrapper pipeline. Digital twin textbook reading UI. Highlight-to-lab resolution.

When writing plans, anchor on this gap. V1-adjacent work (what's built, what's schema-ready) is small and incremental. V2–V3 work (archetype library, cognitive model, composer) is net-new and substantial — treat it as such in sprint scoping.
