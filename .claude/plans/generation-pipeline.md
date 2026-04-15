# Generation Pipeline — Architecture Plan

**Scope:** Professor uploads PDF → system parses it → proposes a generation plan → professor reviews/edits → approves → generation jobs are queued.

**Status:** Architecture plan. **Recommend `/sprint` for execution** — this has 8+ subtasks with dependencies.

---

## Current State

- Bare Next.js 16 scaffold (App Router, React 19, Tailwind 4)
- No Supabase client, no auth, no shadcn/ui, no worker, no storage
- Schema is fully designed in `SCHEMA.md` — no migrations exist yet

## Prerequisites (must be built first)

These are foundational pieces the pipeline depends on. They don't exist yet.

### P1: Supabase Client Setup
- Install `@supabase/supabase-js` and `@supabase/ssr`
- Create `src/lib/supabase/server.ts` — server-side client (uses cookies for auth)
- Create `src/lib/supabase/client.ts` — browser-side client
- Create `src/lib/supabase/admin.ts` — service role client (for Server Actions that need elevated access)
- Add env vars to `.env.local.example`: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`

### P2: Database Migration — Core Tables
- Initialize Supabase local config: `supabase/config.toml`
- Create `supabase/migrations/001_initial_schema.sql` covering:
  - `institutions`, `users` (auth.users extension)
  - `courses`, `course_instances`, `course_staff`, `enrollments`
  - `modules`, `labs`
  - `source_materials`, `content_blocks`, `content_embeddings`
  - `concepts`
  - `generation_jobs`, `generation_plans`
  - `api_usage_log`, `rate_limits`, `cost_alerts`
  - All enums, indexes, and RLS policies from SCHEMA.md
- Seed file: `supabase/seed.sql` with default rate limits

### P3: shadcn/ui Setup
- Install shadcn/ui CLI, configure for Tailwind 4
- Add base components needed for the pipeline UI: `button`, `card`, `input`, `dialog`, `badge`, `progress`, `toast`, `tabs`, `accordion`, `dropdown-menu`

### P4: TypeScript Types
- Generate database types from Supabase: `src/types/database.ts`
- Create domain types: `src/types/generation.ts` (plan_data shape, job payloads, parsed content structures)

---

## Phase 1: Upload (Professor → Storage → source_materials → parse job)

### Data Flow
```
Professor selects PDF in UI
  → Client uploads to Supabase Storage bucket "source-materials"
  → Server Action creates `source_materials` row
  → Server Action creates `generation_jobs` row (type: parse_materials, status: pending)
  → UI shows "Processing..." with realtime subscription on the job row
