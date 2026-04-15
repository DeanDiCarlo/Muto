# Sprint S1: Generation Pipeline (Map → Review → Generate)

**Goal**: Professor uploads PDF, system parses it via LLM vision, proposes a generation plan, professor reviews/edits and approves, generation jobs are queued.

**Estimated sessions**: 10-12

**Prerequisites**: None — this is the first sprint. Project is a bare Next.js 16 scaffold.

**Architecture plan**: `.claude/plans/generation-pipeline.md`

---

## Parallelization Map

```
S1-T1 (Migration) ──────┐
S1-T2 (Supabase client) ─┼──→ S1-T4 (Types) ──→ S1-T6 (Upload action) ──→ S1-T7 (Upload UI)
S1-T3 (shadcn/ui) ───────┘                   │
                                              ├──→ S1-T5 (Worker infra) ──→ S1-T8 (Parse) ──→ S1-T9 (Propose plan)
                                              │
                                              └──→ S1-T10 (Plan review actions) ──→ S1-T11 (Plan review UI)
                                                                                          │
                                                                                          ↓
                                                                                   S1-T12 (Integration)
```

**Parallel group 1** (no dependencies): T1, T2, T3
**Parallel group 2** (after group 1): T4, T5
**Parallel group 3** (after T4): T6, T10
**Sequential after T6**: T7
**Sequential after T5**: T8 → T9
**Sequential after T10 + T3**: T11
**Final**: T12 (after all)

---

## Tasks

### S1-T1: Database Migration — Full Schema

Create the complete database schema: all enums, tables, indexes, RLS policies, and seed data.

- **Depends on**: none
- **Files**:
  - `supabase/migrations/001_initial_schema.sql` (create)
  - `supabase/seed.sql` (create)
  - `supabase/config.toml` (create — run `supabase init` first)
- **Schema tables**: ALL tables — `institutions` through `cost_alerts`
  - SCHEMA.md lines 45-576 (tables + RLS summary)
  - SCHEMA.md lines 594-611 (indexes)
- **Agent mode**: `/implement`
- **Context to load**:
  - `SCHEMA.md` lines 1-44 (preamble/conventions)
  - `SCHEMA.md` lines 45-611 (all tables, RLS, indexes)
  - `.claude/plans/generation-pipeline.md` lines 281-298 (migration schema notes — deviations from SCHEMA.md)
- **Token budget**: large
- **Schema deviations to implement**:
  - `source_materials.lab_id` → nullable
  - `source_materials` → add `course_id uuid NOT NULL REFERENCES courses(id)`
  - Add RLS on `source_materials` scoped to `course_id` via `courses.created_by`
- **Verification**:
  ```bash
  cd /home/deanomeano/muto && supabase init --force 2>/dev/null; supabase db reset 2>&1 | tail -5
  ```
  Expected: migration runs without errors. If Supabase local isn't running, verify with:
  ```bash
  cd /home/deanomeano/muto && grep -c "CREATE TABLE" supabase/migrations/001_initial_schema.sql
  ```
  Expected: 17+ tables created (institutions, users, courses, course_instances, course_staff, enrollments, modules, labs, source_materials, content_blocks, content_embeddings, concepts, review_questions, generation_jobs, generation_plans, api_usage_log, rate_limits, cost_alerts)
- **Acceptance criteria**:
  - [ ] All 18 tables from SCHEMA.md are defined with correct columns and types
  - [ ] All 7 enums created (`block_type`, `blooms_level`, `concept_status`, `job_type`, `job_status`, `generation_plan_status`, `user_role`, etc.)
  - [ ] All indexes from SCHEMA.md lines 594-611 are defined
  - [ ] RLS enabled on all tables with policies matching SCHEMA.md lines 555-576
  - [ ] `source_materials.lab_id` is nullable, `course_id` column added
  - [ ] Seed file includes default rate limits from SCHEMA.md lines 518-527
  - [ ] `student_evaluations_view` created (SCHEMA.md line 576)

---

### S1-T2: Supabase Client Setup

Install Supabase packages and create server/client/admin client utilities.

