# Sprint S2: UX/UI Optimization

**Goal**: Build app shell + core happy-path UX for both professor and student sides — from "professor uploads a PDF" to "student takes a Knowledge Review and chats with the tutor."

**Estimated sessions**: 18 tasks, ~10–14 implementation sessions

**Prerequisites**:
- Sprint S1 complete (materials upload, parse, propose plan, plan review, approval all functional)
- `.claude/plans/ux-optimization.md` (the source plan) exists and has been read by Opus

**Out of scope** (deferred to later sprints): real SSO auth, lab generation processor (S3), insight reports, chat RAG retrieval, KaTeX math rendering, mobile-optimized layouts.

## Dependency Graph

```
S2-T1 (primitives) ──┐
                     ├──→ S2-T2 (shell) ──┐
S2-T3 (RLS migr) ────┘                    ├──→ S2-T4 (auth stub) ──┐
                                          │                         │
                                          │   ┌─→ S2-T5 (course list) ─→ S2-T6 (course home)
                                          │   │                              │
                                          │   │   ┌────────────────────────┬─┴─┬──────────────┐
                                          │   │   ↓                        ↓   ↓              ↓
                                          ├───┤   S2-T7 (materials polish) │  S2-T11 (instances)
                                          │   │                            │
                                          │   │   S2-T8 (source attach) ─→ S2-T9 (reorder/jobs)
                                          │   │                            │
                                          │   │   S2-T10 (lab list/detail)─┘
                                          │   │
                                          │   └─→ S2-T12 (student join) ─→ S2-T13 (student home)
                                          │                                    │
                                          │                                    ↓
                                          │                              S2-T14 (lab viewer)
                                          │                                    │
                                          │                              ┌─────┼─────┐
                                          │                              ↓     ↓     │
                                          │                        S2-T15 (reviews) │
                                          │                              ↓           │
                                          │                        S2-T16 (review UI)│
                                          │                                          ↓
                                          │                                  S2-T17 (chat UI)
                                          ↓
                                  ALL ──→ S2-T18 (integration check)
```

## Parallelization Hints
- After **T1+T2+T3+T4** (foundation), these can run in parallel: **T5/T11/T12** (different routes)
- After **T5**: **T6, T7, T10, T11** in parallel
- After **T6**: **T8, T9** in parallel (both touch plan editor but different concerns)
- After **T13**: **T14** (single thread)
- After **T14**: **T15+T16** sequential, **T17** parallel to T15+T16

---

## Tasks

### S2-T1: Design System Primitives

Build reusable UI primitives that every page will use: toaster, page header, empty state, loading skeletons, breadcrumb context.

- **Depends on**: none
- **Files**:
  - `src/app/layout.tsx` (modify — mount Toaster from sonner)
  - `src/components/shell/page-header.tsx` (create)
  - `src/components/shell/empty-state.tsx` (create)
  - `src/components/shell/loading-skeleton.tsx` (create)
  - `src/lib/utils/breadcrumb-context.tsx` (create)
- **Schema tables**: none
- **Agent mode**: `/implement`
- **Context to load**:
  - `CLAUDE.md`
  - `.claude/plans/ux-optimization.md` (U1 section, lines covering "Design System")
  - `src/components/ui/sonner.tsx` (the installed Toaster wrapper)
  - `src/components/ui/card.tsx`, `src/components/ui/button.tsx` (style reference)
  - `src/app/layout.tsx` (current root layout)
- **Token budget**: medium
- **Verification**:
  ```bash
  cd /home/deanomeano/muto && npx tsc --noEmit && npm run build 2>&1 | tail -5
  ```
- **Acceptance criteria**:
  - [ ] `<Toaster />` mounted in root layout (sonner)
  - [ ] `<PageHeader title actions?>` exists with consistent spacing
  - [ ] `<EmptyState icon? title description action?>` renders with all-optional props except title+description
  - [ ] `<SkeletonCard />`, `<SkeletonRow />`, `<SkeletonText lines={n} />` exported from loading-skeleton
  - [ ] `BreadcrumbContext` exports a Provider + a hook `useBreadcrumbLabels()` returning a `Record<string, string>` keyed by path segment
  - [ ] `npx tsc --noEmit` PASS, `npm run build` PASS

---

### S2-T2: Shell Composition (Sidebar + Top Bar + Layouts)

Wire primitives into a real app shell. Replace placeholder layouts with sidebar + top bar + breadcrumbs.

- **Depends on**: S2-T1
- **Files**:
  - `src/components/shell/sidebar.tsx` (create — role-aware nav, takes `role` and optional `courseContext`)
  - `src/components/shell/top-bar.tsx` (create — breadcrumbs left, user menu right)
  - `src/components/shell/breadcrumbs.tsx` (create — derives from `usePathname()` + label injection)
  - `src/app/(dashboard)/layout.tsx` (modify — wrap children in shell)
  - `src/app/(dashboard)/professor/layout.tsx` (modify — pass role='professor' to shell)
  - `src/app/(dashboard)/student/layout.tsx` (create — pass role='student' to shell)
- **Schema tables**: none (auth/role lookup is stubbed in T4)
- **Agent mode**: `/implement`
- **Context to load**:
  - `CLAUDE.md`
  - `.claude/plans/ux-optimization.md` (U1 section)
  - `src/app/(dashboard)/layout.tsx`, `src/app/(dashboard)/professor/layout.tsx` (current state)
  - `src/components/shell/page-header.tsx`, `src/lib/utils/breadcrumb-context.tsx` (from T1)
  - `src/components/ui/dropdown-menu.tsx` (for user menu)
  - `src/components/ui/separator.tsx` (sidebar dividers)
- **Token budget**: medium
- **Implementation notes**:
  - Sidebar accepts `role: 'professor' | 'student'` and optional `courseContext: { id, title }` for nested nav
  - Professor sidebar: "Courses" top-level; when in a course, nested: Overview, Materials, Plan, Labs, Instances
  - Student sidebar: "My Courses" top-level; when in a course, nested: Overview, Labs (flat)
  - Top bar sticky, ~56px high, breadcrumbs left, user-menu right (sign out, dev role switcher placeholder for now)
  - Don't fetch user yet — accept a `user?: { id, name }` prop (will be wired in T4)
- **Verification**:
  ```bash
  cd /home/deanomeano/muto && npx tsc --noEmit && npm run build 2>&1 | tail -10
  ```
  Manual: `/professor/courses/SEEDID/materials` shows real sidebar with active link state.