```

### Files to Create

| File | Purpose | Token Budget |
|---|---|---|
| `src/lib/actions/materials.ts` | Server Action: `uploadMaterial(courseId, labId, file)` — uploads to storage, inserts `source_materials` row, creates `parse_materials` job | medium |
| `src/app/(dashboard)/professor/courses/[courseId]/materials/page.tsx` | Upload page — file picker, upload progress, list of uploaded materials with parse status | medium |
| `src/components/material-upload.tsx` | Client component: drag-and-drop file picker, calls upload action, shows progress | medium |
| `src/components/material-list.tsx` | Client component: shows uploaded materials with status badges, subscribes to job status via Realtime | small |

### Key Decisions

1. **Upload target**: Supabase Storage, not a route handler. The client uploads directly to Storage (signed URL or client SDK), then the Server Action records metadata. This avoids streaming large files through the Next.js server.

2. **Storage bucket**: `source-materials`, private. RLS on storage: only the uploading professor and course staff can access.

3. **File validation**: Client-side MIME check + size limit (50MB). Server Action re-validates. Accepted types: `application/pdf`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, `application/vnd.openxmlformats-officedocument.presentationml.presentation`, `image/png`, `image/jpeg`.

4. **Lab assignment**: Materials are uploaded at the course level initially (not lab-scoped). The `propose_plan` phase assigns materials to labs. So `source_materials.lab_id` is nullable at upload time and populated when the plan is approved.

   **Schema implication**: SCHEMA.md shows `lab_id` as non-nullable on `source_materials`. We need to decide: either (a) make it nullable (materials exist before labs do), or (b) require labs to exist before upload. Option (a) is cleaner — the plan proposal creates the lab structure and then links materials.

   **Recommendation**: Make `lab_id` nullable on `source_materials`. Add `course_id` (FK → courses) as the primary scope. This matches the pipeline flow: materials belong to a course, not a lab, until the plan assigns them.

### Zod Schemas
```typescript
// src/lib/actions/materials.ts
const uploadMaterialSchema = z.object({
  courseId: z.string().uuid(),
  fileName: z.string().min(1),
  fileType: z.enum([
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'image/png',
    'image/jpeg',
  ]),
  storagePath: z.string(), // Set after storage upload completes
  fileSizeBytes: z.number().positive(),
});
```

---

## Phase 2: Parse (Worker picks up parse_materials job → content_blocks)

### Data Flow
```
Worker polls generation_jobs WHERE status = 'pending' AND job_type = 'parse_materials'
  → Claims job (status → 'running')
  → Downloads file from Supabase Storage
  → Extracts text + structure (PDF → structured blocks)
  → Inserts content_blocks rows
  → Updates job (status → 'completed', output_payload with block count)
  → If all parse jobs for a course are done, creates propose_plan job
```

### Files to Create

| File | Purpose | Token Budget |
|---|---|---|
| `worker/index.ts` | Entry point: poll loop, graceful shutdown | small |
| `worker/lib/job-runner.ts` | Generic: claim job, execute processor, update status, handle errors | medium |
| `worker/lib/supabase.ts` | Supabase admin client for the worker (service role) | small |
| `worker/lib/cost-tracker.ts` | Writes to `api_usage_log` after each LLM call | small |
| `worker/processors/parse-materials.ts` | PDF parsing processor | large |
| `worker/package.json` | Separate package: `@supabase/supabase-js`, `pdf-parse` (or `@anthropic-ai/sdk` for vision-based parsing), `dotenv` | small |
| `worker/tsconfig.json` | TypeScript config for worker | small |

### Key Decisions

1. **PDF parsing strategy**: LLM vision-based parsing. Send pages as images to Claude, which returns structured JSON content_blocks. This preserves document structure — headings, figures, equations, tables — which is critical for academic materials. No text-extraction fallback; the LLM is the sole parser.

2. **Chunking strategy**: Each page → one LLM call → structured JSON output of content_blocks. The LLM identifies block boundaries (heading, paragraph, equation, figure description) and returns them as typed blocks. Position is assigned sequentially across pages. The LLM's JSON output is validated with Zod before writing to DB.

3. **Worker deployment**: Railway (as specified in CLAUDE.md). Separate `worker/` directory with its own `package.json`. Polls on a 5-second interval. Single-worker for pilot (no concurrency concerns yet).

4. **Auto-chain to propose_plan**: After all `parse_materials` jobs for a course complete, the worker automatically creates a `propose_plan` job. The check: count pending/running parse jobs for the same `course_id` — if zero remain, create the plan job.

### Parse Output Shape (per page)
```typescript
interface ParsedPage {
  page_number: number;
  blocks: {
    block_type: 'heading' | 'paragraph' | 'figure' | 'table' | 'equation' | 'list' | 'code';
    content: string;
    heading_level?: number;
    metadata?: Record<string, unknown>; // caption, column headers, etc.
  }[];
}
```

---

## Phase 3: Propose Plan (Worker → generation_plans)

### Data Flow
```
Worker picks up propose_plan job
  → Reads all content_blocks for the course
  → Sends to LLM with structured output prompt
  → LLM proposes: modules, labs per module, concepts per lab, Bloom's levels, question estimates
  → Inserts generation_plans row (status: draft, plan_data: proposed structure)
  → Updates job (status → completed)
  → Professor gets notified (Realtime subscription on generation_plans)