- **Depends on**: none
- **Files**:
  - `src/lib/supabase/server.ts` (create)
  - `src/lib/supabase/client.ts` (create)
  - `src/lib/supabase/admin.ts` (create)
  - `.env.local.example` (create)
- **Schema tables**: none
- **Agent mode**: `/implement`
- **Context to load**:
  - `CLAUDE.md` lines referencing Supabase (auth, data access patterns)
  - `package.json` (current dependencies)
  - `src/app/layout.tsx` (to understand App Router setup)
- **Token budget**: small
- **Implementation notes**:
  - Install `@supabase/supabase-js` and `@supabase/ssr`
  - Install `zod` (needed throughout the project)
  - `server.ts`: uses `createServerClient` from `@supabase/ssr` with Next.js cookie handling
  - `client.ts`: uses `createBrowserClient` from `@supabase/ssr`
  - `admin.ts`: uses `createClient` from `@supabase/supabase-js` with `SUPABASE_SERVICE_ROLE_KEY` — server-only, never import in client components
  - `.env.local.example`: list all required env vars with placeholder comments
- **Verification**:
  ```bash
  cd /home/deanomeano/muto && npx tsc --noEmit 2>&1 | head -20
  ```
  Expected: no type errors (or only errors from files not yet created)
- **Acceptance criteria**:
  - [ ] `@supabase/supabase-js`, `@supabase/ssr`, and `zod` installed
  - [ ] Server client correctly reads cookies for auth in App Router
  - [ ] Admin client uses service role key and is in a server-only file
  - [ ] `.env.local.example` documents all 3 Supabase env vars + `ANTHROPIC_API_KEY` + `OPENAI_API_KEY`
  - [ ] `npx tsc --noEmit` passes for these files

---

### S1-T3: shadcn/ui Setup

Initialize shadcn/ui for Tailwind 4 and install base components needed for the pipeline UI.

- **Depends on**: none
- **Files**:
  - `components.json` (created by shadcn init)
  - `src/lib/utils.ts` (created by shadcn init — `cn` utility)
  - `src/components/ui/*.tsx` (created by shadcn add)
- **Schema tables**: none
- **Agent mode**: `/implement`
- **Context to load**:
  - `package.json`
  - `tailwind.config.ts` or `postcss.config.mjs` (current Tailwind setup)
  - `src/app/globals.css`
- **Token budget**: small
- **Implementation notes**:
  - Run `npx shadcn@latest init` — select New York style, neutral base color, CSS variables
  - Add components: `button`, `card`, `input`, `label`, `dialog`, `badge`, `progress`, `toast`, `sonner`, `tabs`, `accordion`, `dropdown-menu`, `textarea`, `separator`
  - Verify Tailwind 4 compatibility — shadcn v4 supports Tailwind 4 natively
- **Verification**:
  ```bash
  cd /home/deanomeano/muto && npm run build 2>&1 | tail -10
  ```
  Expected: build succeeds
- **Acceptance criteria**:
  - [ ] `components.json` exists with correct configuration
  - [ ] `src/lib/utils.ts` exists with `cn` function
  - [ ] All listed UI components exist in `src/components/ui/`
  - [ ] `npm run build` succeeds

---

### S1-T4: TypeScript Types

Create database types and domain types for the generation pipeline.

- **Depends on**: S1-T1 (needs schema to match)
- **Files**:
  - `src/types/database.ts` (create)
  - `src/types/generation.ts` (create)
- **Schema tables**: all (for database.ts), generation_jobs + generation_plans (for generation.ts)
- **Agent mode**: `/implement`
- **Context to load**:
  - `SCHEMA.md` lines 45-576 (all tables)
  - `supabase/migrations/001_initial_schema.sql` (to match exact column types)
  - `.claude/plans/generation-pipeline.md` lines 138-203 (ParsedPage, PlanData types)
