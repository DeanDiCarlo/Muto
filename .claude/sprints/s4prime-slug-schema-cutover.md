# Sprint S4': Slug routing + northstar schema additions

**Goal**: Migration 006 applied in dev. All routes under `src/app/(dashboard)/` use slugs, not UUIDs. Course/lab mismatches redirect (not 404). Additive columns `labs.content_version`, `labs.sandpack_files`, `labs.tutor_context`, `labs.generation_context_snapshot`, and new tables `lab_embeddings`, `cognitive_model_snapshots` exist and pass type-gen. No behavior change on the generation side yet.

**Estimated sessions**: 2–3.

**Parent plan**: `.claude/plans/get-200-in-optimized-swing.md` §1, §2.

**Prerequisites already landed**:
- Commits `e26bd35`, `1198cde`: Gemini SDK client (`worker/lib/gemini.ts`), shared schemas (T1, T2, T3 from paused S4). These survive the pause.
- `worker/lib/job-runner.ts` with 2h job timeout (commit `487b912`).

**Out of scope**:
- Any changes to `generate-lab.ts` output. (S6.)
- Any Sandpack / React code. (S7.)
- Retrieval code that *reads* `lab_embeddings`. (S5.)
- Backfilling `lab_embeddings` rows. (S5.)

---

## Task dependency graph

```
S4p-T1 (migration 006 SQL) ─> S4p-T2 (apply + regenerate types) ─> S4p-T3 (packages/shared/src/config.ts)
                                                                    │
                                                                    ├─> S4p-T4 (slug generator + getCourseBySlug)
                                                                    │
                                                                    └─> S4p-T5 (getLabBySlug + course_id denorm)
                                                                                 │
                                                                                 └─> S4p-T6 (rename route folders)
                                                                                             │
                                                                                             └─> S4p-T7 (UUID→slug middleware)
                                                                                                         │
                                                                                                         └─> S4p-T8 (e2e smoke)
```

---

## Tasks

### S4p-T1: Draft migration 006

- **Depends on**: none
- **Files**: `supabase/migrations/006_northstar.sql` (new)
- **Schema tables touched**: `courses`, `labs`, `course_instances`, new `lab_embeddings`, new `cognitive_model_snapshots`
- **Agent mode**: `/implement`
- **Context to load**:
  - SCHEMA.md sections for `courses`, `labs`, `modules`, `course_instances`, `enrollments`, `concept_evaluations`, `content_embeddings` (grep for headings, read only those sections).
  - `.claude/plans/get-200-in-optimized-swing.md` §1.
  - `supabase/migrations/001_initial_schema.sql` for style reference.
- **Implementation**:
  - Additive only. No drops.
  - Add `courses.slug`, `labs.slug`, `labs.course_id` (denorm), `course_instances.slug`. Backfill each with `lower(regexp_replace(title,'[^a-zA-Z0-9]+','-','g'))||'-'||substr(id::text,1,6)`. Set NOT NULL after backfill.
  - Unique indexes: `courses(institution_id, created_by, slug)`, `labs(course_id, slug)`, `course_instances(course_id, slug)`.
  - Add `labs.content_version smallint not null default 1`, `labs.sandpack_files jsonb`, `labs.tutor_context jsonb`, `labs.generation_context_snapshot jsonb`.
  - Create `lab_embeddings(id, lab_id unique, subject_area, embedding vector(1536), quality_score numeric(3,2), embedded_text, created_at)` with `hnsw(embedding vector_cosine_ops)` and `(subject_area)` indexes.
  - Create `cognitive_model_snapshots(id, enrollment_id, lab_id nullable, summary jsonb, computed_at)` with `(enrollment_id, computed_at DESC)` index.
  - Add SQL comments at the top of the file noting the denorm risk for `labs.course_id` (trigger required if cross-module lab moves ever ship).
- **Verification**:
  - `psql` dry-run: `psql $DB -f supabase/migrations/006_northstar.sql` on a local branch DB completes without error.
  - Post-apply: `SELECT slug FROM courses LIMIT 5` returns non-null slugs; `\d+ labs` shows the new columns.
- **Acceptance criteria**:
  - [ ] Migration file exists and passes psql parsing.
  - [ ] All four `ALTER TABLE ... SET NOT NULL` statements succeed against seeded data.
  - [ ] Unique indexes created; collision in seed data is impossible due to `id` suffix.
  - [ ] `lab_embeddings` table exists with hnsw index.
  - [ ] `cognitive_model_snapshots` table exists.