```

### Files to Create

| File | Purpose | Token Budget |
|---|---|---|
| `worker/processors/propose-plan.ts` | Plan proposal processor — builds prompt from content_blocks, calls LLM, validates output, writes generation_plans row | large |
| `worker/lib/prompts/propose-plan.txt` | System prompt for plan proposal (or `.ts` with template literals) | medium |

### Key Decisions

1. **LLM for plan proposal**: Claude Sonnet (good balance of quality and cost for structural analysis). The prompt includes:
   - All content_block texts (concatenated, with page/position metadata)
   - The course's `subject_area` for domain awareness
   - Instructions to output the `plan_data` JSON structure matching SCHEMA.md
   - Guidelines on module/lab granularity (1 module = 1-2 weeks of content, 1 lab = 1-2 class sessions)
   - Instructions to propose concepts with parent-child relationships
   - Instructions to suggest Bloom's levels and question counts per lab

2. **Cost estimation**: The LLM estimates token counts for each lab's generation. We multiply by the model's pricing to get `estimated_cost_cents`. This is a rough estimate — actual cost depends on content complexity.

3. **Plan output validation**: Zod schema validates the LLM's output before writing to DB. If validation fails, the job fails with a descriptive error (not a silent retry).

4. **Plan_data structure** (matches SCHEMA.md lines 454-475):
```typescript
interface PlanData {
  modules: {
    title: string;
    position: number;
    labs: {
      title: string;
      source_material_ids: string[];
      proposed_concepts: string[];
      estimated_questions: number;
      blooms_levels: BloomsLevel[];
      estimated_cost_cents: number;
    }[];
  }[];
  total_estimated_cost_cents: number;
}
```

---

## Phase 4: Professor Reviews Plan (UI)

### Data Flow
```
Professor lands on course page
  → Sees banner: "Generation plan ready for review"
  → Clicks through to plan review page
  → Sees proposed modules, labs, concepts in an editable tree
  → Can: add/remove/reorder modules and labs, edit concept names, add professor_notes
  → Sees estimated cost per lab and total
  → Clicks "Approve" → triggers generation