- **Token budget**: large
- **Implementation notes**:
  - `database.ts`: manually define Supabase-style types (Tables, Enums, etc.) matching the migration. In a real setup we'd run `supabase gen types typescript` but we may not have a running local instance yet. Define them manually to match the SQL exactly.
  - `generation.ts`: domain types not auto-generated:
    - `PlanData` — the `generation_plans.plan_data` JSON shape
    - `ParsedPage` — output of the LLM parser
    - `ParseMaterialsPayload` — `generation_jobs.input_payload` for parse_materials jobs
    - `ProposePlanPayload` — input_payload for propose_plan jobs
    - `GenerateLabPayload` — input_payload for generate_lab jobs
    - `LabContent` — the `labs.content` JSON shape
    - `BloomsStructure` — the `labs.blooms_structure` JSON shape
  - Export Zod schemas alongside TypeScript types for runtime validation
- **Verification**:
  ```bash
  cd /home/deanomeano/muto && npx tsc --noEmit 2>&1 | head -20
  ```
- **Acceptance criteria**:
  - [ ] `database.ts` has types for all 18 tables matching the migration exactly
  - [ ] `generation.ts` has `PlanData`, `ParsedPage`, all job payload types, `LabContent`, `BloomsStructure`
  - [ ] Zod schemas exist for `PlanData`, `ParsedPage`, and all job payloads
  - [ ] `npx tsc --noEmit` passes for these files

---

### S1-T5: Worker Infrastructure

Set up the Railway worker: package, config, poll loop, job runner, and Supabase client.

- **Depends on**: S1-T2 (pattern reference), S1-T4 (types)
- **Files**:
  - `worker/package.json` (create)
  - `worker/tsconfig.json` (create)
  - `worker/index.ts` (create)
  - `worker/lib/job-runner.ts` (create)
  - `worker/lib/supabase.ts` (create)
  - `worker/lib/cost-tracker.ts` (create)
- **Schema tables**: `generation_jobs` (SCHEMA.md lines 407-435), `api_usage_log` (lines 483-500)
- **Agent mode**: `/implement`
- **Context to load**:
  - `SCHEMA.md` lines 407-435 (generation_jobs table)
  - `SCHEMA.md` lines 483-500 (api_usage_log table)
  - `src/types/generation.ts` (job payload types)
  - `src/types/database.ts` (table types)
  - `.claude/plans/generation-pipeline.md` lines 103-150 (Phase 2 data flow, worker decisions)
- **Token budget**: medium
- **Implementation notes**:
  - `package.json`: deps are `@supabase/supabase-js`, `@anthropic-ai/sdk`, `dotenv`, `zod`. Dev deps: `typescript`, `tsx`, `@types/node`
  - `index.ts`: poll loop — every 5 seconds, call job-runner. Graceful shutdown on SIGTERM/SIGINT.
  - `job-runner.ts`: 
    1. Query `generation_jobs WHERE status = 'pending' ORDER BY priority DESC, created_at ASC LIMIT 1`
    2. Atomically claim: `UPDATE SET status = 'running', started_at = now() WHERE id = ? AND status = 'pending'` (prevents double-claim)
    3. Route to processor by `job_type`
    4. On success: `UPDATE SET status = 'completed', completed_at = now(), output_payload = ?`
    5. On error: `UPDATE SET status = 'failed', error_message = ?, completed_at = now()`
  - `supabase.ts`: service role client for the worker
  - `cost-tracker.ts`: `trackUsage({ userId, institutionId, usageType, model, inputTokens, outputTokens, costCents, generationJobId?, labId? })` → inserts into `api_usage_log`
- **Verification**:
  ```bash
  cd /home/deanomeano/muto/worker && npx tsc --noEmit 2>&1 | head -20
  ```
  Expected: no type errors
- **Acceptance criteria**:
  - [ ] Worker compiles with `npx tsc --noEmit`
  - [ ] Poll loop queries for pending jobs and routes to processors by job_type
  - [ ] Job claim uses atomic UPDATE with WHERE status = 'pending' to prevent double-claim
  - [ ] Graceful shutdown on SIGTERM/SIGINT stops the poll loop
  - [ ] cost-tracker writes to `api_usage_log` with all required fields

---

### S1-T6: File Upload Server Action

Create the Server Action for uploading materials to Supabase Storage and creating parse jobs.