- **Acceptance criteria**:
  - [ ] Sidebar renders with active link highlighted based on current path
  - [ ] Breadcrumbs derive from path AND respect injected labels via BreadcrumbContext
  - [ ] Both `professor/layout.tsx` and `student/layout.tsx` wrap children with shell + correct role
  - [ ] `npx tsc --noEmit` PASS, `npm run build` PASS

---

### S2-T3: RLS Migration for Student-Facing Tables

Many student-facing tables (review_sessions, review_responses, concept_evaluations, chat_sessions, chat_messages, enrollments) need RLS policies that allow self-access. Verify what exists; add what's missing.

- **Depends on**: none (can run in parallel with T1+T2)
- **Files**:
  - `supabase/migrations/00X_student_rls.sql` (create — number based on next available)
- **Schema tables**: `enrollments`, `review_sessions`, `review_responses`, `concept_evaluations`, `chat_sessions`, `chat_messages`, `course_instances`, `course_staff`
- **Agent mode**: `/generate-migration`
- **Context to load**:
  - `CLAUDE.md`
  - `SCHEMA.md` lines 95-145 (course_instances, course_staff, enrollments)
  - `SCHEMA.md` lines 279-332 (review_sessions through concept_evaluations)
  - `SCHEMA.md` lines 372-399 (chat_sessions, chat_messages)
  - `.claude/plans/ux-optimization.md` (RLS Considerations section)
  - `supabase/migrations/` (list existing files to determine next number; read latest to match style)
- **Token budget**: medium
- **Implementation notes**:
  - Before writing, run `ls supabase/migrations/` and read the latest migration to match SQL style
  - For each table, check `pg_policies` is the source of truth — `\d+ tablename` in psql shows existing policies. Only add missing ones.
  - Policies needed (per `.claude/plans/ux-optimization.md` RLS table):
    - `enrollments`: SELECT self; INSERT self (joinCourse); DELETE owner of instance
    - `review_sessions`, `review_responses`: SELECT self OR course owner; INSERT self
    - `concept_evaluations`: SELECT self (student) OR course owner; INSERT service-role only
    - `chat_sessions`, `chat_messages`: SELECT self OR course staff (read-only); INSERT self
  - "Self" = `auth.uid() = (SELECT user_id FROM enrollments WHERE id = enrollment_id)` for tables with `enrollment_id`
  - "Course owner/staff" = `auth.uid()` is in `course_staff` for the parent course_instance OR is `courses.created_by`
- **Verification**:
  ```bash
  cd /home/deanomeano/muto && supabase db reset 2>&1 | tail -5
  # Then check policies exist:
  echo "SELECT tablename, policyname FROM pg_policies WHERE schemaname='public' AND tablename IN ('enrollments','review_sessions','review_responses','concept_evaluations','chat_sessions','chat_messages') ORDER BY tablename, policyname;" | supabase db execute
  ```
- **Acceptance criteria**:
  - [ ] Migration applies cleanly via `supabase db reset`
  - [ ] All 6 student-facing tables have at least one SELECT and one INSERT policy
  - [ ] Policies use `auth.uid()` checks, not `true`
  - [ ] No policy uses `USING (true)` or `WITH CHECK (true)`

---

### S2-T4: Auth Stub Helper + Dev Login + Middleware

Centralize "who's logged in and what role." Add a dev login page that picks from seeded users. Add middleware that gates `(dashboard)/*`.

- **Depends on**: S2-T2
- **Files**:
  - `src/lib/auth.ts` (create — `getCurrentUser`, `requireProfessor`, `requireStudent`, `getUserRole`)
  - `src/types/auth.ts` (create — `UserRole = 'professor' | 'student'`)
  - `src/app/login/page.tsx` (create — dev login)
  - `src/middleware.ts` (create — protect `(dashboard)/*`, allow `/`, `/login`, `/join/*`)
- **Schema tables**: `users`, `courses`, `course_staff`, `enrollments`
- **Agent mode**: `/implement`
- **Context to load**:
  - `CLAUDE.md`
  - `SCHEMA.md` lines 60-78 (users), lines 79-92 (courses), lines 111-125 (course_staff), lines 128-140 (enrollments)
  - `.claude/plans/ux-optimization.md` (U2 section)
  - `src/lib/supabase/server.ts`, `src/lib/supabase/admin.ts` (existing client setup)
  - `src/lib/actions/materials.ts` lines 1-50 (existing auth helper pattern to mirror)