```

### Files to Create

| File | Purpose | Token Budget |
|---|---|---|
| `src/app/(dashboard)/professor/courses/[courseId]/plan/page.tsx` | Plan review page — server component, fetches generation_plan | medium |
| `src/components/plan-review/plan-editor.tsx` | Client component: the full plan editing interface | large |
| `src/components/plan-review/module-card.tsx` | Editable module: title, position, contains lab list | medium |
| `src/components/plan-review/lab-card.tsx` | Editable lab: title, concepts list, Bloom's badges, cost estimate | medium |
| `src/components/plan-review/concept-tag.tsx` | Editable concept chip with remove/rename | small |
| `src/lib/actions/generation.ts` | Server Actions: `updatePlan()`, `approvePlan()`, `cancelPlan()` | medium |

### Key Decisions

1. **Edit granularity**: Professors can edit the `plan_data` JSON through a structured UI. Every edit updates the `generation_plans.plan_data` column via Server Action. No optimistic updates — each save round-trips to DB. The plan is a draft until approved, so no concurrency concerns.

2. **Professor notes**: A single text field on the plan (`professor_notes`). The generator uses these as additional instructions. Example: "Emphasize practical circuits over theory in module 3."

3. **Cost display**: Show per-lab and total estimated cost. Include a note: "Estimates may vary by 20-30% based on content complexity."

4. **Approval flow**: `approvePlan()` Server Action:
   - Sets `generation_plans.status` → `approved`, `approved_at` → now
   - Creates `modules` rows from plan_data
   - Creates `labs` rows (with `generation_status: pending`) from plan_data
   - Links `source_materials` to labs (updates `lab_id`)
   - Creates `concepts` rows (with `status: proposed`) from plan_data
   - Creates individual `generate_lab` jobs for each lab
   - All in a single transaction (Supabase RPC or sequential with rollback)

5. **Realtime subscriptions**: The plan review page subscribes to the `generation_plans` row and all `generation_jobs` for the course. Once the professor approves and generation starts, the UI shows per-lab progress bars.

---

## Phase 5: Generation Execution (Worker generates labs)

> **Note**: This phase is the actual lab content generation. It's downstream of the "approve" action but architecturally important to plan now.

### Data Flow
```
Worker picks up generate_lab job
  → Reads content_blocks for assigned source_materials
  → Reads concept list for this lab
  → Sends to LLM with structured output prompt
  → LLM generates: lab content (Bloom's-structured), concept taxonomy refinements, review questions
  → Writes to labs.content, labs.blooms_structure
  → Writes review_questions rows
  → Updates concepts with descriptions
  → Creates generate_embeddings job for this lab
  → Updates job status
```

### Files to Create

| File | Purpose | Token Budget |
|---|---|---|
| `worker/processors/generate-lab.ts` | Lab generation processor | large |
| `worker/processors/generate-embeddings.ts` | Embedding generation processor (content_blocks → content_embeddings) | medium |
| `worker/lib/prompts/generate-lab.txt` | System prompt for lab generation | medium |

---

## Migration Schema Notes

The following deviations from SCHEMA.md are recommended based on pipeline flow analysis:

1. **`source_materials.lab_id`** → Make nullable, add `course_id` (FK → courses). Materials exist before labs do.
2. **`source_materials.course_id`** → Add this column. Materials are uploaded at course scope, assigned to labs during plan approval.
3. **`generation_plans.plan_data`** → The JSON structure is well-defined in SCHEMA.md lines 454-475. Validate with Zod on write.

---

## RLS Considerations

From SCHEMA.md RLS summary (lines 555-574):

- `generation_jobs`: Professor can CRUD on own courses. TAs read-only. Students: no access.
- `generation_plans`: Same as generation_jobs.
- `source_materials`: Follows labs RLS — professor CRUD, TA read, student read. But since materials may not have a lab_id during upload, RLS should scope to `course_id` via the professor's `course_staff` or `courses.created_by` relationship.

---

## Dependency Graph

```
P1 (Supabase client) ──┐
P2 (Migration)     ────┼──→ Phase 1 (Upload) ──→ Phase 2 (Parse) ──→ Phase 3 (Propose)
P3 (shadcn/ui)     ────┘                                                    │
P4 (Types)         ──────────────────────────────────────────────────────────┤
                                                                             ↓
                                                                    Phase 4 (Review UI)
                                                                             │
                                                                             ↓
                                                                    Phase 5 (Generate)
```

- P1, P2, P3 can run in parallel
- P4 depends on P2 (needs generated types from the migration)
- Phase 1 depends on P1 + P2 + P3
- Phase 2 depends on Phase 1 (needs worker infra + materials to parse)
- Phase 3 depends on Phase 2
- Phase 4 depends on Phase 3 + P3
- Phase 5 depends on Phase 4

---

## Estimated Subtask Count: 10

| # | Task | Depends On |
|---|---|---|
| 1 | Supabase client setup (P1) | — |
| 2 | Database migration + seed (P2) | — |
| 3 | shadcn/ui setup (P3) | — |
| 4 | TypeScript types (P4) | P2 |
| 5 | File upload UI + Server Action (Phase 1) | P1, P2, P3 |
| 6 | Worker infrastructure (poll loop, job runner) | P1, P2 |
| 7 | Parse materials processor (Phase 2) | Task 6 |
| 8 | Propose plan processor (Phase 3) | Task 7 |
| 9 | Plan review UI + Server Actions (Phase 4) | Task 8, P3, P4 |
| 10 | Lab generation processor (Phase 5) | Task 9 |

**This should be executed as a `/sprint`, not ad-hoc implementation.** Each task needs explicit acceptance criteria and verification tests.