- **Depends on**: S1-T2 (Supabase client), S1-T4 (types)
- **Files**:
  - `src/lib/actions/materials.ts` (create)
- **Schema tables**: `source_materials` (SCHEMA.md lines 181-196), `generation_jobs` (lines 407-435)
- **Agent mode**: `/implement`
- **Context to load**:
  - `SCHEMA.md` lines 181-196 (source_materials — note: lab_id is nullable, course_id added)
  - `SCHEMA.md` lines 407-435 (generation_jobs)
  - `src/lib/supabase/admin.ts` (for service role operations)
  - `src/lib/supabase/server.ts` (for auth-scoped operations)
  - `src/types/database.ts` (table types)
  - `src/types/generation.ts` (job payload types)
  - `.claude/plans/generation-pipeline.md` lines 69-98 (upload decisions + Zod schema)
- **Token budget**: medium
- **Implementation notes**:
  - `uploadMaterial(formData: FormData)`: Server Action that:
    1. Validates auth (professor must be course owner or staff with `can_edit_structure`)
    2. Validates file (Zod: courseId, fileName, fileType, fileSizeBytes — max 50MB)
    3. Uploads file to Supabase Storage bucket `source-materials` at path `{courseId}/{uuid}/{fileName}`
    4. Inserts `source_materials` row (lab_id = null, course_id = courseId)
    5. Inserts `generation_jobs` row (job_type = 'parse_materials', status = 'pending', input_payload = { source_material_id })
    6. Returns the source_material record + job id
  - `getMaterials(courseId: string)`: Fetches all source_materials for a course with their parse job status
  - `deleteMaterial(materialId: string)`: Deletes from storage + DB, cancels any pending parse job
- **Verification**:
  ```bash
  cd /home/deanomeano/muto && npx tsc --noEmit 2>&1 | head -20
  ```
- **Acceptance criteria**:
  - [ ] `uploadMaterial` validates auth, file type, file size
  - [ ] File uploaded to Supabase Storage at correct path
  - [ ] `source_materials` row created with `lab_id = null` and `course_id` set
  - [ ] `parse_materials` job created with correct input_payload
  - [ ] `getMaterials` returns materials with parse status
  - [ ] `npx tsc --noEmit` passes

---

### S1-T7: File Upload UI

Create the professor-facing material upload page with drag-and-drop and status tracking.

- **Depends on**: S1-T3 (shadcn/ui), S1-T6 (upload action)
- **Files**:
  - `src/app/(dashboard)/professor/courses/[courseId]/materials/page.tsx` (create)
  - `src/components/material-upload.tsx` (create)
  - `src/components/material-list.tsx` (create)
- **Schema tables**: `source_materials`, `generation_jobs` (for Realtime subscription)
- **Agent mode**: `/implement`
- **Context to load**:
  - `src/lib/actions/materials.ts` (the actions this UI calls)
  - `src/lib/supabase/client.ts` (for Realtime subscriptions)
  - `src/components/ui/button.tsx`, `src/components/ui/card.tsx`, `src/components/ui/badge.tsx`, `src/components/ui/progress.tsx` (available UI primitives)
  - `src/app/layout.tsx` (layout structure)
  - `.claude/plans/generation-pipeline.md` lines 49-68 (Phase 1 UI description)
- **Token budget**: medium
- **Implementation notes**:
  - `page.tsx`: Server component. Fetches materials for the course. Renders MaterialUpload + MaterialList.
  - `material-upload.tsx`: Client component. Drag-and-drop zone (HTML drag events, no library). File type validation client-side. Calls `uploadMaterial` action. Shows upload progress via XHR (not fetch, to get progress events) or Supabase Storage resumable upload.
  - `material-list.tsx`: Client component. Shows list of uploaded materials as cards. Each card shows: file name, file type badge, file size, upload date, parse status (pending/running/completed/failed with progress %). Subscribes to `generation_jobs` table via Supabase Realtime for live status updates.
  - Add a `(dashboard)/professor/layout.tsx` if it doesn't exist — minimal shell with nav placeholder.
  - Add a `(dashboard)/layout.tsx` if it doesn't exist — wraps protected routes.