### S4p-T2: Apply migration + regenerate database types

- **Depends on**: S4p-T1
- **Files**: `src/types/database.ts` (regenerated), `supabase/config.toml` (if needed)
- **Agent mode**: `/implement`
- **Implementation**: run `npx supabase db push` (or the repo's equivalent) + `npx supabase gen types typescript --project-id ... > src/types/database.ts`.
- **Verification**: `npx tsc --noEmit` passes.
- **Acceptance**:
  - [ ] `Database['public']['Tables']['courses']['Row']` has `slug: string`.
  - [ ] `Database['public']['Tables']['labs']['Row']` has `slug, course_id, content_version, sandpack_files, tutor_context, generation_context_snapshot`.
  - [ ] `lab_embeddings` and `cognitive_model_snapshots` types generated.

### S4p-T3: Create `packages/shared/src/config.ts`

- **Depends on**: S4p-T2 (not strictly, but sequenced so all downstream code has one place to import from)
- **Files**: `packages/shared/src/config.ts` (new), `packages/shared/package.json` (add `./config` to exports)
- **Agent mode**: `/implement`
- **Implementation**:
  - Export as `const` (typed): `EMBEDDING_DIM = 1536`, `EMBEDDING_MODEL = 'text-embedding-3-small'`, `CHUNK_SIZE = 1000`, `RAG_K_DEFAULT = 5`, `SANDPACK_DEPS` (pinned object from v1: `react@18.2.0`, `three@0.167.1`, `@react-three/fiber`, `@react-three/drei`, `recharts`, `framer-motion`, `lucide-react`), `SANDPACK_ALLOWLIST` (string array), `LAB_QUALITY_FLOOR = 0.2`, `LAB_QUALITY_DECAY = 0.05`.
  - Comments: why this file exists (v1 lesson: dimension/pin drift across 7+ files).
- **Verification**: `grep -rn "1536\|text-embedding-3-small" src/ worker/ packages/` should only match this one file after S4'.
- **Acceptance**:
  - [ ] File exists, all constants exported.
  - [ ] `package.json` adds `"./config": "./src/config.ts"` to exports.
  - [ ] `import { EMBEDDING_DIM } from '@muto/shared/config'` type-checks from `worker/` and `src/`.

### S4p-T4: Slug helpers + `getCourseBySlug`

- **Depends on**: S4p-T2
- **Files**:
  - `src/lib/utils/slug.ts` (new) — `slugify(str): string` and `ensureUniqueSlug(base, existsFn): Promise<string>`.
  - `src/lib/actions/courses.ts` — add `getCourseBySlug(slug: string)`, update `createCourse` to generate slug at insert.
- **Agent mode**: `/implement`
- **Implementation**: slugify uses the same regex as migration backfill (`lower(regexp_replace(... '[^a-zA-Z0-9]+' '-'))`). Collision handler appends `-2`, `-3`, etc.
- **Verification**: unit test `src/lib/utils/slug.test.ts` covering `slugify('K-Means: Choosing K') === 'k-means-choosing-k'`, collision retry appends suffix, strips leading/trailing hyphens.
- **Acceptance**:
  - [ ] `slugify` and `ensureUniqueSlug` exported with JSDoc.
  - [ ] `createCourse` persists a slug.
  - [ ] `getCourseBySlug` scoped to `(institution_id, created_by)` via current user.

### S4p-T5: `getLabBySlug` + maintain `labs.course_id` denorm

- **Depends on**: S4p-T4
- **Files**: `src/lib/actions/labs.ts`, any lab-creation path (propose-plan processor).
- **Agent mode**: `/implement`
- **Implementation**:
  - `getLabBySlug(courseSlug, labSlug)` — one query joining `labs → courses` on `course_id`. Returns `{ lab, course: { slug } }` so pages can redirect on mismatch.
  - Lab creation writes `course_id` denorm column from its module's course.
  - Keep `getLab(uuid)` for internal callers.
- **Verification**: seed a lab, `getLabBySlug('intro-quantum-abc123','bell-states-def456')` returns the row; a deliberate mismatch returns null (page layer handles redirect).
- **Acceptance**:
  - [ ] Function signature matches plan.
  - [ ] Every code path that inserts into `labs` sets `course_id`.

### S4p-T6: Rename route folders

- **Depends on**: S4p-T5
- **Files**: every folder under `src/app/(dashboard)/professor/courses/[courseId]/` and `.../student/courses/[instanceId]/`.
- **Agent mode**: `/implement`
- **Implementation**:
  - `[courseId]` → `[courseSlug]` everywhere. `[labId]` → `[labSlug]`. `[instanceId]` → `[instanceSlug]`.
  - Each `page.tsx` reads the slug param, calls `getCourseBySlug` or `getLabBySlug`, and on cross-course mismatch calls `redirect(`/professor/courses/${actualSlug}/labs/${labSlug}`)` (returns 307 — accept per plan §2 note).
  - Update every internal `Link` / `router.push` call site. Grep for `/professor/courses/${` and `/student/courses/${`.
  - Update `src/lib/actions/*` return types that currently surface `courseId`/`labId` in hrefs.
- **Verification**: `npx tsc --noEmit` + `npm run lint` + manual click-through on the dashboard shows no UUIDs in the address bar.
- **Acceptance**:
  - [ ] Grep `\[courseId\]|\[labId\]|\[instanceId\]` under `src/app/` returns zero hits.
  - [ ] No hardcoded UUID-shaped hrefs remain.

### S4p-T7: UUID→slug middleware

- **Depends on**: S4p-T6
- **Files**: `src/middleware.ts` (new or extend).
- **Agent mode**: `/implement`
- **Implementation**:
  - Matcher `/(professor|student)/courses/:path*`.
  - Regex-detect UUID segment (`/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/`).
  - Resolve to slug via a small server-only Supabase query (service role). 308 permanent redirect.
  - Never match a path that's already slug-only — prevents loops.
- **Verification**: unit test with mocked `NextRequest`. Hitting `/professor/courses/<uuid>/materials` redirects to `/professor/courses/<slug>/materials`. Hitting `/professor/courses/<slug>/materials` passes through.
- **Acceptance**:
  - [ ] Middleware file exists with matcher config.
  - [ ] Unit test in `src/middleware.test.ts` covers both happy path and pass-through.

### S4p-T8: E2E smoke

- **Depends on**: S4p-T7
- **Files**: `tests/e2e/slug-routing.spec.ts` (new — if Playwright exists; else manual checklist in sprint notes).
- **Agent mode**: `/verify`
- **Implementation**:
  - Upload a PDF via existing dev-auth flow.
  - Navigate course list → click a course → URL is slug-based.
  - Paste a mismatched course/lab combo → 307 to correct course.
  - Paste a raw UUID → 308 to slug.
- **Acceptance**:
  - [ ] All three checks pass locally.
  - [ ] No regression: parse_materials still claims and processes (unchanged pipeline).

#### S4p-T8 Verification Results

Playwright not installed → manual checklist per plan fallback.

**Automated (PASS):**
- [x] `npx tsc --noEmit` — 0 errors
- [x] `npm run lint` — 0 errors (7 pre-existing warnings, unchanged)
- [x] `npx jest` — 10/10 middleware unit tests pass
- [x] No `[courseId]`/`[labId]`/`[instanceId]` route folders under `src/app/` (grep clean)
- [x] No `.eq('slug', ...)` on `courses` or `course_instances` tables in server actions — all use `display_slug`
- [x] Middleware matcher configured for `/professor/courses/:path*` and `/student/courses/:path*`

**Manual (run against `npm run dev` + local Supabase):**

1. **Slug-based navigation**
   - Log in via dev-auth (`/dev/login`)
   - Go to `/professor/courses` → click any course card
   - Expected: address bar shows `/professor/courses/{display_slug}`, no UUID

2. **Mismatch redirect (307)**
   - While on a lab page, manually edit the URL to swap the course slug for a different valid course slug (one that doesn't own the lab)
   - Expected: Next.js 307 redirect to the correct course slug for that lab

3. **UUID → slug redirect (308)**
   - Copy a raw course UUID from the Supabase dashboard (or `SELECT id FROM courses LIMIT 1`)
   - Navigate to `/professor/courses/{raw-uuid}`
   - Expected: middleware issues 308, address bar resolves to `/professor/courses/{display_slug}`
   - Repeat for `/student/courses/{raw-instance-uuid}`

4. **Pipeline regression**
   - Upload a PDF on any course's materials tab
   - Watch Railway worker logs: `parse_materials` job should claim and process without error
   - Expected: no change in pipeline behavior (middleware and display_slug are read-only from the worker's perspective)