- **Token budget**: medium
- **Implementation notes**:
  - Role determination: derive, don't store. User is "professor" if they own ≥1 course OR are in `course_staff` with role=professor. Otherwise "student" if in any `enrollments`. Default professor if both.
  - `requireProfessor()` and `requireStudent()` in server components: redirect to `/login` if unauthed, redirect to opposite-role dashboard if wrong role.
  - Server actions still throw `'Unauthorized'` (don't redirect from actions).
  - Dev login page: lists all rows from `users` table (admin client), click sets `sb-access-token` cookie via Supabase admin auth API.
  - **Document loudly** in `src/app/login/page.tsx` and `src/lib/auth.ts`: "DEV-ONLY. Replace with SAML SSO sprint."
  - Middleware: redirect `(dashboard)/*` → `/login?next=...` if no auth cookie. Allow `/`, `/login`, `/join/[code]` through.
- **Verification**:
  ```bash
  cd /home/deanomeano/muto && npx tsc --noEmit && npm run build 2>&1 | tail -5
  ```
  Manual: `/login` lists seeded users; selecting one sets session; `/professor/courses` accessible; signing out and visiting again redirects to login.
- **Acceptance criteria**:
  - [ ] `getCurrentUser()` returns `{ id, email, name, role }` or null
  - [ ] `requireProfessor()` and `requireStudent()` redirect appropriately
  - [ ] Middleware blocks `(dashboard)/*` for unauthed users
  - [ ] Dev login lists seeded users from DB and switching changes the session
  - [ ] `npx tsc --noEmit` PASS, `npm run build` PASS

---

### S2-T5: Professor Course List + Create

Professor's home base. Lists courses; "New Course" CTA front and center.

- **Depends on**: S2-T4
- **Files**:
  - `src/lib/actions/courses.ts` (create — `createCourse`, `listCoursesForProfessor`, `getCourse`)
  - `src/app/(dashboard)/professor/courses/page.tsx` (create — server component)
  - `src/app/(dashboard)/professor/courses/new/page.tsx` (create)
  - `src/components/professor/course-create-form.tsx` (create — client)
  - `src/components/professor/course-card.tsx` (create)
- **Schema tables**: `courses`, `modules`, `labs`, `course_instances`, `enrollments`
- **Agent mode**: `/implement`
- **Context to load**:
  - `CLAUDE.md`
  - `SCHEMA.md` lines 79-92 (courses), 143-156 (modules), 158-178 (labs), 95-125 (course_instances + course_staff)
  - `.claude/plans/ux-optimization.md` (U3 section)
  - `src/lib/auth.ts` (from T4)
  - `src/lib/supabase/server.ts`, `src/lib/supabase/admin.ts`
  - `src/lib/actions/materials.ts` (Server Action pattern to mirror)
  - `src/components/shell/page-header.tsx`, `src/components/shell/empty-state.tsx` (from T1)
- **Token budget**: medium
- **Implementation notes**:
  - `createCourse` Zod-validates `{ title (min 3), subjectArea? (max 100), description? (max 1000) }`. Inserts row. Redirects to `/professor/courses/[id]`. Toast on success.
  - `listCoursesForProfessor` uses a single SQL with subquery counts — no N+1. Returns `{ id, title, description, subject_area, created_at, module_count, lab_count, active_instance_count, enrolled_student_count }`.
  - Course list: empty state when zero courses ("You haven't created any courses yet"). Otherwise grid of `<CourseCard>`.
  - Course card: title (link), subject_area badge, "{N modules · N labs · N students}" muted, status pill if plan active.
  - Inject course title into BreadcrumbContext on the course detail pages (handled in T6+).
- **Verification**:
  ```bash
  cd /home/deanomeano/muto && npx tsc --noEmit && npm run build 2>&1 | tail -10
  ```
  Manual: visit `/professor/courses`, see empty state; click "New Course", fill form, submit; verify redirect + toast + new card visible.
- **Acceptance criteria**:
  - [ ] `/professor/courses` renders course list with stats
  - [ ] Empty state visible when no courses owned
  - [ ] "New Course" form validates with Zod, redirects + toasts on success
  - [ ] Course card stats accurate (verify against DB)
  - [ ] `npx tsc --noEmit` PASS, `npm run build` PASS

---

### S2-T6: Professor Course Home (Overview + Next Step Card)

Course home with the Next Step card — the dynamic CTA that tells the professor what to do next.

- **Depends on**: S2-T5
- **Files**:
  - `src/app/(dashboard)/professor/courses/[courseId]/page.tsx` (create — server)
  - `src/components/professor/course-overview.tsx` (create)
  - `src/components/professor/next-step-card.tsx` (create — derives state, renders the CTA)
- **Schema tables**: `courses`, `source_materials`, `generation_plans`, `generation_jobs`, `modules`, `labs`, `course_instances`, `enrollments`
- **Agent mode**: `/implement`
- **Context to load**:
  - `CLAUDE.md`
  - `SCHEMA.md` lines 79-92 (courses), 181-196 (source_materials), 407-482 (generation_jobs + generation_plans), 158-178 (labs)
  - `.claude/plans/ux-optimization.md` (U4 section — see "Next Step card" decision tree)
  - `src/lib/actions/courses.ts` (from T5 — add `getCourseOverview(courseId)` here OR in this task's actions)
  - `src/lib/auth.ts` (from T4)
  - `src/components/shell/page-header.tsx`, `src/components/shell/loading-skeleton.tsx`
  - `src/lib/utils/breadcrumb-context.tsx` (inject course title)
- **Token budget**: medium
- **Implementation notes**:
  - Add `getCourseOverview(courseId)` to `src/lib/actions/courses.ts`. Returns `{ course, materialsCount, parsedCount, planStatus, labsCount, generatingCount, completedLabsCount, instancesCount }` in one query batch.
  - **Next Step decision tree** (priority order — first match wins):
    1. `materialsCount === 0` → "Upload course materials to begin" → link to `/materials`
    2. `parsedCount < materialsCount` → "Parsing X of Y materials..." with progress (no link)
    3. `planStatus === 'draft'` → "Review and approve your generation plan" → link to `/plan`
    4. `planStatus === 'generating'` → "Generating N labs (X of N complete)" → link to `/labs`
    5. `labsCount > 0 && instancesCount === 0` → "Create a course instance to share with students" → link to `/instances`
    6. Else → "Course is live. Share your join code." (show top-most active instance's join code)
  - Pipeline status grid: 4 cards (Materials, Plan, Labs, Students). Each links to its detail page. Click whole card.
  - Course title editable inline (use `<Input>` toggle on click → save on blur). Update via `updateCourse({ id, title })` action — add to courses.ts.
- **Verification**:
  ```bash
  cd /home/deanomeano/muto && npx tsc --noEmit && npm run build 2>&1 | tail -5
  ```
  Manual: create empty course, verify Next Step says "Upload materials"; upload a PDF, verify "Parsing..."; etc.
- **Acceptance criteria**:
  - [ ] Course home renders all 6 Next Step states correctly (test each by manipulating DB state)
  - [ ] Pipeline grid shows accurate counts
  - [ ] Course title rename works inline + persists + toasts
  - [ ] Course title appears in breadcrumb (not UUID)

---

### S2-T7: Materials Page Polish

Toast feedback, "continue to plan" CTA when parsing finishes, course title in breadcrumb.

- **Depends on**: S2-T6
- **Files** (modify only):
  - `src/components/material-upload.tsx`
  - `src/components/material-list.tsx`
  - `src/app/(dashboard)/professor/courses/[courseId]/materials/page.tsx`
- **Schema tables**: `source_materials`, `generation_jobs`, `generation_plans`
- **Agent mode**: `/implement`
- **Context to load**:
  - `CLAUDE.md`
  - `.claude/plans/ux-optimization.md` (U5 section)
  - `src/components/material-upload.tsx`, `src/components/material-list.tsx`, `src/app/(dashboard)/professor/courses/[courseId]/materials/page.tsx` (current files)
  - `src/components/shell/page-header.tsx`, `src/lib/utils/breadcrumb-context.tsx` (from T1)
- **Token budget**: small
- **Implementation notes**:
  - Replace `setError` and `setSuccessMsg` calls in `material-upload.tsx` with `toast.error` / `toast.success`. Remove the inline error/success `<p>` elements.
  - In `material-list.tsx`, add `toast` on delete success/error. Remove `alert()` call.
  - At the bottom of `material-list.tsx`: render a CTA card if all materials have parseJob.status === 'completed'. Card text varies based on whether plan exists:
    - No plan yet: "Materials parsed. Plan being proposed..." (muted, no link)
    - Plan in draft: "Plan ready for review →" → link to `/plan`
    - Plan generating/done: "Generation in progress →" → link to `/plan` (which shows progress)
  - Page-level: use `<PageHeader title="Course Materials" />` and inject course title into BreadcrumbContext.
- **Verification**:
  ```bash
  cd /home/deanomeano/muto && npx tsc --noEmit && npm run build 2>&1 | tail -5
  ```
  Manual: upload a file, verify toast (not inline message); delete a file, verify toast.
- **Acceptance criteria**:
  - [ ] Upload success/error use toasts only (no inline messages)
  - [ ] Delete success/error use toasts (no `alert()`)
  - [ ] CTA appears at correct time based on plan status
  - [ ] Course title in breadcrumb

---

### S2-T8: Source-Material Attachment UX (Plan Editor)

Fix the biggest current UX gap: lab cards show source IDs but no UI to attach/detach materials.

- **Depends on**: S2-T6 (course home for navigation context)
- **Files**:
  - `src/components/plan-review/source-picker.tsx` (create — Popover with checklist)
  - `src/components/plan-review/lab-card.tsx` (modify — replace "{N source(s)}" with chips + picker)
  - `src/lib/actions/generation.ts` (modify — add `getSourceMaterialsForCourse(courseId)`)
- **Schema tables**: `source_materials`, `generation_plans`
- **Agent mode**: `/implement`
- **Context to load**:
  - `CLAUDE.md`
  - `SCHEMA.md` lines 181-196 (source_materials)
  - `.claude/plans/ux-optimization.md` (U6 section, especially "Source-material attachment is the biggest UX gap")
  - `src/components/plan-review/lab-card.tsx` (current file)
  - `src/lib/actions/generation.ts` (current file — extend, don't rewrite)
  - `src/types/generation.ts` (PlanLab type)
  - `src/components/ui/dropdown-menu.tsx` (use as Popover proxy if no Popover installed; check for `popover.tsx`)
- **Token budget**: medium
- **Implementation notes**:
  - `getSourceMaterialsForCourse(courseId)` — returns `[{ id, file_name, file_type }]` for the course.
  - `<SourcePicker labCourseSourceMaterials selectedIds onChange>` — DropdownMenu with checkbox items per material. Multi-select. Stays open until user clicks outside.
  - In `lab-card.tsx`, replace the "{N source(s)}" muted text with:
    - Chips: filename badges (one per `source_material_ids` entry); each has detach `x`. If filename not yet loaded, show truncated UUID.
    - "+ Source" button next to chips → opens SourcePicker
  - Pass `availableSourceMaterials` from `<PlanEditor>` down through `<ModuleCard>` to `<LabCard>` to avoid each card refetching.
  - Update `PlanEditor` to fetch source materials once on mount via `getSourceMaterialsForCourse`.
- **Verification**:
  ```bash
  cd /home/deanomeano/muto && npx tsc --noEmit && npm run build 2>&1 | tail -5
  ```
  Manual: open plan page, click "+ Source" on a lab, attach a material, verify chip appears + persist via Save Draft.
- **Acceptance criteria**:
  - [ ] Source-material chips appear on each lab card with detach button
  - [ ] Source picker opens with full course materials list, multi-select works
  - [ ] Attaching/detaching updates lab's `source_material_ids` and persists via Save Draft
  - [ ] `npx tsc --noEmit` PASS, `npm run build` PASS

---

### S2-T9: Drag-Reorder + Per-Lab Job Mapping (Plan Editor)

Add drag-to-reorder for modules and labs. Wire per-lab progress badges to real lab IDs after approval.

- **Depends on**: S2-T6
- **Files**:
  - `src/components/plan-review/sortable-list.tsx` (create — `@dnd-kit` wrapper)
  - `src/components/plan-review/module-card.tsx` (modify — drag handle, sortable labs)
  - `src/components/plan-review/plan-editor.tsx` (modify — sortable modules + lab→job mapping)
  - `src/lib/actions/generation.ts` (modify — add `getLabsForCourse(courseId)`)
  - `package.json` (modify — add `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`)
- **Schema tables**: `labs`, `modules`, `generation_jobs`, `generation_plans`
- **Agent mode**: `/implement`
- **Context to load**:
  - `CLAUDE.md`
  - `SCHEMA.md` lines 158-178 (labs), 143-156 (modules)
  - `.claude/plans/ux-optimization.md` (U6 section, "Drag reorder" and "Per-lab progress mapping")
  - `src/components/plan-review/plan-editor.tsx`, `src/components/plan-review/module-card.tsx` (current files)
  - `src/lib/actions/generation.ts` (current file — extend)
- **Token budget**: large
- **Implementation notes**:
  - Install `@dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities` first via npm.
  - `<SortableList items renderItem onReorder>` wraps `DndContext` + `SortableContext`. Generic over item type with `id` field.
  - In `module-card.tsx`, add drag handle (small `≡` icon button) to module header. Wrap labs in `<SortableList>`.
  - In `plan-editor.tsx`, wrap modules in `<SortableList>`.
  - **Reorder semantics**: local state update + autosave silently (no confirmation needed). Use `toast.promise` for the save call.
  - **Per-lab job mapping**: when `plan.status === 'generating'` or `'completed'`, fetch labs via `getLabsForCourse(plan.course_id)`. Build map `Map<{moduleIdx, labIdx}, lab_id>` by matching `module.position` and `lab.position`. Look up `labJobs[lab_id]` and pass to `LabCard`.
  - `getLabsForCourse(courseId)` returns `[{ id, module_id, position, generation_status, modules: { position } }]` — flat array sorted by `modules.position, labs.position`.
- **Verification**:
  ```bash
  cd /home/deanomeano/muto && npx tsc --noEmit && npm run build 2>&1 | tail -5
  ```
  Manual: open draft plan, drag a lab to reorder, refresh, verify order persists. After approval (use a fake `status='generating'` plan for testing), verify per-lab progress bars show.
- **Acceptance criteria**:
  - [ ] Modules and labs can be reordered via drag
  - [ ] Reorder autosaves with toast feedback
  - [ ] After approval, per-lab progress badges populate correctly via lab_id mapping
  - [ ] Approval dialog warns about labs with empty `source_material_ids`
  - [ ] `npx tsc --noEmit` PASS, `npm run build` PASS

---

### S2-T10: Professor Lab List + Detail (Preview + Regenerate)

Once labs exist, professor can see them, preview content, trigger regeneration.

- **Depends on**: S2-T6
- **Files**:
  - `src/lib/actions/labs.ts` (create — `listLabsForCourse`, `getLab`, `regenerateLab`)
  - `src/app/(dashboard)/professor/courses/[courseId]/labs/page.tsx` (create — list grouped by module)
  - `src/app/(dashboard)/professor/courses/[courseId]/labs/[labId]/page.tsx` (create — detail/preview)
  - `src/components/professor/lab-list-item.tsx` (create)
  - `src/components/professor/lab-preview.tsx` (create — renders content sections)
- **Schema tables**: `labs`, `concepts`, `modules`, `generation_jobs`, `source_materials`
- **Agent mode**: `/implement`
- **Context to load**:
  - `CLAUDE.md`
  - `SCHEMA.md` lines 158-178 (labs), 235-254 (concepts), 143-156 (modules), 407-437 (generation_jobs)
  - `.claude/plans/ux-optimization.md` (U7 section)
  - `src/types/generation.ts` (LabContent type)
  - `src/lib/auth.ts`, `src/lib/supabase/server.ts`, `src/lib/supabase/admin.ts`
  - `src/components/ui/tabs.tsx`, `src/components/ui/badge.tsx`, `src/components/ui/dialog.tsx` (regenerate confirm)
  - `src/components/shell/page-header.tsx`
- **Token budget**: large
- **Implementation notes**:
  - `listLabsForCourse(courseId)` returns labs joined with module title + position, ordered by `modules.position, labs.position`. Includes `generation_status` and concept count.
  - `getLab(labId)` returns full lab + concepts + source_materials. Verifies professor access.
  - `regenerateLab(labId)` creates a new `generation_jobs` row of `job_type='generate_lab'` with `input_payload: { lab_id, ... }`. Worker overwrites existing content.
  - Lab list page: section per module (use module title as `<h2>`), `<LabListItem>` rows below. Status badge per lab (pending/generating/complete/failed).
  - Lab detail page: 3 tabs (Content / Concepts / Source Materials). Content tab uses `<LabPreview>` rendering `lab.content.sections[]` in Bloom's order with level pills. Concepts tab lists concept names + status. Sources tab shows filename chips.
  - "Regenerate" button confirms cost in dialog → calls `regenerateLab` → toast.
  - If `generation_status='failed'`, show error from latest `generation_jobs` row + Retry button (= regenerate).
- **Verification**:
  ```bash
  cd /home/deanomeano/muto && npx tsc --noEmit && npm run build 2>&1 | tail -5
  ```
  Manual: seed a lab with `content` JSON, navigate to lab detail, verify all 3 tabs render.
- **Acceptance criteria**:
  - [ ] Lab list grouped by module with status badges
  - [ ] Lab detail tabs (Content/Concepts/Sources) all render
  - [ ] Content sections rendered in Bloom's order with level pills
  - [ ] Regenerate creates new job + toast (verify in `generation_jobs` table)
  - [ ] `npx tsc --noEmit` PASS, `npm run build` PASS

---

### S2-T11: Course Instance Management (Join Codes)

Professor creates `course_instance` per semester, gets a join code to share.

- **Depends on**: S2-T6
- **Files**:
  - `src/lib/actions/instances.ts` (create — `createInstance`, `listInstances`, `toggleInstanceActive`)
  - `src/app/(dashboard)/professor/courses/[courseId]/instances/page.tsx` (create)
  - `src/components/professor/instance-create-dialog.tsx` (create)
  - `src/components/professor/instance-card.tsx` (create)
- **Schema tables**: `course_instances`, `course_staff`, `enrollments`
- **Agent mode**: `/implement`
- **Context to load**:
  - `CLAUDE.md`
  - `SCHEMA.md` lines 95-125 (course_instances + course_staff), 128-140 (enrollments)
  - `.claude/plans/ux-optimization.md` (U8 section)
  - `src/lib/auth.ts`, `src/lib/supabase/admin.ts`
  - `src/components/ui/dialog.tsx`, `src/components/ui/input.tsx`
- **Token budget**: small
- **Implementation notes**:
  - `createInstance({ courseId, semester })` — generates a join_code (8 chars base32, exclude 0/O/1/l). Retry on collision (max 5). Builds `join_link = ${env.NEXT_PUBLIC_SITE_URL || 'https://trymuto.com'}/join/${code}`. Inserts row + creates `course_staff` entry for creator (role='professor', can_edit_structure=true).
  - `listInstances(courseId)` returns instances + enrollment counts.
  - `toggleInstanceActive(instanceId)` flips `is_active`.
  - Instance card: semester label, big mono `join_code` with copy button, copy `join_link`, student count, active/deactivated toggle.
  - Use `navigator.clipboard.writeText` + `toast.success("Copied!")` for copy buttons.
- **Verification**:
  ```bash
  cd /home/deanomeano/muto && npx tsc --noEmit && npm run build 2>&1 | tail -5
  ```
  Manual: create instance "Spring 2026", verify code generated, copy works (check clipboard), toggle deactivate, verify state persists.
- **Acceptance criteria**:
  - [ ] Create dialog generates code + persists + adds course_staff row
  - [ ] Copy buttons copy to clipboard with toast confirmation
  - [ ] Active toggle persists
  - [ ] `npx tsc --noEmit` PASS, `npm run build` PASS

---

### S2-T12: Student Join Flow

Student enters at `/join/[code]`, sees course preview, joins → enrolled, redirected to student course home.

- **Depends on**: S2-T4 (auth needed for enroll), S2-T11 (instance must exist)
- **Files**:
  - `src/lib/actions/enrollment.ts` (create — `joinCourse({ joinCode })`)
  - `src/app/join/[code]/page.tsx` (create — server component)
  - `src/components/student/join-card.tsx` (create — client)
- **Schema tables**: `course_instances`, `enrollments`, `courses`
- **Agent mode**: `/implement`
- **Context to load**:
  - `CLAUDE.md`
  - `SCHEMA.md` lines 79-92 (courses), 95-107 (course_instances), 128-140 (enrollments)
  - `.claude/plans/ux-optimization.md` (U9 section, "Server Action: joinCourse")
  - `src/lib/auth.ts`
  - `src/lib/supabase/server.ts`, `src/lib/supabase/admin.ts`
  - `src/components/ui/card.tsx`, `src/components/ui/button.tsx`
- **Token budget**: small
- **Implementation notes**:
  - `joinCourse({ joinCode })`: case-insensitive lookup. Errors: "instance not found", "course no longer accepting enrollments" (is_active=false). Idempotent if already enrolled (return success with same `instanceId`).
  - Page server component: lookup instance + course title. If unauthed, redirect to `/login?next=/join/${code}`. If authed, render `<JoinCard>`.
  - Join card: course title, semester, "Join this class" button. On click, calls `joinCourse`, redirects to `/student/courses/${instanceId}`.
- **Verification**:
  ```bash
  cd /home/deanomeano/muto && npx tsc --noEmit && npm run build 2>&1 | tail -5
  ```
  Manual: as logged-in student, visit `/join/CODE123`, click Join, verify enrollment row + redirect.
- **Acceptance criteria**:
  - [ ] Valid code shows course preview
  - [ ] Joining creates enrollment + redirects
  - [ ] Re-joining (already enrolled) redirects without error
  - [ ] Deactivated instance shows clear message
  - [ ] Unauthed user gets redirected to login with next param

---

### S2-T13: Student Course List + Course Home

Student's "My Courses" list and per-course home with module/lab tree.

- **Depends on**: S2-T12
- **Files**:
  - `src/lib/actions/enrollment.ts` (modify — add `listMyEnrollments`, `getStudentCourseView`)
  - `src/app/(dashboard)/student/courses/page.tsx` (create)
  - `src/app/(dashboard)/student/courses/[instanceId]/page.tsx` (create)
  - `src/components/student/course-tree.tsx` (create — accordion)
  - `src/components/student/lab-row.tsx` (create — single lab line)
- **Schema tables**: `course_instances`, `enrollments`, `courses`, `modules`, `labs`, `review_sessions`
- **Agent mode**: `/implement`
- **Context to load**:
  - `CLAUDE.md`
  - `SCHEMA.md` lines 79-107 (courses + course_instances), 128-140 (enrollments), 143-178 (modules + labs), 279-294 (review_sessions)
  - `.claude/plans/ux-optimization.md` (U9 section)
  - `src/lib/actions/enrollment.ts` (extend from T12)
  - `src/lib/auth.ts`
  - `src/components/shell/page-header.tsx`, `src/components/shell/empty-state.tsx`
  - `src/components/ui/accordion.tsx`
  - `src/lib/utils/breadcrumb-context.tsx` (inject course title)
- **Token budget**: medium
- **Implementation notes**:
  - `listMyEnrollments()` returns enrollment + course + instance info.
  - `getStudentCourseView(instanceId)` returns nested structure: `{ course, instance, modules: [{ ...module, labs: [{ ...lab, has_started }] }] }`. `has_started = exists review_session for this lab + enrollment`.
  - Course list: empty state if no enrollments ("Use a join code from your professor to enroll in a course").
  - Course home: accordion of modules. Each lab row shows title, "Started" badge if applicable, → arrow.
  - Inject course title into BreadcrumbContext.
- **Verification**:
  ```bash
  cd /home/deanomeano/muto && npx tsc --noEmit && npm run build 2>&1 | tail -5
  ```
  Manual: as enrolled student, visit `/student/courses`, see enrolled course; click in, see modules + labs tree.
- **Acceptance criteria**:
  - [ ] Student courses list renders enrollments
  - [ ] Course home renders nested modules → labs tree
  - [ ] "Started" badge appears for labs with at least one review_session
  - [ ] Course title in breadcrumb
  - [ ] `npx tsc --noEmit` PASS, `npm run build` PASS

---

### S2-T14: Student Lab Content Viewer

Clean reading experience for `lab.content.sections[]`. Bloom's-structured. TOC + action bar.

- **Depends on**: S2-T13
- **Files**:
  - `src/lib/actions/student-lab.ts` (create — `getLabForStudent({ instanceId, labId })`)
  - `src/app/(dashboard)/student/courses/[instanceId]/labs/[labId]/page.tsx` (create)
  - `src/components/student/lab-viewer.tsx` (create — sections renderer)
  - `src/components/student/lab-toc.tsx` (create — sticky TOC)
  - `src/components/student/lab-action-bar.tsx` (create — bottom CTAs)
- **Schema tables**: `labs`, `enrollments`, `modules`, `courses`, `course_instances`
- **Agent mode**: `/implement`
- **Context to load**:
  - `CLAUDE.md`
  - `SCHEMA.md` lines 158-178 (labs)
  - `.claude/plans/ux-optimization.md` (U10 section)
  - `src/types/generation.ts` (LabContent + LabSection types)
  - `src/lib/auth.ts`, `src/lib/supabase/server.ts`
  - `src/components/shell/page-header.tsx`
- **Token budget**: medium
- **Implementation notes**:
  - Install `react-markdown` for body rendering. Add to package.json. (No KaTeX yet — defer math; note as follow-up.)
  - `getLabForStudent({ instanceId, labId })`: verify enrollment exists, verify lab belongs to course of this instance. Return lab + module title.
  - `<LabViewer>`: maps over `content.sections`. Each section: small Bloom's-level pill, `<h2>{heading}</h2>`, `<ReactMarkdown>{body}</ReactMarkdown>`.
  - `<LabToc>`: sticky right rail (or top-collapsed on narrow). Lists section headings, click to jump (use `id` anchors).
  - `<LabActionBar>`: fixed bottom of content area. Two buttons: "Take Knowledge Review" → `/review`, "Ask the Tutor" → `/chat`.
- **Verification**:
  ```bash
  cd /home/deanomeano/muto && npx tsc --noEmit && npm run build 2>&1 | tail -5
  ```
  Manual: seed a lab with `content` JSON, visit as enrolled student, verify sections render in Bloom's order.
- **Acceptance criteria**:
  - [ ] Lab content renders with Bloom's-level pills + markdown body
  - [ ] TOC links jump to sections
  - [ ] Action bar visible with both CTAs
  - [ ] Non-enrolled user gets redirected (test with a different student)
  - [ ] `npx tsc --noEmit` PASS, `npm run build` PASS

---

### S2-T15: Reviews Server Actions

The data plane for Knowledge Reviews: start/resume session, submit response, complete session, get results.

- **Depends on**: S2-T13 (enrollment lookup), S2-T3 (RLS for review tables)
- **Files**:
  - `src/lib/actions/reviews.ts` (create)
- **Schema tables**: `review_sessions`, `review_questions`, `review_responses`, `concept_evaluations`, `enrollments`, `concepts`
- **Agent mode**: `/implement`
- **Context to load**:
  - `CLAUDE.md`
  - `SCHEMA.md` lines 256-332 (review_questions through concept_evaluations), 235-254 (concepts), 128-140 (enrollments)
  - `.claude/plans/ux-optimization.md` (U11 section, especially "Server Action contracts")
  - `src/lib/auth.ts`, `src/lib/supabase/server.ts`, `src/lib/supabase/admin.ts`
  - `src/lib/actions/materials.ts` lines 1-50 (auth helper pattern)
- **Token budget**: medium
- **Implementation notes**:
  - All actions Zod-validated.
  - `startOrResumeReview({ instanceId, labId })`:
    - Verify enrollment exists, get `enrollmentId`
    - Look for existing `review_session` with no `completed_at`, lab matches → resume
    - Else create new `review_sessions` row
    - Return `{ sessionId, questions: [{ id, question_text, blooms_level, position, answered_text? }] }` ordered by `position`
    - Question selection v1: all `is_active=true` questions for the lab in `position` order. Adaptive selection deferred.
  - `submitReviewResponse({ sessionId, questionId, answerText })`:
    - Verify session belongs to current student
    - Insert `review_responses` row (or update if already answered)
    - Return `{ success: true, nextQuestionId? }` — null if last question
  - `completeReview({ sessionId })`:
    - Set `completed_at`
    - Insert a `generation_jobs` row of `job_type='evaluate_review'` with `input_payload: { session_id }` — the eval processor is S3 work but the queue insert can happen now
    - Return `{ success: true }`
  - `getReviewResults({ sessionId })`:
    - Return `concept_evaluations` joined with `review_responses` and `review_questions` and `concepts` for display
    - **Strip `mastery_score` and `confidence` from the return** — students see only `reasoning` (per SCHEMA.md line 330)
    - Add a derived `mastery_bucket: 'on_track' | 'review_needed'` based on score (>= 0.6 = on_track) — this is what gets shown
- **Verification**:
  ```bash
  cd /home/deanomeano/muto && npx tsc --noEmit
  # Optional: write a small tsx script that calls each action against a seeded session
  ```
- **Acceptance criteria**:
  - [ ] All 4 actions exist with Zod validation
  - [ ] `getReviewResults` does NOT return raw `mastery_score` (privacy enforcement)
  - [ ] `completeReview` enqueues an `evaluate_review` job
  - [ ] `npx tsc --noEmit` PASS

---

### S2-T16: Review Take + Results UI

Student-facing review flow: question-by-question, optimistic submit, completion screen, streaming results.

- **Depends on**: S2-T15
- **Files**:
  - `src/app/(dashboard)/student/courses/[instanceId]/labs/[labId]/review/page.tsx` (create)
  - `src/components/student/review-runner.tsx` (create — main client component)
  - `src/components/student/review-question-card.tsx` (create)
  - `src/components/student/review-progress-bar.tsx` (create)
  - `src/components/student/review-completion-card.tsx` (create)
  - `src/components/student/review-results-card.tsx` (create)
- **Schema tables**: `review_sessions`, `review_questions`, `review_responses`, `concept_evaluations`
- **Agent mode**: `/implement`
- **Context to load**:
  - `CLAUDE.md`
  - `SCHEMA.md` lines 256-332 (review tables, especially line 330 about privacy)
  - `.claude/plans/ux-optimization.md` (U11 section, especially "UX flow" steps 1-7)
  - `src/lib/actions/reviews.ts` (from T15)
  - `src/lib/supabase/client.ts` (Realtime)
  - `src/components/ui/textarea.tsx`, `src/components/ui/progress.tsx`, `src/components/ui/button.tsx`
- **Token budget**: large
- **Implementation notes**:
  - Page server component: calls `startOrResumeReview`, passes data to `<ReviewRunner>`.
  - `<ReviewRunner>`: state machine. `currentIndex`, `answers: Record<questionId, string>`, `submitting`. After last question → render `<ReviewCompletionCard>`. After eval results arrive → swap to `<ReviewResultsCard>`.
  - Optimistic submit: advance immediately, persist in background. On error, toast + revert.
  - Realtime subscription on `concept_evaluations` filtered by `enrollment_id`. As rows arrive, update results state.
  - Polling fallback: if no results in 60s after completion, poll `getReviewResults` every 5s.
  - **Privacy**: results card shows `reasoning` only + `mastery_bucket` as a soft visual ("On track" / "Review this concept"). No numbers shown.
  - No timer (per plan).
- **Verification**:
  ```bash
  cd /home/deanomeano/muto && npx tsc --noEmit && npm run build 2>&1 | tail -5
  ```
  Manual: seed questions for a lab, take a review, verify resume works, verify completion screen, verify results stream in (need to manually insert concept_evaluations rows since eval processor isn't built).
- **Acceptance criteria**:
  - [ ] One-question-at-a-time flow with progress bar
  - [ ] Resume from refresh works
  - [ ] Submit is optimistic + reverts on error
  - [ ] Completion card renders after last question
  - [ ] Results card streams via Realtime (test by manually inserting concept_evaluations)
  - [ ] No raw `mastery_score` numbers visible to student
  - [ ] `npx tsc --noEmit` PASS, `npm run build` PASS

---

### S2-T17: Student Chatbot UI Shell

Chat surface — UI only, with stubbed assistant responses. Real RAG is a separate task.

- **Depends on**: S2-T14
- **Files**:
  - `src/lib/actions/chat.ts` (create — `getOrCreateChatSession`, `sendChatMessage`)
  - `src/app/(dashboard)/student/courses/[instanceId]/labs/[labId]/chat/page.tsx` (create)
  - `src/components/student/chat-window.tsx` (create — message list + composer)
  - `src/components/student/chat-message-bubble.tsx` (create)
  - `src/components/student/chat-composer.tsx` (create)
- **Schema tables**: `chat_sessions`, `chat_messages`, `enrollments`, `labs`
- **Agent mode**: `/implement`
- **Context to load**:
  - `CLAUDE.md`
  - `SCHEMA.md` lines 372-399 (chat_sessions + chat_messages), 128-140 (enrollments)
  - `.claude/plans/ux-optimization.md` (U12 section)
  - `src/lib/auth.ts`, `src/lib/supabase/server.ts`, `src/lib/supabase/admin.ts`
  - `src/lib/supabase/client.ts` (Realtime)
  - `src/components/ui/textarea.tsx`, `src/components/ui/button.tsx`
- **Token budget**: medium
- **Implementation notes**:
  - `getOrCreateChatSession({ instanceId, labId })` — verify enrollment, find or create row.
  - `sendChatMessage({ sessionId, content })`:
    - Check rate limit (50/hour, 300/day per CLAUDE.md). If `src/lib/rate-limit.ts` doesn't exist yet, stub: `async function checkChatRateLimit(userId): Promise<{ allowed: boolean, resetsAt?: Date }>` — returns `{ allowed: true }` until properly wired (mark with `// TODO: wire real rate limit`).
    - Insert student message
    - **Stub assistant response**: insert `{ role: 'assistant', content: "RAG-based responses coming soon. Your message was logged." }` after a 500ms delay
    - Mark in code: `// TODO: replace with RAG via content_embeddings (separate sprint)`
    - Return both messages
  - `<ChatWindow>`: subscribes to `chat_messages` via Realtime, renders bubbles.
  - `<ChatComposer>`: textarea + send. Enter to send, Shift+Enter for newline. Disabled while sending.
  - Rate-limit error → toast: "You've reached your hourly chat limit. Resets at HH:MM."
- **Verification**:
  ```bash
  cd /home/deanomeano/muto && npx tsc --noEmit && npm run build 2>&1 | tail -5
  ```
  Manual: open chat for a lab, send a message, verify stub assistant reply appears.
- **Acceptance criteria**:
  - [ ] Chat page loads with empty state or existing history
  - [ ] Sending a message persists + shows stubbed assistant reply
  - [ ] Realtime subscription delivers new messages
  - [ ] Rate-limit hook is wired (even if currently always allowed)
  - [ ] `npx tsc --noEmit` PASS, `npm run build` PASS

---

### S2-T18: End-to-End Integration Check

Verify the complete UX flow works: professor creates course → uploads materials → reviews plan → approves → creates instance → student joins → reads lab → takes review → chats.

- **Depends on**: ALL previous tasks
- **Files**: none (verification only). May create `tests/integration/ux-flow.test.ts` if scripted.
- **Schema tables**: all
- **Agent mode**: manual + automated
- **Context to load**:
  - `.claude/plans/ux-optimization.md` (full plan for cross-checking)
- **Token budget**: medium
- **Verification checklist**:
  ```
  Automated:
  1. cd /home/deanomeano/muto && npx tsc --noEmit            # both projects
  2. cd /home/deanomeano/muto/worker && npx tsc --noEmit
  3. cd /home/deanomeano/muto && npm run build
  4. cd /home/deanomeano/muto && npm run lint                # if configured

  Manual:
  5. supabase start; supabase db reset
  6. npm run dev; cd worker && npx tsx index.ts (separate terminal)
  7. /login → pick a seeded professor
  8. /professor/courses → "New Course" → fill form → redirect to course home
  9. Verify course home Next Step says "Upload course materials"
  10. Click → upload a PDF → verify toast + parse status
  11. Wait for parse + propose plan → verify Next Step says "Review and approve"
  12. Open plan → drag a lab → verify autosave toast
  13. Click "+ Source" on a lab → attach a material → verify chip appears
  14. Click "Approve & Generate" → confirm → verify status='generating' + per-lab progress badges
  15. Navigate to Labs → verify list grouped by module
  16. Open a lab detail → verify 3 tabs render
  17. Navigate to Instances → "New Instance" → "Spring 2026" → verify code generated
  18. Copy join code → sign out → /login → pick seeded student
  19. /join/<code> → verify course preview → click Join → redirect to student course home
  20. Click into lab → verify lab viewer renders
  21. Click "Take Knowledge Review" → answer questions → verify completion card
  22. Manually insert concept_evaluations rows in DB → verify results card streams in via Realtime, no raw scores shown
  23. Go back to lab → click "Ask the Tutor" → send a message → verify stub assistant reply
  ```
- **Acceptance criteria**:
  - [ ] All automated checks PASS
  - [ ] Manual flow steps 5-23 all complete without errors
  - [ ] No type errors (`npx tsc --noEmit` both projects)
  - [ ] Full project builds (`npm run build`)
  - [ ] Sidebar navigation correct on every page
  - [ ] Toasts appear on every save/delete/approve action
  - [ ] Breadcrumbs show real names (not UUIDs) on all course-scoped pages

---

## Notes

- **S3 (lab generation processor)** is still required to make the "approve plan" → "labs visible to students" loop fully functional. This sprint builds the UX assuming S3 is or will be done; testing T16 (review results) requires manual `concept_evaluations` inserts since the eval processor doesn't exist yet either.
- **Real auth/SSO** remains stubbed throughout this sprint. The dev login is explicitly NOT for production.
- **Math rendering (KaTeX)** in lab content is deferred. Quantum computing pilot may need it before launch — flag for post-S2 follow-up.
- **Adaptive question selection** in T15 is intentionally simple (all questions in `position` order). Adaptive logic is future work.
- **Chat RAG** is stubbed in T17. Real implementation requires the embeddings processor + content_embeddings table to be populated — separate sprint.
- **Insight reports / professor analytics dashboard** is excluded from this sprint entirely. Likely S4.

## Open Questions Carried From Plan

These were in `.claude/plans/ux-optimization.md` and are NOT resolved in this sprint:
1. Course home analytics widget — deferred (no widget; just pipeline grid)
2. Lab regeneration cost — re-charged (T10 explicitly creates a new job)
3. Adaptive question selection — deferred (T15 uses position order)
4. KaTeX math rendering — deferred (T14 plain markdown only)
5. Multi-tenant institution UI — deferred (single institution per dev env)

If any of these get re-opened, scope creep applies — flag and re-plan.