- **Verification**:
  ```bash
  cd /home/deanomeano/muto && npm run build 2>&1 | tail -10
  ```
  Expected: build succeeds. Then manual check:
  ```
  Start dev server, navigate to /professor/courses/[any-uuid]/materials
  Verify: drag-and-drop zone renders, material list renders (empty state)
  ```
- **Acceptance criteria**:
  - [ ] Upload page renders at `/professor/courses/[courseId]/materials`
  - [ ] Drag-and-drop zone accepts PDF, DOCX, PPTX, PNG, JPEG
  - [ ] Rejects files over 50MB or wrong MIME type with user-facing error
  - [ ] Material list shows uploaded files with status badges
  - [ ] Realtime subscription updates parse status without page refresh
  - [ ] `npm run build` succeeds

---

### S1-T8: Parse Materials Processor

Worker processor that sends PDF pages as images to Claude and extracts structured content_blocks.

- **Depends on**: S1-T5 (worker infrastructure)
- **Files**:
  - `worker/processors/parse-materials.ts` (create)
- **Schema tables**: `source_materials` (lines 181-196), `content_blocks` (lines 198-214), `generation_jobs` (lines 407-435)
- **Agent mode**: `/implement`
- **Context to load**:
  - `SCHEMA.md` lines 181-214 (source_materials + content_blocks)
  - `SCHEMA.md` lines 407-435 (generation_jobs — input_payload shape for parse_materials)
  - `worker/lib/job-runner.ts` (processor interface)
  - `worker/lib/supabase.ts` (DB client)
  - `worker/lib/cost-tracker.ts` (cost tracking)
  - `src/types/generation.ts` (ParsedPage type + Zod schema)
  - `.claude/plans/generation-pipeline.md` lines 103-150 (Phase 2 decisions)
- **Token budget**: large
- **Implementation notes**:
  - Processor function signature: `async function parseMaterials(job: GenerationJob): Promise<JobResult>`
  - Flow:
    1. Read `input_payload.source_material_id`
    2. Fetch `source_materials` row → get `storage_path`
    3. Download file from Supabase Storage
    4. Convert PDF pages to images (use `pdf-to-img` or similar — needs a PDF rendering lib)
    5. For each page: send image to Claude via `@anthropic-ai/sdk` with structured output prompt
    6. Claude returns JSON array of content_blocks per page (validated with Zod `ParsedPage` schema)
    7. Assign sequential `position` across all pages
    8. Batch insert `content_blocks` rows
    9. Track cost via cost-tracker for each LLM call
    10. Update job progress: `progress_percent = (pagesProcessed / totalPages) * 100`
    11. After completion: check if all `parse_materials` jobs for this `course_id` are done. If yes, create `propose_plan` job.
  - LLM prompt for parsing: system prompt instructs Claude to identify block types (heading, paragraph, figure, table, equation, list, code) and return structured JSON. Include page number in the prompt.
  - Error handling: if a single page fails, log the error in `current_step` but continue with remaining pages. Only fail the job if 0 pages succeed.
  - Add `pdf-to-img` (or `pdf-lib` + canvas approach) to `worker/package.json`
- **Verification**:
  ```bash
  cd /home/deanomeano/muto/worker && npx tsc --noEmit 2>&1 | head -20
  ```
  For functional verification (requires running Supabase + API key):
  ```bash
  cd /home/deanomeano/muto/worker && npx tsx -e "
    import { parseMaterials } from './processors/parse-materials';
    console.log(typeof parseMaterials === 'function' ? 'PASS: exported correctly' : 'FAIL');
  "
  ```
- **Acceptance criteria**:
  - [ ] Downloads PDF from Supabase Storage
  - [ ] Converts PDF pages to images
  - [ ] Sends each page image to Claude with structured output prompt
  - [ ] Validates Claude's JSON response with Zod ParsedPage schema
  - [ ] Inserts content_blocks with correct block_type, content, position, page_number
  - [ ] Tracks cost per LLM call via cost-tracker
  - [ ] Updates progress_percent as pages are processed
  - [ ] Auto-creates propose_plan job when all parse jobs for the course are done
  - [ ] Compiles without type errors

---

### S1-T9: Propose Plan Processor

Worker processor that analyzes parsed content_blocks and proposes a generation plan.

- **Depends on**: S1-T8 (parse processor must exist — shared patterns)
- **Files**:
  - `worker/processors/propose-plan.ts` (create)
  - `worker/lib/prompts/propose-plan.ts` (create)
- **Schema tables**: `content_blocks` (lines 198-214), `generation_plans` (lines 438-478), `generation_jobs` (lines 407-435), `courses` (lines 79-92)
- **Agent mode**: `/implement`
- **Context to load**:
  - `SCHEMA.md` lines 79-92 (courses — subject_area field)
  - `SCHEMA.md` lines 198-214 (content_blocks)
  - `SCHEMA.md` lines 438-478 (generation_plans — especially plan_data JSON structure)
  - `worker/lib/job-runner.ts` (processor interface)
  - `worker/processors/parse-materials.ts` (pattern reference for LLM calls)
  - `worker/lib/cost-tracker.ts`
  - `src/types/generation.ts` (PlanData type + Zod schema)
  - `.claude/plans/generation-pipeline.md` lines 153-203 (Phase 3 decisions)
- **Token budget**: large
- **Implementation notes**:
  - Flow:
    1. Read `input_payload.course_id`
    2. Fetch course record (for `subject_area`)
    3. Fetch all `content_blocks` for the course (via source_materials.course_id join)
    4. Build prompt: concatenate content_blocks with position/page metadata, include subject_area, instruct Claude to propose modules/labs/concepts
    5. Send to Claude Sonnet with structured output — response must match `PlanData` Zod schema
    6. Calculate `estimated_cost_cents` per lab (rough token estimate x model pricing)
    7. Insert `generation_plans` row (status: 'draft', plan_data: validated output)
    8. Track cost
  - System prompt (`propose-plan.ts`):
    - Instructs Claude to analyze academic content and propose a course structure
    - Specifies output format matching `PlanData` interface exactly
    - Guidelines: 1 module = 1-2 weeks of content, 1 lab = 1-2 class sessions
    - Must propose concepts with parent-child relationships where appropriate
    - Must suggest Bloom's levels per lab
    - Must estimate question counts (3-8 per lab depending on concept count)
  - If content_blocks total exceeds Claude's context window, chunk by source_material and summarize before proposing
- **Verification**:
  ```bash
  cd /home/deanomeano/muto/worker && npx tsc --noEmit 2>&1 | head -20
  ```
- **Acceptance criteria**:
  - [ ] Reads all content_blocks for the course
  - [ ] Builds prompt with content + subject_area context
  - [ ] Claude output validated against PlanData Zod schema
  - [ ] generation_plans row created with status 'draft'
  - [ ] Cost tracked via cost-tracker
  - [ ] Handles large documents (chunking strategy for context window limits)
  - [ ] Compiles without type errors

---

### S1-T10: Plan Review Server Actions

Server Actions for editing, approving, and cancelling generation plans.

- **Depends on**: S1-T4 (types), S1-T2 (Supabase client)
- **Files**:
  - `src/lib/actions/generation.ts` (create)
- **Schema tables**: `generation_plans` (lines 438-478), `generation_jobs` (lines 407-435), `modules` (lines 143-155), `labs` (lines 158-178), `concepts` (lines 235-253), `source_materials` (lines 181-196)
- **Agent mode**: `/implement`
- **Context to load**:
  - `SCHEMA.md` lines 143-178 (modules + labs)
  - `SCHEMA.md` lines 235-253 (concepts)
  - `SCHEMA.md` lines 438-478 (generation_plans)
  - `SCHEMA.md` lines 407-435 (generation_jobs)
  - `src/lib/supabase/admin.ts` (for transactional operations)
  - `src/lib/supabase/server.ts` (for auth-scoped reads)
  - `src/types/generation.ts` (PlanData type)
  - `src/types/database.ts` (table types)
  - `.claude/plans/generation-pipeline.md` lines 208-250 (Phase 4 decisions)
- **Token budget**: large
- **Implementation notes**:
  - `getPlan(courseId: string)`: Fetch the latest generation_plan for a course (status = 'draft' or 'approved')
  - `updatePlan(planId: string, planData: PlanData, professorNotes?: string)`: Updates `plan_data` and `professor_notes`. Validates auth + PlanData with Zod. Only allowed when status = 'draft'.
  - `approvePlan(planId: string)`: The critical action. Must be transactional:
    1. Verify plan status = 'draft'
    2. Set `generation_plans.status` → 'approved', `approved_at` → now
    3. For each module in plan_data: INSERT into `modules` (course_id, title, position)
    4. For each lab in each module: INSERT into `labs` (module_id, title, position, generation_status = 'pending')
    5. UPDATE `source_materials` SET lab_id = ? for each lab's source_material_ids
    6. For each concept in each lab: INSERT into `concepts` (lab_id, name, status = 'proposed', position)
    7. For each lab: INSERT into `generation_jobs` (course_id, job_type = 'generate_lab', status = 'pending', input_payload = { lab_id, source_material_ids, concept_ids })
    8. Set `generation_plans.status` → 'generating'
    - Use Supabase RPC (Postgres function) for atomicity, or sequential with manual rollback
  - `cancelPlan(planId: string)`: Sets plan status to 'draft' (resettable) or deletes it
- **Verification**:
  ```bash
  cd /home/deanomeano/muto && npx tsc --noEmit 2>&1 | head -20
  ```
- **Acceptance criteria**:
  - [ ] `getPlan` returns the latest plan for a course with correct typing
  - [ ] `updatePlan` validates PlanData with Zod, only works on draft plans
  - [ ] `approvePlan` creates modules, labs, concepts, and generation_jobs in correct order
  - [ ] `approvePlan` links source_materials to labs via lab_id
  - [ ] All mutations check auth (professor must be course owner/staff)
  - [ ] `npx tsc --noEmit` passes

---

### S1-T11: Plan Review UI

Professor-facing plan editing interface: module/lab/concept tree with drag-and-drop reordering and cost display.

- **Depends on**: S1-T3 (shadcn/ui), S1-T10 (plan review actions)
- **Files**:
  - `src/app/(dashboard)/professor/courses/[courseId]/plan/page.tsx` (create)
  - `src/components/plan-review/plan-editor.tsx` (create)
  - `src/components/plan-review/module-card.tsx` (create)
  - `src/components/plan-review/lab-card.tsx` (create)
  - `src/components/plan-review/concept-tag.tsx` (create)
- **Schema tables**: `generation_plans` (for Realtime), `generation_jobs` (for progress after approval)
- **Agent mode**: `/implement`
- **Context to load**:
  - `src/lib/actions/generation.ts` (Server Actions this UI calls)
  - `src/types/generation.ts` (PlanData type for rendering)
  - `src/components/ui/card.tsx`, `src/components/ui/button.tsx`, `src/components/ui/badge.tsx`, `src/components/ui/input.tsx`, `src/components/ui/textarea.tsx`, `src/components/ui/accordion.tsx` (UI primitives)
  - `src/lib/supabase/client.ts` (Realtime subscriptions)
  - `.claude/plans/generation-pipeline.md` lines 208-250 (Phase 4 UI description)
- **Token budget**: large
- **Implementation notes**:
  - `page.tsx`: Server component. Fetches plan via `getPlan(courseId)`. Shows different states:
    - No plan yet: "Upload materials to get started" with link to materials page
    - Plan draft: renders PlanEditor
    - Plan approved/generating: shows generation progress
    - Plan completed: shows completion summary
  - `plan-editor.tsx`: Client component. The main editing surface.
    - Renders modules as accordion items
    - Each module contains lab cards
    - Each lab card shows concepts as tags
    - "Add module" / "Add lab" buttons
    - "Professor notes" textarea at the top
    - Cost summary at the bottom (per-lab + total)
    - "Save Draft" button → calls `updatePlan()`
    - "Approve & Generate" button → confirmation dialog → calls `approvePlan()`
  - `module-card.tsx`: Editable title, delete button, contains lab list
  - `lab-card.tsx`: Editable title, concept tags, Bloom's level badges, cost estimate, delete button
  - `concept-tag.tsx`: Editable name, remove button (x icon)
  - After approval: subscribe to `generation_jobs` via Realtime, show per-lab progress bars
- **Verification**:
  ```bash
  cd /home/deanomeano/muto && npm run build 2>&1 | tail -10
  ```
  Manual verification:
  ```
  Start dev server, navigate to /professor/courses/[uuid]/plan
  Verify: page renders without errors (empty state or mock data)
  ```
- **Acceptance criteria**:
  - [ ] Plan page renders at `/professor/courses/[courseId]/plan`
  - [ ] Modules display as accordion items with editable titles
  - [ ] Labs display with concept tags, Bloom's badges, cost estimates
  - [ ] Professor can add/remove modules, labs, and concepts
  - [ ] Professor notes textarea saves via updatePlan
  - [ ] "Approve & Generate" shows confirmation dialog with total cost
  - [ ] After approval, per-lab progress bars update via Realtime
  - [ ] `npm run build` succeeds

---

### S1-T12: End-to-End Integration Check

Verify the complete flow works: upload → parse → propose → review → approve.

- **Depends on**: ALL previous tasks
- **Files**: none (verification only — may create a test script)
  - `tests/integration/generation-pipeline.test.ts` (create — optional)
- **Schema tables**: all pipeline tables
- **Agent mode**: manual verification
- **Context to load**:
  - `.claude/plans/generation-pipeline.md` (full plan for flow reference)
  - All Server Actions and worker processors
- **Token budget**: medium
- **Verification checklist**:
  ```
  1. Start Supabase local: supabase start
  2. Seed database: supabase db reset
  3. Start Next.js dev: npm run dev
  4. Start worker: cd worker && npx tsx index.ts
  5. Navigate to /professor/courses/[seed-course-id]/materials
  6. Upload a test PDF
  7. Verify: source_materials row created, parse_materials job created
  8. Verify: worker picks up job, progress updates in UI
  9. Verify: content_blocks rows created after parse completes
  10. Verify: propose_plan job auto-created
  11. Verify: generation_plans row created with status = 'draft'
  12. Navigate to /professor/courses/[seed-course-id]/plan
  13. Verify: plan editor shows proposed modules/labs/concepts
  14. Edit a module title, add/remove a concept, add professor notes
  15. Click "Save Draft" — verify plan_data updated in DB
  16. Click "Approve & Generate" — verify:
      - modules, labs, concepts rows created
      - source_materials linked to labs
      - generate_lab jobs created (one per lab)
      - generation_plans status = 'generating'
  17. Verify: worker picks up generate_lab jobs (will fail since processor isn't built yet in this sprint — that's expected. Verify the job is claimed and the error is clean.)
  ```
- **Acceptance criteria**:
  - [ ] Upload → parse → propose flow completes without errors
  - [ ] Plan review UI correctly renders the proposed plan
  - [ ] Plan edits persist correctly
  - [ ] Approval creates all expected rows (modules, labs, concepts, jobs)
  - [ ] Worker poll loop processes jobs in correct order
  - [ ] No type errors across the entire project: `npx tsc --noEmit`
  - [ ] Full project builds: `npm run build`

---

## Notes

- **Phase 5 (lab generation processor)** is deliberately excluded from this sprint. It depends on the full pipeline being functional and is a separate, large task. It will be Sprint S2.
- **Auth is stubbed** in this sprint. Server Actions check for a user session but we don't have SSO wired up. For development, seed a test user and create a dev session. A separate sprint handles Supabase Auth + institutional SSO.
- **The `source_materials.lab_id` nullable change** is a deviation from SCHEMA.md. Document in the migration file with a comment.
- **Worker PDF rendering** (`pdf-to-img`) requires system dependencies (poppler or similar). Document in the worker README or Dockerfile. For local dev, ensure poppler-utils is installed.
